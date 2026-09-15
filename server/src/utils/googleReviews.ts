export interface GoogleReview {
  author: string;
  rating: number;
  text: string;
  relativeDate?: string;
  profilePhotoUrl?: string;
}

interface Cache {
  data: GoogleReview[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours, to stay within SerpApi's rate limits/cost
let cache: Cache | null = null;

interface SerpApiReviewEntry {
  user?: { name?: string; link?: string; thumbnail?: string };
  rating?: number;
  description?: string;
  snippet?: string;
  date?: string;
}

// Fetches Google Maps reviews via SerpApi (https://serpapi.com/google-maps-reviews-api), if configured.
// Returns [] (never throws) when SERPAPI_API_KEY/GOOGLE_PLACE_ID are unset or the request fails, so the
// public landing page never breaks because of a third-party outage or missing credentials.
export async function getGoogleReviews(): Promise<GoogleReview[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!apiKey || !placeId) return [];

  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_maps_reviews");
    url.searchParams.set("data_id", placeId);
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`SerpApi request failed with status ${response.status}`);

    const json = (await response.json()) as { reviews?: SerpApiReviewEntry[] };
    const reviews: GoogleReview[] = (json.reviews || [])
      .filter((r) => r.user?.name && typeof r.rating === "number")
      .slice(0, 20)
      .map((r) => ({
        author: r.user!.name!,
        rating: Math.round(r.rating!),
        text: r.snippet || r.description || "",
        relativeDate: r.date,
        profilePhotoUrl: r.user?.thumbnail,
      }));

    cache = { data: reviews, fetchedAt: Date.now() };
    return reviews;
  } catch (err) {
    console.error("Failed to fetch Google reviews from SerpApi:", err);
    return cache?.data ?? [];
  }
}

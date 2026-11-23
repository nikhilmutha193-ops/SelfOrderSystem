import { describeError, logger } from "./logger";

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
  /** What the data was fetched with, so a changed key or place fetches again. */
  forKey: string;
}

export interface GoogleReviewsSource {
  apiKey: string;
  /** A Google Maps data ID (0x...:0x...) or a place ID (ChIJ...). */
  placeId: string;
}

interface SerpApiReviewEntry {
  user?: { name?: string; link?: string; thumbnail?: string };
  rating?: number;
  description?: string;
  snippet?: string;
  date?: string;
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

// 12 hours, to stay within SerpApi's rate limits/cost
const caches = new Map<string, Cache>();

export async function getGoogleReviews(
  source: GoogleReviewsSource = { apiKey: process.env.SERPAPI_API_KEY ?? "", placeId: process.env.GOOGLE_PLACE_ID ?? "" }
): Promise<GoogleReview[]> {
  const { apiKey, placeId } = source;
  if (!apiKey || !placeId) return [];

  const forKey = `${apiKey}|${placeId}`;
  const cache = caches.get(forKey);
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_maps_reviews");
    // A place ID looks like ChIJ...; a data ID like 0x3bae...:0x...
    url.searchParams.set(placeId.startsWith("ChIJ") ? "place_id" : "data_id", placeId);
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

    caches.set(forKey, { data: reviews, fetchedAt: Date.now(), forKey });
    return reviews;
  } catch (err) {
    logger.error("Failed to fetch Google reviews from SerpApi", describeError(err));
    return caches.get(forKey)?.data ?? [];
  }
}

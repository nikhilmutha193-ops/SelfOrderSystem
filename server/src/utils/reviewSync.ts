import { createHash } from "crypto";
import { Types } from "mongoose";

import GoogleReviewsConfig from "../models/GoogleReviewsConfig";
import Review from "../models/Review";
import { getGoogleReviews, GoogleReviewsSource } from "./googleReviews";
import { openSecret } from "./secretBox";

const norm = (value: string | undefined) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const sha = (value: string) => createHash("sha1").update(value).digest("hex");

/** Same name, rating and comment (ignoring case and spacing): used to drop feedback sent twice. */
export function feedbackKey(name: string, rating: number, comment: string): string {
  return sha(`${norm(name)}|${rating}|${norm(comment)}`);
}

/** Same Google author, rating and text, however often Google is fetched. */
export function googleReviewKey(author: string, rating: number, text: string): string {
  return sha(`g|${norm(author)}|${rating}|${norm(text)}`);
}

/** The SerpApi key and Google place saved in the admin, else the server's SERPAPI_API_KEY and GOOGLE_PLACE_ID. */
export async function googleSource(restaurantId: string): Promise<GoogleReviewsSource | null> {
  const saved = await GoogleReviewsConfig.findOne({ restaurantId });
  const apiKey = (saved?.apiKeyEnc && openSecret(saved.apiKeyEnc)) || process.env.SERPAPI_API_KEY || "";
  const placeId = saved?.placeId || process.env.GOOGLE_PLACE_ID || "";
  return apiKey && placeId ? { apiKey, placeId } : null;
}

export async function googleConfigured(restaurantId: string): Promise<boolean> {
  return (await googleSource(restaurantId)) !== null;
}

const lastSync = new Map<string, number>();
const SYNC_EVERY_MS = 30 * 60 * 1000;

/**
 * Brings the restaurant's Google reviews into the review list, each once. A review that is already there (shown or
 * hidden by the admin) is left exactly as it is. New ones start shown, as they were before they could be hidden.
 */
export async function syncGoogleReviews(restaurantId: string) {
  const source = await googleSource(restaurantId);
  const fetched = source ? await getGoogleReviews(source) : [];
  lastSync.set(restaurantId, Date.now());
  if (fetched.length === 0) return { fetched: 0, added: 0, duplicates: 0 };
  const rid = new Types.ObjectId(restaurantId);
  const result = await Review.bulkWrite(
    fetched.map((g) => ({
      updateOne: {
        filter: { restaurantId: rid, googleKey: googleReviewKey(g.author, g.rating, g.text) },
        update: {
          $setOnInsert: {
            restaurantId: rid,
            googleKey: googleReviewKey(g.author, g.rating, g.text),
            customerName: g.author,
            rating: g.rating,
            comment: g.text,
            relativeDate: g.relativeDate,
            profilePhotoUrl: g.profilePhotoUrl,
            source: "google",
            isApproved: true,
          },
        },
        upsert: true,
      },
    }))
  );
  const added = result.upsertedCount;
  return { fetched: fetched.length, added, duplicates: fetched.length - added };
}

/** Called by the landing page: fetches Google at most every half hour (and waits only the first time). */
export async function syncGoogleReviewsIfStale(restaurantId: string): Promise<void> {
  if (!(await googleConfigured(restaurantId))) return;
  const last = lastSync.get(restaurantId);
  if (last !== undefined && Date.now() - last < SYNC_EVERY_MS) return;
  lastSync.set(restaurantId, Date.now());
  await syncGoogleReviews(restaurantId).catch(() => undefined);
}

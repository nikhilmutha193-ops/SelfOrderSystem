import { S3Client } from "@aws-sdk/client-s3";
import { HttpError } from "../utils/httpError";

export interface R2Config {
  bucket: string;
  publicBaseUrl: string;
  /** Holds invoices and backups. Null falls back to local disk rather than risking the public bucket. */
  privateBucket: string | null;
  client: S3Client;
}

let cached: R2Config | null = null;

/** Null when R2 isn't configured, so local/Docker runs fall back to disk storage. */
export function getR2(): R2Config | null {
  if (cached) return cached;
  if (!process.env.R2_BUCKET) return null;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  // Fail loudly rather than silently writing to a read-only serverless disk.
  if (!accountId || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    throw new HttpError(
      500,
      "R2_BUCKET is set but R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY or R2_PUBLIC_BASE_URL is missing",
    );
  }

  cached = {
    bucket: process.env.R2_BUCKET,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
    privateBucket: process.env.R2_PRIVATE_BUCKET || null,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return cached;
}

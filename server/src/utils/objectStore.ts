import fs from "fs";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { getR2 } from "../config/r2";
import { HttpError } from "./httpError";

export type Folder = keyof typeof FOLDERS;

export const FOLDERS = {
  banner: "Banner",
  logo: "Logo",
  product: "Product Image",
  team: "Team",
  awards: "Awards",
  invoices: "Invoices",
  backups: "Backups",
  proofs: "PaymentProofs",
} as const;

export const PUBLIC_FOLDERS = ["banner", "logo", "product", "team", "awards"] as const;

const PRIVATE_FOLDERS: ReadonlySet<Folder> = new Set(["invoices", "backups", "proofs"]);

export const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

export const BACKUPS_DIR = path.join(__dirname, "..", "..", "backups");

export const INVOICES_DIR = path.join(__dirname, "..", "..", "invoices");

export const PROOFS_DIR = path.join(__dirname, "..", "..", "proofs");

/**
 * Every file lives under a base path named after this deployment's RESTAURANT_KEY, so several restaurants (or
 * environments) can share one bucket without mixing: `<RESTAURANT_KEY>/Banner/...`, `<RESTAURANT_KEY>/Invoices/...`.
 * Only letters, digits, dot, dash and underscore are kept; with no usable key the old, unprefixed layout is used.
 */
export function storageBase(): string {
  const key = (process.env.RESTAURANT_KEY ?? "").trim();
  return /^[A-Za-z0-9._-]{1,64}$/.test(key) && key !== "." && key !== ".." ? key : "";
}

const withBase = (...parts: string[]) => [storageBase(), ...parts].filter(Boolean).join("/");

function localRoot(folder: Folder): string {
  if (folder === "backups") return BACKUPS_DIR;
  if (folder === "invoices") return INVOICES_DIR;
  if (folder === "proofs") return PROOFS_DIR;
  return UPLOADS_DIR;
}

/** Where a file is on local disk. `legacy` is the layout used before files were grouped by restaurant key. */
function localPath(folder: Folder, name: string, legacy = false): string {
  const root = localRoot(folder);
  const base = legacy ? "" : storageBase();
  const full = PRIVATE_FOLDERS.has(folder)
    ? path.join(root, base, name)
    : path.join(root, base, FOLDERS[folder], name);
  if (path.relative(root, full).startsWith("..")) throw new HttpError(400, "Invalid file path");
  return full;
}

function bucketFor(folder: Folder): string | null {
  const r2 = getR2();
  if (!r2) return null;
  if (!PRIVATE_FOLDERS.has(folder)) return r2.bucket;
  if (!r2.privateBucket) return null; // keep tenant data off the public bucket
  return r2.privateBucket;
}

export function objectKey(folder: Folder, name: string): string {
  return withBase(FOLDERS[folder], name);
}

/** The key used before files were grouped by restaurant key; reads and deletes still look here as a fallback. */
function legacyKey(folder: Folder, name: string): string {
  return `${FOLDERS[folder]}/${name}`;
}

function publicUrl(key: string): string {
  const r2 = getR2()!;
  return `${r2.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function putObject(
  folder: Folder,
  name: string,
  body: Buffer,
  contentType: string
): Promise<{ key: string; url: string | null }> {
  const bucket = bucketFor(folder);
  const key = objectKey(folder, name);

  if (bucket) {
    await getR2()!.client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
    );
    return { key, url: PRIVATE_FOLDERS.has(folder) ? null : publicUrl(key) };
  }

  const full = localPath(folder, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
  return { key, url: PRIVATE_FOLDERS.has(folder) ? null : `/uploads/${key}` };
}

function isMissing(err: unknown): boolean {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.Code === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

export async function getObject(folder: Folder, name: string): Promise<Buffer> {
  const bucket = bucketFor(folder);
  if (bucket) {
    const client = getR2()!.client;
    const read = async (key: string) => {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    };
    try {
      return await read(objectKey(folder, name));
    } catch (err) {
      if (!isMissing(err) || !storageBase()) throw err;
      return read(legacyKey(folder, name)); // a file saved before the restaurant-key folders existed
    }
  }
  const current = localPath(folder, name);
  return fs.readFileSync(fs.existsSync(current) ? current : localPath(folder, name, true));
}

export async function deleteObject(folder: Folder, name: string): Promise<void> {
  const bucket = bucketFor(folder);
  if (bucket) {
    const client = getR2()!.client;
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(folder, name) }));
    if (storageBase()) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: legacyKey(folder, name) }));
    return;
  }
  fs.rmSync(localPath(folder, name), { force: true });
  if (storageBase()) fs.rmSync(localPath(folder, name, true), { force: true });
}

/**
 * Creates the folder layout for this restaurant: `<RESTAURANT_KEY>/Banner/`, `/Logo/`, `/Product Image/`, `/Team/`,
 * `/Awards/` in the public bucket, and `/Invoices/`, `/Backups/`, `/PaymentProofs/` in the private bucket. R2 has no
 * real folders, so each one is an empty object whose key ends in "/", which the Cloudflare dashboard shows as a folder.
 * On local disk the directories are created. Safe to run again.
 */
export async function ensureStorageFolders(): Promise<{ created: string[]; skipped: string[] }> {
  const created: string[] = [];
  const skipped: string[] = [];
  const r2 = getR2();
  for (const folder of Object.keys(FOLDERS) as Folder[]) {
    const prefix = withBase(FOLDERS[folder]);
    const bucket = bucketFor(folder);
    if (r2 && bucket) {
      await r2.client.send(new PutObjectCommand({ Bucket: bucket, Key: `${prefix}/`, Body: Buffer.alloc(0) }));
      created.push(`${bucket}/${prefix}/`);
    } else if (r2) {
      skipped.push(`${prefix}/ (no R2_PRIVATE_BUCKET, so private files stay on local disk)`);
      const dir = PRIVATE_FOLDERS.has(folder) ? path.dirname(localPath(folder, "x")) : localPath(folder, "");
      fs.mkdirSync(dir, { recursive: true });
    } else {
      const dir = PRIVATE_FOLDERS.has(folder) ? path.dirname(localPath(folder, "x")) : localPath(folder, "");
      fs.mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }
  return { created, skipped };
}

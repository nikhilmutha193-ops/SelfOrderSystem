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
} as const;

export const PUBLIC_FOLDERS = ["banner", "logo", "product", "team", "awards"] as const;

const PRIVATE_FOLDERS: ReadonlySet<Folder> = new Set(["invoices", "backups"]);

export const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");

export const BACKUPS_DIR = path.join(__dirname, "..", "..", "backups");

export const INVOICES_DIR = path.join(__dirname, "..", "..", "invoices");

function localRoot(folder: Folder): string {
  if (folder === "backups") return BACKUPS_DIR;
  if (folder === "invoices") return INVOICES_DIR;
  return UPLOADS_DIR;
}

function localPath(folder: Folder, name: string): string {
  const root = localRoot(folder);
  const full = PRIVATE_FOLDERS.has(folder) ? path.join(root, name) : path.join(root, FOLDERS[folder], name);
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
  return { key, url: PRIVATE_FOLDERS.has(folder) ? null : `/uploads/${FOLDERS[folder]}/${name}` };
}

export async function getObject(folder: Folder, name: string): Promise<Buffer> {
  const bucket = bucketFor(folder);
  if (bucket) {
    const res = await getR2()!.client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey(folder, name) }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }
  return fs.readFileSync(localPath(folder, name));
}

export async function deleteObject(folder: Folder, name: string): Promise<void> {
  const bucket = bucketFor(folder);
  if (bucket) {
    await getR2()!.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(folder, name) }));
    return;
  }
  fs.rmSync(localPath(folder, name), { force: true });
}

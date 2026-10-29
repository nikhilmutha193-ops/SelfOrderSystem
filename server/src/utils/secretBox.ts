import crypto from "crypto";

// AES-256-GCM for small secrets stored in the database (payment gateway keys). The key is derived
// from JWT_SECRET with its own label, so rotating JWT_SECRET means re-entering those secrets.
function key(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return crypto.createHash("sha256").update(`secret-box:${secret}`).digest();
}

export function sealSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

/** The secret, or null when it is empty or can't be decrypted (for example after JWT_SECRET changed). */
export function openSecret(sealed: string): string | null {
  if (!sealed) return null;
  try {
    const buf = Buffer.from(sealed, "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

import crypto from "crypto";

/**
 * Table QR codes used to encode the table's plain code (e.g. "tbl3") directly in the
 * URL - guessable/sequential, and lets anyone construct a login link for any table
 * without ever scanning its QR. This encrypts the table's identity into an opaque
 * token instead, so the printed QR is the only practical way to reach that table's
 * login (a PIN is still required either way - this closes the "just guess the code"
 * shortcut, it doesn't replace the PIN).
 */

function deriveKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptTableToken(tableId: string, restaurantId: string): string {
  const payload = `${restaurantId}:${tableId}`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export function decryptTableToken(token: string): { restaurantId: string; tableId: string } | null {
  try {
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const [restaurantId, tableId] = decrypted.split(":");
    if (!restaurantId || !tableId) return null;
    return { restaurantId, tableId };
  } catch {
    return null;
  }
}

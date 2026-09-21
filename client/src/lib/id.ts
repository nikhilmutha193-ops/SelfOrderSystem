/**
 * A unique id for client-only bookkeeping (cart line keys, etc.) - never used for anything
 * security-sensitive, so cryptographic randomness isn't required.
 *
 * `crypto.randomUUID()` only exists in secure contexts (HTTPS or localhost); a phone loading
 * this site over plain HTTP via a LAN IP (e.g. scanning a QR code on the restaurant's own
 * network) gets `crypto.randomUUID === undefined` and the page crashes. This falls back to a
 * Math.random-based id so it works everywhere the app is actually deployed.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

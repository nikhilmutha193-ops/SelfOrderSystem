const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I, so it reads cleanly off a ticket

/** A short unique name for a guest who skipped their details, like "Guest K7M2", so their orders can be told apart. */
export function guestAlias(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `Guest ${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

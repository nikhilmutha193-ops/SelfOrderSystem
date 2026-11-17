export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return normalizePhone(digits.slice(1));
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 8 && digits.length <= 15 && !(digits.length === 10)) return digits;
  return null;
}

/** Hides the middle of a mobile number for bills, for example 98XXXXXX10 (the first two and last two digits stay). */
export function maskPhone(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const hide = (n: string) => n.slice(0, 2) + "X".repeat(Math.max(n.length - 4, 0)) + n.slice(-2);
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${hide(digits.slice(2))}`;
  return digits.length <= 4 ? "X".repeat(digits.length) : hide(digits);
}

/** The phone as it should appear on a bill: hidden in the middle when the owner turned masking on. */
export function billPhone(raw: string | null | undefined, settings: { maskCustomerPhone?: boolean } | undefined | null) {
  return settings?.maskCustomerPhone ? maskPhone(raw) : (raw ?? "");
}

export function displayPhone(phone: string): string {
  return phone.length === 12 && phone.startsWith("91") ? `+91 ${phone.slice(2, 7)} ${phone.slice(7)}` : `+${phone}`;
}

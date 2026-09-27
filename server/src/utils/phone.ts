export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return normalizePhone(digits.slice(1));
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length >= 8 && digits.length <= 15 && !(digits.length === 10)) return digits;
  return null;
}

export function displayPhone(phone: string): string {
  return phone.length === 12 && phone.startsWith("91") ? `+91 ${phone.slice(2, 7)} ${phone.slice(7)}` : `+${phone}`;
}

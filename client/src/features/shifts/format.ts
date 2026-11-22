export const rupees = (n: number | undefined | null) => `₹${(n ?? 0).toFixed(2)}`;

export const OPENING_FLOAT_PRESETS = [500, 1000, 2000, 5000, 10000];
export const CASH_MOVEMENT_PRESETS = [50, 100, 200, 500, 1000, 2000];

export function when(iso?: string | null) {
  return iso
    ? new Date(iso).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";
}

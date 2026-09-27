import { ILoyaltyEntry } from "../../models/LoyaltyEntry";

interface Lot {
  remaining: number;
  expiresAt: Date | null;
}

const alive = (lot: Lot, at: Date) => !lot.expiresAt || lot.expiresAt.getTime() > at.getTime();

export function loyaltyBalance(
  entries: Pick<ILoyaltyEntry, "type" | "points" | "expiresAt" | "createdAt">[],
  now = new Date()
): { balance: number; expired: number; expiringSoon: number } {
  const lots: Lot[] = [];
  const sorted = [...entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const entry of sorted) {
    if (entry.points > 0) {
      lots.push({ remaining: entry.points, expiresAt: entry.type === "earn" ? (entry.expiresAt ?? null) : null });
      continue;
    }
    let owed = -entry.points;
    for (const lot of lots) {
      if (owed <= 0) break;
      if (lot.remaining <= 0 || !alive(lot, entry.createdAt)) continue;
      const take = Math.min(lot.remaining, owed);
      lot.remaining -= take;
      owed -= take;
    }
  }
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  let balance = 0;
  let expired = 0;
  let expiringSoon = 0;
  for (const lot of lots) {
    if (alive(lot, now)) {
      balance += lot.remaining;
      if (lot.expiresAt && !alive(lot, soon)) expiringSoon += lot.remaining;
    } else {
      expired += lot.remaining;
    }
  }
  return { balance, expired, expiringSoon };
}

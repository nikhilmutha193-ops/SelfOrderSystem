export function renderPrepMessage(
  template: string | undefined,
  estimatedReadyAt: string | null | undefined,
  items: { status: string }[],
  bufferMinutes = 2
): string | null {
  if (!template || !estimatedReadyAt) return null;
  if (!items.some((i) => i.status === "pending" || i.status === "preparing")) return null;

  const target = new Date(estimatedReadyAt).getTime();
  if (!Number.isFinite(target)) return null;

  const now = Date.now();
  const stepMs = Math.max(1, bufferMinutes) * 60_000;
  const rolled = target > now ? target : target + (Math.floor((now - target) / stepMs) + 1) * stepMs;

  return template
    .replace(/\{minutes\}/g, String(Math.max(1, Math.ceil((rolled - now) / 60_000))))
    .replace(/\{time\}/g, new Date(rolled).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
}

/** Quick-pick amounts near a target (e.g. a bill total or a shift's expected cash): round-ups to
 *  the nearest 10/50/100/500, plus common Indian note values above the target. Capped at 4 so the
 *  chip row stays short. */
export function cashSuggestions(amount: number): number[] {
  const out = new Set<number>();
  for (const step of [10, 50, 100, 500]) {
    const up = Math.ceil(amount / step) * step;
    if (up > amount) out.add(up);
  }
  for (const note of [200, 500, 2000]) if (note > amount) out.add(note);
  return [...out].sort((a, b) => a - b).slice(0, 4);
}

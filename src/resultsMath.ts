export function attemptComparison(current: number, previous: number[]): {
  last: number | null;
  best: number | null;
  deltaFromLast: number | null;
} {
  if (!previous.length) return { last: null, best: null, deltaFromLast: null };
  const last = previous[previous.length - 1] ?? null;
  const best = Math.max(...previous);
  return { last, best, deltaFromLast: last == null ? null : current - last };
}

export function formatPercentSafe(delta: number | null): string {
  if (delta == null || Number.isNaN(delta)) return '—';
  const points = Math.round(delta * 100);
  if (points > 0) return `up ${points} points`;
  if (points < 0) return `down ${Math.abs(points)} points`;
  return 'the same';
}

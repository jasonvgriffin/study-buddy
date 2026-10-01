export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatPercent(ratio: number | null): string {
  if (ratio == null || Number.isNaN(ratio)) return '—';
  return `${Math.round(ratio * 100)}%`;
}

export function dayKey(ts: number, offsetMinutes: number): string {
  const local = new Date(ts - offsetMinutes * 60_000);
  return local.toISOString().slice(0, 10);
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Shown after grading when the PDF has no explanation for that card. */
export const MISSING_EXPLANATION = 'No explanation provided in your PDF.';

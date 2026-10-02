import { compareTestNames } from './format';

const STORAGE_KEY = 'study-buddy-exam-deck';

export type DeckPickSession = {
  deckId: string;
  subjectId: string;
  updatedAt: number;
};

/** Natural order so "Exam 2" stays before "Exam 10" on Home lists. */
export function sortDecksByName<T extends { name: string }>(decks: readonly T[]): T[] {
  return [...decks].sort((a, b) => compareTestNames(a.name, b.name));
}

/** Latest sitting in the current focus, or null when this view has no history. */
export function latestDeckId(
  sessions: readonly DeckPickSession[],
  inFocus: (subjectId: string) => boolean,
): string | null {
  let latest: DeckPickSession | null = null;
  for (const session of sessions) {
    if (!inFocus(session.subjectId)) continue;
    if (!latest || session.updatedAt > latest.updatedAt) latest = session;
  }
  return latest?.deckId ?? null;
}

/**
 * Explicit pick wins when that test is still in view.
 * Otherwise the latest sitting in focus, otherwise the first name in natural order.
 */
export function resolveDeckPick<T extends { id: string; name: string }>(
  decks: readonly T[],
  sessions: readonly DeckPickSession[],
  inFocus: (subjectId: string) => boolean,
  explicitId: string | null,
): T | null {
  const ordered = sortDecksByName(decks);
  if (explicitId) {
    const picked = ordered.find((deck) => deck.id === explicitId);
    if (picked) return picked;
  }
  const recentId = latestDeckId(sessions, inFocus);
  if (recentId) {
    const recent = ordered.find((deck) => deck.id === recentId);
    if (recent) return recent;
  }
  return ordered[0] ?? null;
}

const TIMING_KEY = 'study-buddy-start-timing';

/** Last Timing pick on the Home Start studying card. Untimed unless Timed was chosen before. */
export function readStartTimed(): boolean {
  try {
    return localStorage.getItem(TIMING_KEY) === 'timed';
  } catch {
    return false;
  }
}

export function writeStartTimed(timed: boolean): void {
  try {
    localStorage.setItem(TIMING_KEY, timed ? 'timed' : 'untimed');
  } catch {
    // Private mode can refuse storage. The choice still applies for this visit.
  }
}

export function readExamDeckId(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

export function writeExamDeckId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private mode can refuse storage. The choice still applies for this visit.
  }
}

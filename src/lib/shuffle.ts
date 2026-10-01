import type { ParsedChoice } from './types';

const STORAGE_KEY = 'study-buddy-shuffle-answers';

/** True when the option only makes sense next to the other options, such as "All of the above". */
export function choiceReferencesOthers(text: string): boolean {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (/\b(all|none|both|either|neither)\s+(of\s+)?(the\s+)?(above|these)\b/i.test(flat)) return true;
  // Option letters are capital and stand alone: "A and B", "B, C, or D". Words such as
  // "cord" or "for a" must not look like a letter list.
  if (/(?:^|[\s(])[A-H](?:\s*,\s*[A-H])*\s*(?:,|&|\s+and\s+|\s+or\s+)\s*(?:and\s+|or\s+)?[A-H](?=$|[\s.,;:)])/.test(flat)) {
    return true;
  }
  if (/\b(?:[Oo]ptions?|[Aa]nswers?|[Cc]hoices?)\s+[A-H](?=$|[\s.,;:)])/.test(flat)) return true;
  return false;
}

export function readShuffle(): boolean {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'off') return false;
    return true;
  } catch {
    return true;
  }
}

export function writeShuffle(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode can refuse storage. The choice still applies for this visit.
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const copy = items.slice();
  const rand = mulberry32(seed);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = swap as T;
  }
  return copy;
}

/**
 * Order choices for one presentation.
 * Labels stay on their text, so grading still uses the stored correct letters.
 * Options that mention other options keep their original slot.
 */
export function presentChoices<T extends Pick<ParsedChoice, 'label' | 'text'>>(
  choices: T[],
  seed: number,
  enabled: boolean,
): T[] {
  if (!enabled || choices.length < 2) return choices.slice();
  const locked = choices.map((choice) => choiceReferencesOthers(choice.text));
  if (locked.every(Boolean)) return choices.slice();
  const movable = choices.filter((_, index) => !locked[index]);
  const shuffled = seededShuffle(movable, seed);
  let next = 0;
  return choices.map((choice, index) => (locked[index] ? choice : (shuffled[next++] as T)));
}

/** 1 picks the first choice on screen. A picks the choice whose letter is A. */
export function choiceForKey<T extends { label: string }>(choices: T[], key: string): T | null {
  if (/^[1-9]$/.test(key)) return choices[Number(key) - 1] ?? null;
  if (/^[a-z]$/.test(key)) return choices.find((choice) => choice.label.toLowerCase() === key) ?? null;
  return null;
}

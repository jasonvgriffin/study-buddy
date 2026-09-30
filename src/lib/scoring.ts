import type { CardMemory, Review } from './types';
import { dayKey } from './format';

const DAY = 24 * 60 * 60 * 1000;

/** Consecutive correct answers map to these intervals, then grow by 2.2×. */
export const INTERVAL_LADDER_DAYS = [1, 3, 7, 16];

export function intervalDaysForStreak(streak: number): number {
  if (streak <= 0) return 0;
  if (streak <= INTERVAL_LADDER_DAYS.length) return INTERVAL_LADDER_DAYS[streak - 1];
  let days = INTERVAL_LADDER_DAYS[INTERVAL_LADDER_DAYS.length - 1];
  for (let step = INTERVAL_LADDER_DAYS.length; step < streak; step += 1) {
    days = Math.round(days * 2.2);
  }
  return days;
}

export function emptyMemory(cardId: string, deckId: string, subjectId: string): CardMemory {
  return {
    cardId,
    deckId,
    subjectId,
    attempts: 0,
    correct: 0,
    incorrect: 0,
    streak: 0,
    bestStreak: 0,
    lastResult: null,
    lastReviewedAt: null,
    ease: 2.5,
    intervalDays: 0,
    dueAt: 0,
    lapses: 0,
  };
}

export function applyReview(memory: CardMemory, correct: boolean, now: number): CardMemory {
  const next: CardMemory = {
    ...memory,
    attempts: memory.attempts + 1,
    correct: memory.correct + (correct ? 1 : 0),
    incorrect: memory.incorrect + (correct ? 0 : 1),
    lastResult: correct ? 'correct' : 'incorrect',
    lastReviewedAt: now,
  };
  if (correct) {
    next.streak = memory.streak + 1;
    next.bestStreak = Math.max(memory.bestStreak, next.streak);
    next.ease = Math.min(3, memory.ease + 0.1);
    next.intervalDays = intervalDaysForStreak(next.streak);
    next.dueAt = now + next.intervalDays * DAY;
  } else {
    next.streak = 0;
    next.lapses = memory.lapses + 1;
    next.ease = Math.max(1.3, memory.ease - 0.2);
    next.intervalDays = 0;
    next.dueAt = now;
  }
  return next;
}

export function memoryFromReviews(
  cardId: string,
  deckId: string,
  subjectId: string,
  reviews: Pick<Review, 'correct' | 'at'>[],
): CardMemory {
  const ordered = [...reviews].sort((a, b) => a.at - b.at);
  let memory = emptyMemory(cardId, deckId, subjectId);
  for (const review of ordered) memory = applyReview(memory, review.correct, review.at);
  return memory;
}

export function accuracyOf(memory: Pick<CardMemory, 'attempts' | 'correct'>): number | null {
  if (memory.attempts <= 0) return null;
  return memory.correct / memory.attempts;
}

/** Due for review: already studied, and the scheduled time has arrived. A miss is due immediately. */
export function isDue(memory: Pick<CardMemory, 'attempts' | 'dueAt'>, now: number): boolean {
  return memory.attempts > 0 && memory.dueAt <= now;
}

export function isUnclearedMiss(memory: Pick<CardMemory, 'incorrect' | 'streak' | 'lastResult'>): boolean {
  return memory.lastResult === 'incorrect' || (memory.incorrect > 0 && memory.streak === 0);
}

/** Higher means the drill should show the card sooner. */
export function drillWeight(memory: CardMemory, now: number): number {
  const wrongness = (memory.incorrect + 1) / (memory.correct + 1);
  const age = memory.lastReviewedAt == null ? 0 : Math.max(0, now - memory.lastReviewedAt);
  const recency = 1 + 1 / (1 + age / DAY);
  const dueBoost = memory.dueAt <= now ? 1.4 : 1;
  return wrongness * recency * dueBoost;
}

export function orderForDrill(memories: CardMemory[], now: number): string[] {
  return memories
    .filter(isUnclearedMiss)
    .sort((a, b) => drillWeight(b, now) - drillWeight(a, now))
    .map((memory) => memory.cardId);
}

export type DayStat = {
  day: string;
  correct: number;
  incorrect: number;
  accuracy: number;
};

export function accuracyByDay(
  reviews: Pick<Review, 'at' | 'correct'>[],
  offsetMinutes = 0,
): DayStat[] {
  const buckets = new Map<string, { correct: number; incorrect: number }>();
  for (const review of reviews) {
    const day = dayKey(review.at, offsetMinutes);
    const bucket = buckets.get(day) ?? { correct: 0, incorrect: 0 };
    if (review.correct) bucket.correct += 1;
    else bucket.incorrect += 1;
    buckets.set(day, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, bucket]) => {
      const total = bucket.correct + bucket.incorrect;
      return {
        day,
        correct: bucket.correct,
        incorrect: bucket.incorrect,
        accuracy: total ? bucket.correct / total : 0,
      };
    });
}

export function studyStreak(
  timestamps: number[],
  now: number,
  offsetMinutes = 0,
): { current: number; best: number } {
  const days = new Set(timestamps.map((ts) => dayKey(ts, offsetMinutes)));
  if (!days.size) return { current: 0, best: 0 };
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = Date.parse(`${sorted[i - 1]}T00:00:00Z`);
    const curr = Date.parse(`${sorted[i]}T00:00:00Z`);
    if (curr - prev === DAY) run += 1;
    else run = 1;
    best = Math.max(best, run);
  }
  const today = dayKey(now, offsetMinutes);
  const yesterday = dayKey(now - DAY, offsetMinutes);
  const anchor = days.has(today) ? today : days.has(yesterday) ? yesterday : null;
  if (!anchor) return { current: 0, best };
  let current = 0;
  let cursor = Date.parse(`${anchor}T00:00:00Z`);
  while (days.has(new Date(cursor).toISOString().slice(0, 10))) {
    current += 1;
    cursor -= DAY;
  }
  return { current, best };
}

export function weakestMemories(memories: CardMemory[], limit = 5): CardMemory[] {
  return [...memories]
    .filter((memory) => memory.attempts > 0)
    .sort((a, b) => {
      const accuracy = (memory: CardMemory) => memory.correct / memory.attempts;
      return accuracy(a) - accuracy(b) || b.incorrect - a.incorrect || b.attempts - a.attempts;
    })
    .slice(0, limit);
}

export function rollup(memories: CardMemory[]): {
  attempts: number;
  correct: number;
  incorrect: number;
  accuracy: number | null;
  bestStreak: number;
} {
  const attempts = memories.reduce((sum, memory) => sum + memory.attempts, 0);
  const correct = memories.reduce((sum, memory) => sum + memory.correct, 0);
  const incorrect = memories.reduce((sum, memory) => sum + memory.incorrect, 0);
  const bestStreak = memories.reduce((max, memory) => Math.max(max, memory.bestStreak), 0);
  return {
    attempts,
    correct,
    incorrect,
    accuracy: attempts ? correct / attempts : null,
    bestStreak,
  };
}

export function trailingCorrectStreak(reviews: Pick<Review, 'correct' | 'at'>[]): number {
  const ordered = [...reviews].sort((a, b) => a.at - b.at);
  let streak = 0;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (!ordered[i].correct) break;
    streak += 1;
  }
  return streak;
}

export function attemptComparison(current: number, previous: number[]): {
  last: number | null;
  best: number | null;
  deltaFromLast: number | null;
} {
  if (!previous.length) return { last: null, best: null, deltaFromLast: null };
  const last = previous[previous.length - 1];
  const best = Math.max(...previous);
  return { last, best, deltaFromLast: current - last };
}

export const WEAK_ACCURACY = 0.7;
export const RECENT_WINDOW = 40;
const HALF_LIFE_MS = 7 * DAY;

export type AreaInput = {
  id: string;
  label: string;
  scope: 'section' | 'deck' | 'subject' | 'domain' | 'objective';
  deckId: string | null;
  deckName: string | null;
  subjectId: string;
  subjectName: string;
  section: string | null;
  reviews: Pick<Review, 'correct' | 'at'>[];
  totalCards: number;
  neverAttempted: number;
  dueCards: number;
  /** Exam weight copied from the PDF domain list, such as 0.28. */
  examWeight?: number | null;
};

export type Recommendation = {
  id: string;
  scope: 'section' | 'deck' | 'subject' | 'domain' | 'objective';
  label: string;
  deckId: string | null;
  deckName: string | null;
  subjectId: string;
  subjectName: string;
  section: string | null;
  accuracy: number | null;
  sampleSize: number;
  weak: boolean;
  priority: number;
  text: string;
};

export function weightedAccuracy(
  reviews: Pick<Review, 'correct' | 'at'>[],
  now: number,
): { accuracy: number | null; sampleSize: number } {
  const recent = [...reviews].sort((a, b) => a.at - b.at).slice(-RECENT_WINDOW);
  let weightedCorrect = 0;
  let weightedTotal = 0;
  for (const review of recent) {
    const age = Math.max(0, now - review.at);
    const weight = Math.exp((-Math.LN2 * age) / HALF_LIFE_MS);
    weightedTotal += weight;
    if (review.correct) weightedCorrect += weight;
  }
  if (weightedTotal === 0) return { accuracy: null, sampleSize: 0 };
  return { accuracy: weightedCorrect / weightedTotal, sampleSize: recent.length };
}

export function rankStudyAreas(areas: AreaInput[], now: number): Recommendation[] {
  const ranked = areas.map((area) => {
    const { accuracy, sampleSize } = weightedAccuracy(area.reviews, now);
    const unseen = area.totalCards ? area.neverAttempted / area.totalCards : 0;
    const due = area.totalCards ? area.dueCards / area.totalCards : 0;
    const weakness = accuracy == null ? 0 : 1 - accuracy;
    const examWeight = area.examWeight == null ? 1 : Math.max(area.examWeight, 0.05);
    const priority = weakness * examWeight * 1.2 + unseen * 0.4 + due * 0.3;
    const weak = accuracy != null && sampleSize >= 4 && accuracy < WEAK_ACCURACY;
    let text: string;
    const weightNote =
      area.examWeight == null ? '' : ` (${Math.round(area.examWeight * 100)}% of the exam)`;
    if (accuracy != null && sampleSize > 0) {
      const pct = Math.round(accuracy * 100);
      text = weak
        ? `${area.label}: ${pct}% over your last ${sampleSize} answers${weightNote}, focus here`
        : `${area.label}: ${pct}% over your last ${sampleSize} answers${weightNote}`;
    } else if (area.neverAttempted > 0) {
      text = `${area.label}: ${area.neverAttempted} cards never attempted`;
    } else if (area.dueCards > 0) {
      text = `${area.label}: ${area.dueCards} cards are due for review`;
    } else {
      text = `${area.label}: nothing to review yet`;
    }
    return {
      id: area.id,
      scope: area.scope,
      label: area.label,
      deckId: area.deckId,
      deckName: area.deckName,
      subjectId: area.subjectId,
      subjectName: area.subjectName,
      section: area.section,
      accuracy,
      sampleSize,
      weak,
      priority,
      text,
    };
  });
  return ranked.sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));
}

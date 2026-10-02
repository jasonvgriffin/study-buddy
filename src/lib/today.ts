import { compareTestNames, dayKey } from './format';
import { studyStreak } from './scoring';
import { elapsedMs } from './session';
import type { AnswerResult, Review } from './types';

export type RecapReview = Pick<Review, 'at' | 'correct' | 'result' | 'subjectId' | 'deckId' | 'sessionId'>;

export type RecapSession = {
  id: string;
  startedAt: number;
  accumulatedMs: number;
  runningSince: number | null;
};

export type TodayTest = {
  deckId: string;
  name: string;
  answered: number;
  correct: number;
  accuracy: number | null;
};

export type TodaySubject = {
  subjectId: string;
  name: string;
  answered: number;
  correct: number;
  unknown: number;
  accuracy: number | null;
  tests: TodayTest[];
};

export type TodayRecap = {
  empty: boolean;
  answered: number;
  correct: number;
  unknown: number;
  accuracy: number | null;
  subjects: TodaySubject[];
  /** Active milliseconds today, or null when that total cannot be split cleanly. */
  studiedMs: number | null;
  streak: number;
  encouragement: string;
};

/** Older reviews have no result field. Only an explicit "unknown" counts as I don't know. */
export function reviewResult(review: Pick<Review, 'correct' | 'result'>): AnswerResult {
  if (review.result === 'correct' || review.result === 'incorrect' || review.result === 'unknown') {
    return review.result;
  }
  return review.correct ? 'correct' : 'incorrect';
}

export function todayEncouragement(answered: number, accuracy: number | null): string {
  if (answered === 0) return 'Nothing yet today. Start a session and it will show up here.';
  if (accuracy === 1) {
    return answered === 1 ? 'Nice start. That answer was right.' : 'Clean sweep. Every answer was right.';
  }
  if (accuracy != null && accuracy >= 0.8) return 'Solid work. Most of these landed.';
  if (accuracy != null && accuracy >= 0.5) return 'You showed up. Keep going.';
  return 'Tough questions today. The misses are worth another look.';
}

/**
 * Time for sessions that both have an answer today and started today.
 * A sitting that began on an earlier day is left out entirely, because its
 * stored clock is one total and cannot be split across dates.
 */
export function studiedMsToday(
  reviewsToday: Pick<RecapReview, 'sessionId'>[],
  sessions: readonly RecapSession[],
  today: string,
  now: number,
  offsetMinutes: number,
): number | null {
  const ids = [...new Set(reviewsToday.map((review) => review.sessionId))];
  if (!ids.length) return null;
  let total = 0;
  for (const id of ids) {
    const session = sessions.find((item) => item.id === id);
    if (!session || dayKey(session.startedAt, offsetMinutes) !== today) return null;
    total += elapsedMs(session, now);
  }
  return total;
}

export function todayRecap(input: {
  reviews: readonly RecapReview[];
  sessions: readonly RecapSession[];
  subjects: readonly { id: string; name: string }[];
  decks: readonly { id: string; name: string }[];
  now: number;
  offsetMinutes: number;
  subjectId?: string | null;
}): TodayRecap {
  const scoped = input.subjectId
    ? input.reviews.filter((review) => review.subjectId === input.subjectId)
    : input.reviews;
  const today = dayKey(input.now, input.offsetMinutes);
  const todays = scoped.filter((review) => dayKey(review.at, input.offsetMinutes) === today);
  const answered = todays.length;
  const correct = todays.filter((review) => reviewResult(review) === 'correct').length;
  const unknown = todays.filter((review) => reviewResult(review) === 'unknown').length;
  const accuracy = answered ? correct / answered : null;
  const subjectNames = new Map(input.subjects.map((subject) => [subject.id, subject.name]));
  const deckNames = new Map(input.decks.map((deck) => [deck.id, deck.name]));
  const bySubject = new Map<string, RecapReview[]>();
  for (const review of todays) {
    const list = bySubject.get(review.subjectId) ?? [];
    list.push(review);
    bySubject.set(review.subjectId, list);
  }
  const subjects: TodaySubject[] = [...bySubject.entries()]
    .map(([subjectId, reviews]) => {
      const byDeck = new Map<string, RecapReview[]>();
      for (const review of reviews) {
        const list = byDeck.get(review.deckId) ?? [];
        list.push(review);
        byDeck.set(review.deckId, list);
      }
      const tests = [...byDeck.entries()]
        .map(([deckId, deckReviews]) => {
          const deckCorrect = deckReviews.filter((review) => reviewResult(review) === 'correct').length;
          return {
            deckId,
            name: deckNames.get(deckId) ?? 'Saved test',
            answered: deckReviews.length,
            correct: deckCorrect,
            accuracy: deckReviews.length ? deckCorrect / deckReviews.length : null,
          };
        })
        .sort((a, b) => compareTestNames(a.name, b.name));
      const subjectCorrect = reviews.filter((review) => reviewResult(review) === 'correct').length;
      return {
        subjectId,
        name: subjectNames.get(subjectId) ?? 'Saved subject',
        answered: reviews.length,
        correct: subjectCorrect,
        unknown: reviews.filter((review) => reviewResult(review) === 'unknown').length,
        accuracy: reviews.length ? subjectCorrect / reviews.length : null,
        tests,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    empty: answered === 0,
    answered,
    correct,
    unknown,
    accuracy,
    subjects,
    studiedMs: studiedMsToday(todays, input.sessions, today, input.now, input.offsetMinutes),
    streak: studyStreak(
      scoped.map((review) => review.at),
      input.now,
      input.offsetMinutes,
    ).current,
    encouragement: todayEncouragement(answered, accuracy),
  };
}

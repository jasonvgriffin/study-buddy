import { describe, expect, it } from 'vitest';
import {
  reviewResult,
  studiedMsToday,
  todayEncouragement,
  todayProgressLine,
  todayRecap,
  type RecapReview,
  type RecapSession,
} from './today';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-06-15T18:00:00Z');
const todayStart = Date.parse('2026-06-15T15:00:00Z');

function review(partial: Partial<RecapReview> & Pick<RecapReview, 'at' | 'correct'>): RecapReview {
  return {
    subjectId: 'sub',
    deckId: 'deck',
    sessionId: 'sit',
    result: partial.correct ? 'correct' : 'incorrect',
    ...partial,
  };
}

function session(partial: Partial<RecapSession> = {}): RecapSession {
  return {
    id: 'sit',
    startedAt: todayStart,
    accumulatedMs: 90_000,
    runningSince: null,
    ...partial,
  };
}

describe('review result', () => {
  it('counts only an explicit unknown as I don\'t know', () => {
    expect(reviewResult({ correct: false, result: 'unknown' })).toBe('unknown');
    expect(reviewResult({ correct: true, result: 'correct' })).toBe('correct');
    expect(reviewResult({ correct: false })).toBe('incorrect');
    expect(reviewResult({ correct: true })).toBe('correct');
    expect(reviewResult({ correct: false, result: 'incorrect' })).toBe('incorrect');
  });
});

describe('today recap', () => {
  const subjects = [
    { id: 'sub', name: 'Rivers' },
    { id: 'other', name: 'Weather' },
  ];
  const decks = [
    { id: 'deck', name: 'Practice Test 2' },
    { id: 'deck-a', name: 'Practice Test 1' },
    { id: 'deck-w', name: 'Clouds' },
  ];

  it('stays empty when nothing was answered today and still reports a streak', () => {
    const recap = todayRecap({
      reviews: [review({ at: now - DAY, correct: true })],
      sessions: [],
      subjects,
      decks,
      now,
      offsetMinutes: 0,
    });
    expect(recap.empty).toBe(true);
    expect(recap.answered).toBe(0);
    expect(recap.unknown).toBe(0);
    expect(recap.studiedMs).toBeNull();
    expect(recap.streak).toBe(1);
    expect(recap.encouragement).toMatch(/Nothing yet today/);
    expect(recap.subjects).toEqual([]);
  });

  it('sums today\'s answers, I don\'t know, and each subject and test', () => {
    const recap = todayRecap({
      reviews: [
        review({ at: todayStart, correct: true, deckId: 'deck' }),
        review({ at: todayStart + 1000, correct: false, result: 'unknown', deckId: 'deck-a' }),
        review({ at: todayStart + 2000, correct: true, deckId: 'deck-a' }),
        review({ at: todayStart + 3000, correct: false, subjectId: 'other', deckId: 'deck-w', sessionId: 'sit-w' }),
        review({ at: now - 2 * DAY, correct: true }),
      ],
      sessions: [
        session(),
        session({ id: 'sit-w', startedAt: todayStart + 500, accumulatedMs: 30_000 }),
      ],
      subjects,
      decks,
      now,
      offsetMinutes: 0,
    });
    expect(recap.answered).toBe(4);
    expect(recap.correct).toBe(2);
    expect(recap.unknown).toBe(1);
    expect(recap.accuracy).toBe(0.5);
    expect(recap.subjects.map((subject) => subject.name)).toEqual(['Rivers', 'Weather']);
    const rivers = recap.subjects[0];
    expect(rivers.answered).toBe(3);
    expect(rivers.correct).toBe(2);
    expect(rivers.unknown).toBe(1);
    expect(rivers.tests.map((test) => [test.name, test.correct, test.answered])).toEqual([
      ['Practice Test 1', 1, 2],
      ['Practice Test 2', 1, 1],
    ]);
    expect(recap.studiedMs).toBe(120_000);
    expect(recap.streak).toBe(1);
    expect(recap.encouragement).toMatch(/showed up/i);
  });

  it('limits the card to the focused subject', () => {
    const recap = todayRecap({
      reviews: [
        review({ at: todayStart, correct: true }),
        review({ at: todayStart, correct: false, subjectId: 'other', deckId: 'deck-w', sessionId: 'sit-w' }),
      ],
      sessions: [session(), session({ id: 'sit-w' })],
      subjects,
      decks,
      now,
      offsetMinutes: 0,
      subjectId: 'other',
    });
    expect(recap.answered).toBe(1);
    expect(recap.subjects.map((subject) => subject.name)).toEqual(['Weather']);
  });

  it('omits study time when a sitting started on another day', () => {
    const reviews = [review({ at: todayStart, correct: true })];
    expect(
      studiedMsToday(reviews, [session({ startedAt: now - DAY })], '2026-06-15', now, 0),
    ).toBeNull();
    const recap = todayRecap({
      reviews,
      sessions: [session({ startedAt: now - DAY, accumulatedMs: 50_000 })],
      subjects,
      decks,
      now,
      offsetMinutes: 0,
    });
    expect(recap.studiedMs).toBeNull();
    expect(recap.answered).toBe(1);
  });

  it('omits study time when today mixes a new sitting with one from yesterday', () => {
    const total = studiedMsToday(
      [
        review({ at: todayStart, correct: true, sessionId: 'new' }),
        review({ at: todayStart + 1, correct: true, sessionId: 'old' }),
      ],
      [
        session({ id: 'new', accumulatedMs: 10_000 }),
        session({ id: 'old', startedAt: now - DAY, accumulatedMs: 80_000 }),
      ],
      '2026-06-15',
      now,
      0,
    );
    expect(total).toBeNull();
  });
});

describe('progress line', () => {
  it('puts today on one line and leaves off a zero streak', () => {
    expect(todayProgressLine({ answered: 24, correct: 18, accuracy: 0.75, streak: 3 })).toBe(
      'Today: 24 answered · 18 right (75%) · 3-day streak',
    );
    expect(todayProgressLine({ answered: 3, correct: 1, accuracy: 1 / 3, streak: 1 })).toBe(
      'Today: 3 answered · 1 right (33%) · 1-day streak',
    );
    expect(todayProgressLine({ answered: 2, correct: 2, accuracy: 1, streak: 0 })).toBe(
      'Today: 2 answered · 2 right (100%)',
    );
  });
});

describe('encouragement', () => {
  it('matches a clean day, a solid day, and a hard day', () => {
    expect(todayEncouragement(0, null)).toMatch(/Nothing yet today/);
    expect(todayEncouragement(1, 1)).toMatch(/Nice start/);
    expect(todayEncouragement(4, 1)).toMatch(/Clean sweep/);
    expect(todayEncouragement(5, 0.8)).toMatch(/Solid work/);
    expect(todayEncouragement(4, 0.5)).toMatch(/showed up/i);
    expect(todayEncouragement(4, 0.25)).toMatch(/Tough questions/);
  });
});

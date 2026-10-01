import { describe, expect, it } from 'vitest';
import {
  accuracyByDay,
  applyReview,
  attemptComparison,
  drillWeight,
  emptyMemory,
  INTERVAL_LADDER_DAYS,
  isDue,
  isUnclearedMiss,
  memoryFromReviews,
  orderForDrill,
  studyStreak,
  trailingCorrectStreak,
  weakestMemories,
} from './scoring';

const DAY = 24 * 60 * 60 * 1000;

describe('scoring', () => {
  it('tracks attempts, streaks, and a reset on a miss', () => {
    let memory = emptyMemory('c1', 'd1', 's1');
    memory = applyReview(memory, true, 1_000);
    memory = applyReview(memory, true, 2_000);
    expect(memory.streak).toBe(2);
    expect(memory.bestStreak).toBe(2);
    expect(memory.correct).toBe(2);
    memory = applyReview(memory, false, 3_000);
    expect(memory.streak).toBe(0);
    expect(memory.bestStreak).toBe(2);
    expect(memory.incorrect).toBe(1);
    expect(memory.attempts).toBe(3);
    expect(memory.dueAt).toBe(3_000);
    expect(isUnclearedMiss(memory)).toBe(true);
    memory = applyReview(memory, true, 4_000);
    expect(isUnclearedMiss(memory)).toBe(false);
  });

  it('rebuilds memory from a review log', () => {
    const memory = memoryFromReviews('c1', 'd1', 's1', [
      { correct: false, at: 10 },
      { correct: true, at: 20 },
      { correct: true, at: 30 },
    ]);
    expect(memory.attempts).toBe(3);
    expect(memory.streak).toBe(2);
    expect(trailingCorrectStreak([
      { correct: false, at: 10 },
      { correct: true, at: 20 },
      { correct: true, at: 30 },
    ])).toBe(2);
  });

  it('schedules 1, 3, 7, then 16 days and is due immediately after a miss', () => {
    let memory = emptyMemory('c1', 'd1', 's1');
    const day = 24 * 60 * 60 * 1000;
    for (const expected of INTERVAL_LADDER_DAYS) {
      const at = memory.dueAt;
      memory = applyReview(memory, true, at);
      expect(memory.intervalDays).toBe(expected);
      expect(memory.dueAt).toBe(at + expected * day);
      expect(isDue(memory, at + expected * day - 1)).toBe(false);
    }
    const missedAt = memory.dueAt;
    memory = applyReview(memory, false, missedAt);
    expect(memory.intervalDays).toBe(0);
    expect(memory.dueAt).toBe(missedAt);
    expect(isDue(memory, missedAt)).toBe(true);
    expect(isDue(emptyMemory('new', 'd1', 's1'), missedAt)).toBe(false);
  });

  it('orders the drill toward recent misses', () => {
    const now = 10 * DAY;
    const older = applyReview(emptyMemory('old', 'd', 's'), false, now - 8 * DAY);
    const recent = applyReview(emptyMemory('new', 'd', 's'), false, now - 1000);
    const cleared = applyReview(
      applyReview(emptyMemory('ok', 'd', 's'), false, now - 2 * DAY),
      true,
      now - DAY,
    );
    expect(orderForDrill([older, recent, cleared], now)).toEqual(['new', 'old']);
    expect(drillWeight(recent, now)).toBeGreaterThan(drillWeight(older, now));
  });

  it('buckets accuracy by local day and counts study streaks', () => {
    const offset = 0;
    const monday = Date.parse('2026-03-02T12:00:00Z');
    const days = accuracyByDay(
      [
        { at: monday, correct: true },
        { at: monday + 1000, correct: false },
        { at: monday + DAY, correct: true },
      ],
      offset,
    );
    expect(days).toHaveLength(2);
    expect(days[0].accuracy).toBe(0.5);
    expect(days[1].correct).toBe(1);
    const stamps = [monday, monday + DAY, monday + 2 * DAY];
    expect(studyStreak(stamps, monday + 2 * DAY, offset).current).toBe(3);
    expect(studyStreak(stamps, monday + 4 * DAY, offset).current).toBe(0);
  });

  it('compares a finished attempt with earlier ones', () => {
    const comparison = attemptComparison(0.72, [0.64, 0.8]);
    expect(comparison.last).toBe(0.8);
    expect(comparison.best).toBe(0.8);
    expect(comparison.deltaFromLast).toBeCloseTo(-0.08);
  });

  it('lists the weakest cards', () => {
    const strong = applyReview(applyReview(emptyMemory('strong', 'd', 's'), true, 1), true, 2);
    const weak = applyReview(applyReview(emptyMemory('weak', 'd', 's'), false, 1), false, 2);
    expect(weakestMemories([strong, weak], 1)[0].cardId).toBe('weak');
  });
});

import { describe, expect, it } from 'vitest';
import type { DeckLabelSource } from './deckLabel';
import { applyReview, emptyMemory } from './scoring';
import {
  createExamSession,
  createReviewSession,
  finishSession,
  pauseSession,
} from './session';
import {
  STATS_DECK_SECTIONS,
  STATS_OVERVIEW_SECTIONS,
  byTestRows,
  deckBreakdown,
  weakestCardLabels,
} from './statsDeck';
import type { Card, CardMemory, Review } from './types';

const MESSER = 'professor-messer-a-plus-220-1201-core-1-practice-exams-v111.pdf';

function deck(partial: Partial<DeckLabelSource> & Pick<DeckLabelSource, 'id' | 'name' | 'sourceFileName'>): DeckLabelSource {
  return { subjectId: 'core', createdAt: 1, ...partial };
}

function card(partial: Partial<Card> & Pick<Card, 'id' | 'deckId'>): Card {
  return {
    subjectId: 'core',
    order: 0,
    sourceLabel: '1',
    question: 'Q',
    choices: [],
    correctLabels: [],
    answer: 'A',
    explanation: null,
    section: null,
    domainNumber: null,
    domainName: null,
    objective: null,
    objectiveTitle: null,
    examCode: null,
    lessonUrl: null,
    videoStartSec: null,
    ...partial,
  };
}

function answered(cardId: string, deckId: string, correct: boolean, at: number): CardMemory {
  return applyReview(emptyMemory(cardId, deckId, 'core'), correct, at);
}

function review(cardId: string, deckId: string, correct: boolean, at: number): Review {
  return {
    id: `${cardId}-${at}`,
    cardId,
    deckId,
    subjectId: 'core',
    sessionId: 'sit',
    correct,
    chosenLabels: ['A'],
    at,
  };
}

describe('stats section order', () => {
  it('puts By test above the overall accuracy card, and keeps the rest in place', () => {
    expect(STATS_OVERVIEW_SECTIONS).toEqual(['by-test', 'accuracy', 'by-day', 'by-domain', 'weakest']);
    expect(STATS_OVERVIEW_SECTIONS.indexOf('by-test')).toBeLessThan(STATS_OVERVIEW_SECTIONS.indexOf('accuracy'));
    expect(STATS_DECK_SECTIONS).toEqual(['accuracy', 'by-day', 'by-domain', 'weakest']);
  });
});

describe('by test rows', () => {
  const messer = deck({ id: 'messer', name: 'Practice Exam A', sourceFileName: MESSER, createdAt: 1 });
  const dion = deck({
    id: 'dion',
    name: 'Practice Exam A',
    sourceFileName: 'dion-training-comptia-a-plus-core-1-practice-exams.pdf',
    createdAt: 2,
  });
  const catalog = [messer, dion];

  it('labels an open sitting with the same question count as Home, and skips finished or review sittings', () => {
    const cards = Array.from({ length: 90 }, (_, index) => card({ id: `c${index}`, deckId: 'messer', order: index }));
    const open = pauseSession({ ...createExamSession(messer, cards, 'untimed', 0), index: 6 }, 4_000);
    const dionCards = cards.map((item) => ({ ...item, deckId: 'dion' }));
    const done = finishSession(createExamSession(dion, dionCards, 'untimed', 0), 5_000);
    const reviewSitting = createReviewSession('Due for review', 'core', 'messer', cards, ['c0'], null, 'review:messer', 6_000);
    const rows = byTestRows({
      decks: catalog,
      catalog,
      memories: [answered('c0', 'messer', false, 1_000)],
      sessions: [done, reviewSitting, open],
    });
    expect(rows.map((row) => row.label)).toEqual(['Practice Exam A, Dion', 'Practice Exam A, Messer']);
    const dionRow = rows.find((row) => row.id === 'dion');
    const messerRow = rows.find((row) => row.id === 'messer');
    expect(dionRow?.progress).toBeNull();
    expect(messerRow?.progress).toBe('In progress, question 7 of 90');
    expect(messerRow?.attempts).toBe(1);
    expect(dionRow?.attempts).toBe(0);
  });
});

describe('deck breakdown', () => {
  const day1 = Date.parse('2026-01-02T12:00:00Z');
  const day2 = Date.parse('2026-01-03T12:00:00Z');

  it('keeps accuracy, days, domains, weakest cards, and study time inside one deck', () => {
    const cards = [
      card({
        id: 'nile',
        deckId: 'a',
        question: 'Which river runs through Cairo?',
        domainNumber: 1,
        domainName: 'Rivers',
        objective: '1.1',
        objectiveTitle: 'Geography',
      }),
      card({
        id: 'barometer',
        deckId: 'b',
        question: 'What does a barometer measure?',
        domainNumber: 2,
        domainName: 'Weather',
        objective: '2.1',
        objectiveTitle: 'Instruments',
      }),
    ];
    const memories = [
      applyReview(answered('nile', 'a', false, day1), true, day2),
      answered('barometer', 'b', false, day1),
    ];
    const reviews = [
      review('nile', 'a', false, day1),
      review('nile', 'a', true, day2),
      review('barometer', 'b', false, day1),
    ];
    const sessions = [
      { deckId: 'a', accumulatedMs: 125_000, runningSince: null },
      { deckId: 'b', accumulatedMs: 5_000, runningSince: null },
    ];
    const mine = deckBreakdown({
      deckId: 'a',
      reviews,
      memories,
      sessions,
      cards,
      now: day2 + 10_000,
      offsetMinutes: 0,
    });
    expect(mine.totals).toMatchObject({ attempts: 2, correct: 1, incorrect: 1, accuracy: 0.5 });
    expect(mine.days).toEqual([
      { day: '2026-01-02', correct: 0, incorrect: 1, accuracy: 0 },
      { day: '2026-01-03', correct: 1, incorrect: 0, accuracy: 1 },
    ]);
    expect(mine.domains.map((domain) => domain.name)).toEqual(['Rivers']);
    expect(mine.domains[0]).toMatchObject({ correct: 1, incorrect: 1 });
    expect(mine.domains[0].objectives[0]).toMatchObject({ label: '1.1 Geography', correct: 1, incorrect: 1 });
    expect(mine.weakest.map((memory) => memory.cardId)).toEqual(['nile']);
    expect(mine.activeMs).toBe(125_000);

    const other = deckBreakdown({
      deckId: 'b',
      reviews,
      memories,
      sessions,
      cards,
      now: day2,
      offsetMinutes: 0,
    });
    expect(other.totals).toMatchObject({ attempts: 1, correct: 0, incorrect: 1 });
    expect(other.days).toEqual([{ day: '2026-01-02', correct: 0, incorrect: 1, accuracy: 0 }]);
    expect(other.domains.map((domain) => domain.name)).toEqual(['Weather']);
    expect(other.weakest.map((memory) => memory.cardId)).toEqual(['barometer']);
    expect(other.activeMs).toBe(5_000);
  });
});

describe('weakest card tags', () => {
  it('tags each card with the exam display name, including a short source when names collide', () => {
    const messer = deck({ id: 'messer', name: 'Practice Exam A', sourceFileName: MESSER, createdAt: 1 });
    const dion = deck({
      id: 'dion',
      name: 'Practice Exam A',
      sourceFileName: 'dion-training-comptia-a-plus-core-1-practice-exams.pdf',
      createdAt: 2,
    });
    const labels = weakestCardLabels(
      [answered('cairo', 'messer', false, 2), answered('pressure', 'dion', true, 3)],
      [messer, dion],
    );
    expect(labels).toEqual([
      { cardId: 'cairo', deckId: 'messer', label: 'Practice Exam A, Messer', correct: 0, attempts: 1 },
      { cardId: 'pressure', deckId: 'dion', label: 'Practice Exam A, Dion', correct: 1, attempts: 1 },
    ]);
  });
});

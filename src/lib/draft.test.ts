import { describe, expect, it } from 'vitest';
import { deckNameForImport, draftFromSavedTests, moveTest } from './draft';
import type { Card, Deck } from './types';

function card(partial: Partial<Card> & Pick<Card, 'id' | 'deckId' | 'order' | 'question'>): Card {
  return {
    subjectId: 'sub',
    sourceLabel: partial.sourceLabel ?? '1',
    choices: [],
    correctLabels: [],
    answer: '',
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

function deck(partial: Partial<Deck> & Pick<Deck, 'id' | 'name' | 'createdAt'>): Deck {
  return {
    subjectId: 'sub',
    sourceFileName: 'notes.pdf',
    sourceGroupId: 'file-1',
    domains: [],
    updatedAt: partial.createdAt,
    ...partial,
  };
}

describe('deck names from an import', () => {
  it('uses a detected name', () => {
    expect(deckNameForImport('Practice Exam A', 'core.pdf', 3)).toBe('Practice Exam A');
  });

  it('uses the file name for one unnamed test, and Test 1 when that is empty too', () => {
    expect(deckNameForImport('Imported test', 'core.pdf', 1)).toBe('core');
    expect(deckNameForImport('  ', 'core.pdf', 1)).toBe('core');
    expect(deckNameForImport('Imported test', '  .pdf', 1)).toBe('Test 1');
  });

  it('keeps Imported test when the file has more than one test', () => {
    expect(deckNameForImport('Imported test', 'core.pdf', 2)).toBe('Imported test');
  });
});

describe('moveTest', () => {
  const tests = [
    { name: 'A', cards: [] },
    { name: 'B', cards: [] },
    { name: 'C', cards: [] },
  ];

  it('swaps a test with the next one and moves its video start', () => {
    const moved = moveTest(tests, { '1:0': 12, '2:1': 4 }, 1, 1);
    expect(moved.tests.map((test) => test.name)).toEqual(['A', 'C', 'B']);
    expect(moved.videoStarts).toEqual({ '2:0': 12, '1:1': 4 });
  });

  it('leaves the list alone at the ends', () => {
    expect(moveTest(tests, {}, 0, -1).tests.map((test) => test.name)).toEqual(['A', 'B', 'C']);
    expect(moveTest(tests, {}, 2, 1).tests.map((test) => test.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('draftFromSavedTests', () => {
  it('rebuilds tests in import order, not alphabetical order', () => {
    const draft = draftFromSavedTests({
      id: 'draft-1',
      now: 50,
      decks: [
        deck({ id: 'c', name: 'Practice Exam C', createdAt: 3 }),
        deck({ id: 'a', name: 'Practice Exam A', createdAt: 1 }),
        deck({ id: 'b', name: 'Practice Exam B', createdAt: 2 }),
      ],
      cards: [
        card({ id: 'a1', deckId: 'a', order: 0, question: 'First', sourceLabel: 'A1', videoStartSec: 9, captureId: 'cap-a' }),
        card({ id: 'b1', deckId: 'b', order: 1, question: 'Later', sourceLabel: 'B2' }),
        card({ id: 'b0', deckId: 'b', order: 0, question: 'Earlier', sourceLabel: 'B1' }),
      ],
    });
    expect(draft?.fromSourceGroupId).toBe('file-1');
    expect(draft?.replacesDeckIds).toEqual(['a', 'b', 'c']);
    expect(draft?.tests.map((test) => test.name)).toEqual(['Practice Exam A', 'Practice Exam B', 'Practice Exam C']);
    expect(draft?.tests[0]?.cards[0]?.question).toBe('First');
    expect(draft?.tests[0]?.cards[0]?.captureId).toBe('cap-a');
    expect(draft?.tests[1]?.cards.map((item) => item.question)).toEqual(['Earlier', 'Later']);
    expect(draft?.videoStarts).toEqual({ '0:0': 9 });
  });

  it('returns null when there is nothing saved', () => {
    expect(draftFromSavedTests({ id: 'x', decks: [], cards: [], now: 1 })).toBeNull();
  });
});

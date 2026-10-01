// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { latestDeckId, readExamDeckId, resolveDeckPick, sortDecksByName, writeExamDeckId } from './examDeck';

const decks = [
  { id: 'b', name: 'Practice Exam B' },
  { id: 'c', name: 'Practice Exam C' },
  { id: 'a', name: 'Practice Exam A' },
  { id: 'n10', name: 'Exam 10' },
  { id: 'n2', name: 'exam 2' },
];

const inFocus = () => true;

beforeEach(() => {
  localStorage.clear();
});

describe('sortDecksByName', () => {
  it('lists storage order B, C, A as A, B, C, with Exam 2 before Exam 10', () => {
    expect(sortDecksByName(decks).map((deck) => deck.name)).toEqual([
      'exam 2',
      'Exam 10',
      'Practice Exam A',
      'Practice Exam B',
      'Practice Exam C',
    ]);
  });
});

describe('resolveDeckPick', () => {
  const named = [
    { id: 'b', name: 'Practice Exam B' },
    { id: 'c', name: 'Practice Exam C' },
    { id: 'a', name: 'Practice Exam A' },
  ];

  it('defaults to the first natural name when there is no history and no explicit pick', () => {
    expect(resolveDeckPick(named, [], inFocus, null)?.name).toBe('Practice Exam A');
  });

  it('defaults to the latest sitting in the current focus', () => {
    const sessions = [
      { deckId: 'b', subjectId: 'sub', updatedAt: 10 },
      { deckId: 'c', subjectId: 'sub', updatedAt: 20 },
      { deckId: 'a', subjectId: 'other', updatedAt: 50 },
    ];
    const onlySub = (subjectId: string) => subjectId === 'sub';
    expect(latestDeckId(sessions, onlySub)).toBe('c');
    expect(resolveDeckPick(named, sessions, onlySub, null)?.name).toBe('Practice Exam C');
  });

  it('keeps an explicit pick ahead of history, and ignores a pick that is not in view', () => {
    const sessions = [{ deckId: 'c', subjectId: 'sub', updatedAt: 20 }];
    expect(resolveDeckPick(named, sessions, inFocus, 'b')?.name).toBe('Practice Exam B');
    expect(resolveDeckPick(named, sessions, inFocus, 'missing')?.name).toBe('Practice Exam C');
    expect(resolveDeckPick(named, [{ deckId: 'gone', subjectId: 'sub', updatedAt: 5 }], inFocus, null)?.name).toBe(
      'Practice Exam A',
    );
  });
});

describe('exam deck preference', () => {
  it('persists the explicit pick on this device', () => {
    expect(readExamDeckId()).toBeNull();
    writeExamDeckId('deck-b');
    expect(readExamDeckId()).toBe('deck-b');
  });

  it('ignores storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    try {
      expect(readExamDeckId()).toBeNull();
      expect(() => writeExamDeckId('deck-b')).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

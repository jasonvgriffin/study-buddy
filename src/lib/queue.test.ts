import { describe, expect, it } from 'vitest';
import { applyReview, emptyMemory } from './scoring';
import { dueCardIds } from './queue';
import type { Card } from './types';

function card(partial: Partial<Card> & Pick<Card, 'id' | 'deckId' | 'subjectId'>): Card {
  return {
    order: 0,
    sourceLabel: '1',
    question: 'Q',
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

describe('due queue', () => {
  it('keeps subjects, tests, and domains apart', () => {
    const now = 10_000;
    const cards = [
      card({ id: 'a1', deckId: 't1', subjectId: 'core', domainNumber: 1 }),
      card({ id: 'a2', deckId: 't2', subjectId: 'core', domainNumber: 2 }),
      card({ id: 'b1', deckId: 'n1', subjectId: 'net', domainNumber: 1 }),
    ];
    const memories = [
      applyReview(emptyMemory('a1', 't1', 'core'), false, 1_000),
      applyReview(emptyMemory('a2', 't2', 'core'), false, 2_000),
      applyReview(emptyMemory('b1', 'n1', 'net'), false, 3_000),
    ];
    expect(dueCardIds(cards, memories, now, { subjectId: 'core' })).toEqual(['a1', 'a2']);
    expect(dueCardIds(cards, memories, now, { deckId: 't2' })).toEqual(['a2']);
    expect(dueCardIds(cards, memories, now, { subjectId: 'core', domainNumber: 1 })).toEqual(['a1']);
    expect(dueCardIds(cards, memories, now, { subjectId: 'net' })).toEqual(['b1']);
  });
});

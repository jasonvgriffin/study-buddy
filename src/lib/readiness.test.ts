import { describe, expect, it } from 'vitest';
import { CHECKLIST_NOTE, readinessFacts } from './readiness';
import { emptyMemory } from './scoring';
import type { Card, CardMemory } from './types';

const BANNED = /percent[-\s]?ready|pass probability|probability of passing|you(?:'re| are) ready|ready to (?:pass|book)/i;

function card(partial: Partial<Card> & Pick<Card, 'id'>): Card {
  return {
    deckId: 'deck',
    subjectId: 'core',
    order: 0,
    sourceLabel: '1',
    question: 'Q',
    choices: [],
    correctLabels: [],
    answer: 'A',
    explanation: null,
    section: null,
    domainNumber: 1,
    domainName: 'Mobile Devices',
    objective: null,
    objectiveTitle: null,
    examCode: null,
    lessonUrl: null,
    videoStartSec: null,
    ...partial,
  };
}

function memory(partial: Partial<CardMemory> & Pick<CardMemory, 'cardId' | 'attempts' | 'correct' | 'dueAt'>): CardMemory {
  return {
    ...emptyMemory(partial.cardId, 'deck', 'core'),
    ...partial,
  };
}

describe('readiness facts', () => {
  const now = Date.parse('2026-10-02T15:00:00Z');

  it('splits domains at 80%, counts due cards, and keeps the day streak', () => {
    const facts = readinessFacts({
      cards: [
        card({ id: 'mobile', domainNumber: 1, domainName: 'Mobile Devices' }),
        card({ id: 'net', domainNumber: 2, domainName: 'Networking' }),
        card({ id: 'idle', domainNumber: 3, domainName: 'Hardware' }),
      ],
      memories: [
        memory({ cardId: 'mobile', attempts: 10, correct: 8, dueAt: now + 86_400_000 }),
        memory({ cardId: 'net', attempts: 5, correct: 2, dueAt: now }),
        memory({ cardId: 'idle', attempts: 0, correct: 0, dueAt: 0 }),
      ],
      reviews: [{ at: now }, { at: now - 86_400_000 }],
      now,
      offsetMinutes: 0,
    });
    expect(facts.above).toEqual([{ name: 'Mobile Devices', correct: 8, answered: 10 }]);
    expect(facts.below).toEqual([{ name: 'Networking', correct: 2, answered: 5 }]);
    expect(facts.due).toBe(1);
    expect(facts.streak).toBe(2);
  });

  it('does not invent a pass chance or a ready verdict', () => {
    expect(CHECKLIST_NOTE).toBe('These are facts only. You decide when to book the exam.');
    expect(CHECKLIST_NOTE).not.toMatch(BANNED);
    expect('Checklist At or above 80% Below 80% Due now Streak').not.toMatch(BANNED);
  });
});
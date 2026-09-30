import { describe, expect, it } from 'vitest';
import type { Card } from './types';
import {
  activeSessionForDeck,
  answerSession,
  createDrillSession,
  createExamSession,
  elapsedMs,
  liveScore,
  noteHidden,
  pauseSession,
  rehydrateSession,
  resumeSession,
} from './session';

function card(partial: Partial<Card> & Pick<Card, 'id' | 'deckId'>): Card {
  return {
    subjectId: 's',
    order: 0,
    sourceLabel: '1',
    question: 'Q',
    choices: [],
    correctLabels: [],
    answer: 'A',
    explanation: null,
    section: null,
    ...partial,
  };
}

describe('session timer', () => {
  const deck = { id: 'deck-b', subjectId: 's', name: 'Practice Exam B' };
  const cards = Array.from({ length: 90 }, (_, i) => card({ id: `c${i}`, deckId: 'deck-b', order: i }));

  it('pauses, reloads, and resumes at the same question and elapsed time', () => {
    let session = createExamSession(deck, cards, 'untimed', 0);
    session = { ...session, index: 36 };
    session = pauseSession(session, 41 * 60 * 1000 + 12 * 1000);
    expect(session.status).toBe('paused');
    expect(elapsedMs(session, 41 * 60 * 1000 + 12 * 1000)).toBe(41 * 60 * 1000 + 12 * 1000);
    const stored = JSON.parse(JSON.stringify(session));
    const reloaded = rehydrateSession(stored, 41 * 60 * 1000 + 12 * 1000 + 3 * 24 * 60 * 60 * 1000);
    expect(reloaded.index).toBe(36);
    expect(reloaded.accumulatedMs).toBe(41 * 60 * 1000 + 12 * 1000);
    expect(reloaded.status).toBe('paused');
    expect(elapsedMs(reloaded, 41 * 60 * 1000 + 12 * 1000 + 3 * 24 * 60 * 60 * 1000)).toBe(
      41 * 60 * 1000 + 12 * 1000,
    );
    const resumed = resumeSession(reloaded, 9_000_000);
    expect(resumed.accumulatedMs).toBe(41 * 60 * 1000 + 12 * 1000);
    expect(elapsedMs(resumed, 9_000_000 + 1500)).toBe(41 * 60 * 1000 + 12 * 1000 + 1500);
  });

  it('does not advance the timer while the tab is hidden', () => {
    let session = createExamSession(deck, cards, 'timed', 1_000);
    session = noteHidden(session, 6_000);
    expect(elapsedMs(session, 6_000 + 60 * 60 * 1000)).toBe(5_000);
    expect(session.runningSince).toBeNull();
    expect(session.timeLimitMs).toBe(90 * 60 * 1000);
  });

  it('keeps a session inside one test', () => {
    const other = card({ id: 'other', deckId: 'deck-a', order: 0 });
    const session = createExamSession(deck, [...cards, other], 'untimed', 0);
    expect(session.cardIds).toHaveLength(90);
    expect(session.cardIds.every((id) => id.startsWith('c'))).toBe(true);
    const drill = createDrillSession(deck, [...cards, other], ['c1', 'other', 'c2'], 'Section: Ports', 0);
    expect(drill.cardIds).toEqual(['c1', 'c2']);
    expect(drill.deckId).toBe('deck-b');
    expect(activeSessionForDeck([session, drill], 'deck-b')?.id).toBe(session.id);
  });

  it('requeues a missed drill card and scores the running total', () => {
    const drill = createDrillSession(deck, cards, ['c1', 'c2'], null, 0);
    const wrong = answerSession(drill, {
      cardId: 'c1',
      correct: false,
      chosenLabels: ['A'],
      at: 1000,
    });
    expect(wrong.session.cardIds).toEqual(['c1', 'c2', 'c1']);
    expect(wrong.finished).toBe(false);
    const next = answerSession(wrong.session, {
      cardId: 'c2',
      correct: true,
      chosenLabels: [],
      at: 2000,
    });
    const done = answerSession(next.session, {
      cardId: 'c1',
      correct: true,
      chosenLabels: [],
      at: 3000,
    });
    expect(done.finished).toBe(true);
    expect(liveScore(done.session).correct).toBe(2);
    expect(liveScore(done.session).answered).toBe(2);
  });
});

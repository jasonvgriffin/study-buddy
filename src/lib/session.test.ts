import { describe, expect, it } from 'vitest';
import type { Card } from './types';
import {
  activeSessionForDeck,
  drillStillOpenPrompt,
  missedDrillChoice,
  answerSession,
  continueAfterReview,
  createDrillSession,
  createExamSession,
  elapsedMs,
  finishSession,
  jumpToQuestion,
  jumpToSkipped,
  liveScore,
  normalizeSession,
  noteHidden,
  openSkipReview,
  pauseSession,
  rehydrateSession,
  resumeLabel,
  resumeLabelParts,
  resumeSession,
  skipQuestion,
  skippedUnanswered,
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

describe('missed drill while a sitting is open', () => {
  it('keeps the no-missed result ahead of an open session', () => {
    expect(missedDrillChoice({ missedCount: 0, openSession: true })).toBe('none');
    expect(missedDrillChoice({ missedCount: 0, openSession: false })).toBe('none');
    expect(missedDrillChoice({ missedCount: 0, openSession: true, replaceOpen: true })).toBe('none');
  });

  it('asks before replacing an open sitting, then starts once that is confirmed', () => {
    expect(missedDrillChoice({ missedCount: 2, openSession: true })).toBe('busy');
    expect(missedDrillChoice({ missedCount: 2, openSession: true, replaceOpen: true })).toBe('start');
    expect(missedDrillChoice({ missedCount: 2, openSession: false })).toBe('start');
    expect(drillStillOpenPrompt('Practice Exam A')).toBe(
      'Practice Exam A is still open. End it and start the drill?',
    );
  });
});

describe('resume line', () => {
  const deck = { id: 'deck-a', subjectId: 's', name: 'Practice Exam A' };
  const cards = Array.from({ length: 90 }, (_, i) => card({ id: `c${i}`, deckId: 'deck-a', order: i }));

  it('keeps the test name separate so the line can emphasize it', () => {
    const session = pauseSession(createExamSession(deck, cards, 'untimed', 0), 3_000);
    const parts = resumeLabelParts(session, 3_000);
    expect(parts).toEqual({
      lead: 'Resume ',
      name: 'Practice Exam A',
      rest: ': Question 1 of 90, 0:03 elapsed',
    });
    expect(resumeLabel(session, 3_000)).toBe('Resume Practice Exam A: Question 1 of 90, 0:03 elapsed');
  });
});

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
    expect(liveScore(done.session).unanswered).toBe(0);
  });
});

describe('skip for later', () => {
  const deck = { id: 'deck-b', subjectId: 's', name: 'Practice Exam B' };
  const cards = Array.from({ length: 4 }, (_, i) => card({ id: `c${i}`, deckId: 'deck-b', order: i }));

  it('leaves a question unanswered, advances, and keeps a timed clock running', () => {
    let session = createExamSession(deck, cards, 'timed', 1_000);
    session = skipQuestion(session, 'c0', 6_000);
    expect(session.answers).toEqual([]);
    expect(session.skipped).toEqual(['c0']);
    expect(session.index).toBe(1);
    expect(session.status).toBe('active');
    expect(session.runningSince).toBe(6_000);
    expect(session.skipReview).toBe(false);
    expect(elapsedMs(session, 8_000)).toBe(7_000);
    expect(liveScore(session).unanswered).toBe(4);
    expect(liveScore(session).correct).toBe(0);
    expect(liveScore(session).incorrect).toBe(0);
  });

  it('does not requeue a skipped drill card or record it as wrong', () => {
    const drill = createDrillSession(deck, cards, ['c0', 'c1'], null, 0);
    const skipped = skipQuestion(drill, 'c0', 1_000);
    expect(skipped.cardIds).toEqual(['c0', 'c1']);
    expect(skipped.answers).toEqual([]);
    expect(skipped.index).toBe(1);
    expect(skippedUnanswered(skipped)).toEqual(['c0']);
  });

  it('opens a review list at the end and still reports skips as unanswered after finish', () => {
    let session = createExamSession(deck, cards.slice(0, 3), 'untimed', 0);
    session = skipQuestion(session, 'c0', 1_000);
    session = skipQuestion(session, 'c1', 2_000);
    expect(session.skipReview).toBe(false);
    session = skipQuestion(session, 'c2', 3_000);
    expect(session.skipReview).toBe(true);
    expect(session.status).toBe('active');
    expect(session.index).toBe(3);
    expect(skippedUnanswered(session)).toEqual(['c0', 'c1', 'c2']);
    const paused = pauseSession(session, 4_000);
    const stored = JSON.parse(JSON.stringify(paused)) as typeof paused;
    const reloaded = rehydrateSession(stored, 4_000 + 86_400_000);
    expect(reloaded.status).toBe('paused');
    expect(reloaded.skipReview).toBe(true);
    expect(reloaded.skipped).toEqual(['c0', 'c1', 'c2']);
    expect(reloaded.answers).toEqual([]);
    expect(elapsedMs(reloaded, 4_000 + 86_400_000)).toBe(4_000);
    expect(resumeLabel(reloaded, 4_000 + 86_400_000)).toContain('3 skipped questions');
    expect(resumeLabelParts(reloaded, 4_000 + 86_400_000).name).toBe('Practice Exam B');
    const done = finishSession(reloaded, 5_000);
    expect(done.status).toBe('finished');
    expect(done.runningSince).toBeNull();
    expect(liveScore(done)).toMatchObject({ correct: 0, incorrect: 0, unanswered: 3, answered: 0 });
  });

  it('jumps back to a skipped question and returns to the list until it is answered', () => {
    let session = createExamSession(deck, cards.slice(0, 3), 'untimed', 0);
    session = skipQuestion(session, 'c0', 1_000);
    session = skipQuestion(session, 'c1', 2_000);
    session = skipQuestion(session, 'c2', 3_000);
    session = jumpToSkipped(session, 'c0', 4_000);
    expect(session.skipReview).toBe(false);
    expect(session.returnToReview).toBe(true);
    expect(session.index).toBe(0);
    const answered = answerSession(session, {
      cardId: 'c0',
      correct: true,
      chosenLabels: ['A'],
      at: 5_000,
    });
    expect(answered.finished).toBe(false);
    expect(answered.session.skipReview).toBe(true);
    expect(answered.session.skipped).toEqual(['c1', 'c2']);
    expect(liveScore(answered.session).unanswered).toBe(2);
    expect(liveScore(answered.session).correct).toBe(1);
  });

  it('resumes the bookmarked question after an early finish once skips are answered', () => {
    let session = createExamSession(deck, cards, 'untimed', 0);
    session = skipQuestion(session, 'c0', 1_000);
    expect(session.index).toBe(1);
    session = openSkipReview(session, 1_500);
    expect(session.bookmarkIndex).toBe(1);
    session = jumpToSkipped(session, 'c0', 2_000);
    const answered = answerSession(session, {
      cardId: 'c0',
      correct: false,
      chosenLabels: ['B'],
      at: 2_500,
    });
    expect(answered.finished).toBe(false);
    expect(answered.session.skipReview).toBe(false);
    expect(answered.session.index).toBe(1);
    expect(answered.session.answers).toHaveLength(1);
    expect(liveScore(answered.session).incorrect).toBe(1);
    expect(liveScore(answered.session).unanswered).toBe(3);
  });

  it('keeps a drill in play when a skipped card is later marked wrong', () => {
    const drill = createDrillSession(deck, cards, ['c0', 'c1', 'c2'], null, 0);
    let session = skipQuestion(drill, 'c0', 1_000);
    session = openSkipReview(session, 1_500);
    session = jumpToSkipped(session, 'c0', 2_000);
    const wrong = answerSession(session, {
      cardId: 'c0',
      correct: false,
      chosenLabels: [],
      at: 2_500,
    });
    expect(wrong.finished).toBe(false);
    expect(wrong.session.cardIds).toEqual(['c0', 'c1', 'c2', 'c0']);
    expect(wrong.session.index).toBe(1);
    expect(wrong.session.skipped).toEqual([]);
    const continued = answerSession(wrong.session, {
      cardId: 'c1',
      correct: true,
      chosenLabels: [],
      at: 3_000,
    });
    expect(continued.session.index).toBe(2);
    expect(continued.finished).toBe(false);
  });

  it('jumps to any question and replaces an exam answer when that card is graded again', () => {
    let session = createExamSession(deck, cards.slice(0, 3), 'untimed', 0);
    session = skipQuestion(session, 'c0', 1_000);
    const first = answerSession(session, {
      cardId: 'c1',
      correct: false,
      chosenLabels: ['B'],
      at: 2_000,
    });
    expect(first.session.index).toBe(2);
    const jumped = jumpToQuestion(first.session, 'c1', 2_500);
    expect(jumped.index).toBe(1);
    expect(jumped.skipReview).toBe(false);
    expect(jumped.returnToReview).toBe(false);
    const replaced = answerSession(jumped, {
      cardId: 'c1',
      correct: true,
      chosenLabels: ['A'],
      at: 3_000,
    });
    expect(replaced.session.answers).toEqual([
      { cardId: 'c1', correct: true, chosenLabels: ['A'], at: 3_000 },
    ]);
    expect(liveScore(replaced.session)).toMatchObject({ correct: 1, incorrect: 0, answered: 1, unanswered: 2 });
    const toSkipped = jumpToQuestion(replaced.session, 'c0', 3_500);
    expect(toSkipped.index).toBe(0);
    expect(toSkipped.returnToReview).toBe(true);
    const missing = jumpToQuestion(toSkipped, 'missing', 4_000);
    expect(missing.index).toBe(0);
  });

  it('returns to a paused review from continue, and repairs a session saved before skip existed', () => {
    let session = createExamSession(deck, cards, 'untimed', 0);
    session = skipQuestion(session, 'c0', 1_000);
    session = openSkipReview(session, 1_200);
    const resumed = continueAfterReview(session, 1_400);
    expect(resumed.skipReview).toBe(false);
    expect(resumed.index).toBe(1);
    expect(resumed.bookmarkIndex).toBeNull();
    const legacy = { ...createExamSession(deck, cards, 'untimed', 0) };
    delete (legacy as { skipped?: string[] }).skipped;
    delete (legacy as { skipReview?: boolean }).skipReview;
    const filled = normalizeSession(legacy);
    expect(filled.skipped).toEqual([]);
    expect(filled.skipReview).toBe(false);
    expect(filled.returnToReview).toBe(false);
    expect(filled.bookmarkIndex).toBeNull();
    const older = { ...createExamSession(deck, cards, 'untimed', 0) };
    delete (older as { flagged?: string[] }).flagged;
    expect(normalizeSession(older).flagged).toEqual([]);
    const kept = normalizeSession({
      ...createExamSession(deck, cards, 'untimed', 0),
      flagged: ['c0', 4 as unknown as string],
    });
    expect(kept.flagged).toEqual(['c0']);
    expect(kept.cardIds).toContain('c0');
  });
});

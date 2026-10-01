import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  closeStudyDb,
  deleteCard,
  deleteDraft,
  deleteSubject,
  exportBackup,
  figuresForCard,
  importBackup,
  loadSnapshot,
  putDeckBundle,
  putFigures,
  putReviewBundle,
  putSession,
  putSubject,
  relinkDraftFigures,
  resetStudyDb,
} from './db';
import { emptyMemory } from './scoring';
import { createExamSession, pauseSession, skipQuestion } from './session';
import type { Card, Deck, Review } from './types';

beforeEach(async () => {
  await resetStudyDb();
});

describe('IndexedDB', () => {
  it('keeps decks, reviews, and a paused session after the database is reopened', async () => {
    const now = 1_700_000_000_000;
    await putSubject({ id: 'sub', name: 'Field notes', createdAt: now, updatedAt: now });
    const cards: Card[] = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        subjectId: 'sub',
        order: 0,
        sourceLabel: '1',
        question: 'Which river runs through Cairo?',
        choices: [],
        correctLabels: ['A'],
        answer: 'Nile',
        explanation: null,
        section: 'Section: Rivers',
      },
    ];
    let session = createExamSession(
      { id: 'deck-1', subjectId: 'sub', name: 'Practice Test 1' },
      cards,
      'untimed',
      now,
    );
    session = { ...session, index: 0 };
    session = pauseSession(session, now + 75_000);
    const review: Review = {
      id: 'rev-1',
      cardId: 'card-1',
      deckId: 'deck-1',
      subjectId: 'sub',
      sessionId: session.id,
      correct: true,
      chosenLabels: ['A'],
      at: now + 70_000,
    };
    const memory = emptyMemory('card-1', 'deck-1', 'sub');
    memory.attempts = 1;
    memory.correct = 1;
    await putReviewBundle(review, memory, session);
    await putSession(session);

    await closeStudyDb();
    const again = await loadSnapshot();
    expect(again.subjects.map((subject) => subject.name)).toEqual(['Field notes']);
    expect(again.reviews).toHaveLength(1);
    expect(again.reviews[0].correct).toBe(true);
    expect(again.sessions).toHaveLength(1);
    expect(again.sessions[0].index).toBe(0);
    expect(again.sessions[0].accumulatedMs).toBe(75_000);
    expect(again.sessions[0].status).toBe('paused');
    expect(again.memories[0].correct).toBe(1);
  });

  it('keeps skipped questions on a paused session with no review recorded', async () => {
    const now = 1_700_000_000_000;
    await putSubject({ id: 'sub', name: 'Field notes', createdAt: now, updatedAt: now });
    const cards: Card[] = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        subjectId: 'sub',
        order: 0,
        sourceLabel: '1',
        question: 'Which river runs through Cairo?',
        choices: [],
        correctLabels: ['A'],
        answer: 'Nile',
        explanation: null,
        section: 'Section: Rivers',
      },
      {
        id: 'card-2',
        deckId: 'deck-1',
        subjectId: 'sub',
        order: 1,
        sourceLabel: '2',
        question: 'Which two rivers are in Europe?',
        choices: [],
        correctLabels: ['A', 'C'],
        answer: 'Danube and Rhine',
        explanation: null,
        section: 'Section: Rivers',
      },
    ];
    let session = createExamSession(
      { id: 'deck-1', subjectId: 'sub', name: 'Practice Test 1' },
      cards,
      'timed',
      now,
    );
    session = skipQuestion(session, 'card-1', now + 5_000);
    session = pauseSession(session, now + 8_000);
    await putSession(session);
    await closeStudyDb();
    const again = await loadSnapshot();
    expect(again.sessions).toHaveLength(1);
    expect(again.sessions[0].skipped).toEqual(['card-1']);
    expect(again.sessions[0].index).toBe(1);
    expect(again.sessions[0].answers).toEqual([]);
    expect(again.sessions[0].status).toBe('paused');
    expect(again.reviews).toHaveLength(0);
    expect(again.memories).toHaveLength(0);
    expect(again.sessions[0].accumulatedMs).toBe(8_000);
  });

  it('keeps two subjects separate when one is deleted', async () => {
    const now = 10;
    await putSubject({ id: 'a', name: 'One', createdAt: now, updatedAt: now });
    await putSubject({ id: 'b', name: 'Two', createdAt: now, updatedAt: now });
    await deleteSubject('a');
    const snapshot = await loadSnapshot();
    expect(snapshot.subjects.map((subject) => subject.id)).toEqual(['b']);
  });

  it('keeps a figure attached to the saved card and restores it from a backup', async () => {
    const png = new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' });
    await putFigures([
      { id: 'fig-1', draftId: 'draft-1', cardId: null, captureId: 'cap-1', role: 'question', png },
    ]);
    await relinkDraftFigures('draft-1', new Map([['cap-1', 'card-1']]));
    await deleteDraft('draft-1');
    await closeStudyDb();
    const rows = await figuresForCard('card-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].draftId).toBeNull();
    expect(rows[0].role).toBe('question');
    const backup = await exportBackup();
    expect(backup.figures?.[0].captureId).toBe('cap-1');
    await resetStudyDb();
    await importBackup({
      version: 1,
      exportedAt: backup.exportedAt,
      subjects: [],
      decks: [],
      cards: [],
      reviews: [],
      sessions: [],
      memories: [],
      figures: backup.figures,
    });
    const restored = await figuresForCard('card-1');
    expect(restored).toHaveLength(1);
    expect(new Uint8Array(await restored[0].png.arrayBuffer())[0]).toBe(137);
  });

  it('keeps a flagged card after reopen and removes it from the test and the sitting', async () => {
    const now = 1_700_000_000_000;
    await putSubject({ id: 'sub', name: 'Field notes', createdAt: now, updatedAt: now });
    const deck: Deck = {
      id: 'deck-1',
      subjectId: 'sub',
      name: 'Practice Test 1',
      sourceFileName: 'sample.pdf',
      sourceGroupId: 'group-1',
      domains: [],
      createdAt: now,
      updatedAt: now,
    };
    const cards: Card[] = [
      {
        id: 'card-1',
        deckId: 'deck-1',
        subjectId: 'sub',
        order: 0,
        sourceLabel: '1',
        question: 'Which river runs through Cairo?',
        choices: [{ label: 'A', text: 'Nile', explanation: null }],
        correctLabels: ['A'],
        answer: 'A. Nile',
        explanation: 'Cairo sits on the Nile.',
        section: null,
        domainNumber: null,
        domainName: null,
        objective: null,
        objectiveTitle: null,
        examCode: null,
        lessonUrl: null,
        videoStartSec: null,
        reported: true,
      },
      {
        id: 'card-2',
        deckId: 'deck-1',
        subjectId: 'sub',
        order: 1,
        sourceLabel: '2',
        question: 'Which tool drives a nail?',
        choices: [],
        correctLabels: [],
        answer: 'Hammer',
        explanation: null,
        section: null,
        domainNumber: null,
        domainName: null,
        objective: null,
        objectiveTitle: null,
        examCode: null,
        lessonUrl: null,
        videoStartSec: null,
      },
    ];
    await putDeckBundle(deck, cards);
    let session = createExamSession({ id: 'deck-1', subjectId: 'sub', name: 'Practice Test 1' }, cards, 'untimed', now);
    session = { ...session, flagged: ['card-1'], skipped: ['card-1'], index: 1 };
    await putSession(session);
    await closeStudyDb();
    const again = await loadSnapshot();
    expect(again.cards.find((card) => card.id === 'card-1')?.reported).toBe(true);
    expect(again.cards.find((card) => card.id === 'card-2')?.reported).toBeUndefined();
    await deleteCard('card-1');
    await closeStudyDb();
    const after = await loadSnapshot();
    expect(after.cards.map((card) => card.id)).toEqual(['card-2']);
    expect(after.sessions).toHaveLength(1);
    expect(after.sessions[0].cardIds).toEqual(['card-2']);
    expect(after.sessions[0].originalCount).toBe(1);
    expect(after.sessions[0].flagged).toEqual([]);
    expect(after.sessions[0].skipped).toEqual([]);
    expect(after.sessions[0].index).toBe(0);
  });
});

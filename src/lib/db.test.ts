import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  closeStudyDb,
  deleteDraft,
  deleteSubject,
  exportBackup,
  figuresForCard,
  importBackup,
  loadSnapshot,
  putFigures,
  putReviewBundle,
  putSession,
  putSubject,
  relinkDraftFigures,
  resetStudyDb,
} from './db';
import { emptyMemory } from './scoring';
import { createExamSession, pauseSession } from './session';
import type { Card, Review } from './types';

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
});

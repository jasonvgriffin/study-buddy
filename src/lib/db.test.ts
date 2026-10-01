import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  closeStudyDb,
  deleteCard,
  deleteDraft,
  deleteSourceGroup,
  deleteSubject,
  exportBackup,
  figuresForCard,
  importBackup,
  openStudyDb,
  loadSnapshot,
  putDeckBundle,
  putDraft,
  putFigures,
  saveBackupMeta,
  savePersistMeta,
  putReviewBundle,
  putSession,
  putSubject,
  relinkDraftFigures,
  resetStudyDb,
  wipeStudyDatabase,
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
    const stored = await (await openStudyDb()).get('figures', 'fig-1');
    expect(stored?.bytes).toBeInstanceOf(ArrayBuffer);
    expect(stored?.mime).toBe('image/png');
    expect(stored?.png).toBeUndefined();
    expect(new Uint8Array(stored?.bytes ?? new ArrayBuffer(0))[0]).toBe(137);
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

  it('still reads a figure that was saved as a Blob', async () => {
    const db = await openStudyDb();
    const png = new Blob([Uint8Array.from([137, 80, 78, 71, 13])], { type: 'image/png' });
    await db.put('figures', {
      id: 'legacy',
      draftId: null,
      cardId: 'card-legacy',
      captureId: 'cap-legacy',
      role: 'question',
      png,
    });
    const [row] = await figuresForCard('card-legacy');
    expect(new Uint8Array(await row.png.arrayBuffer())).toEqual(Uint8Array.from([137, 80, 78, 71, 13]));
    const backup = await exportBackup();
    expect(backup.figures?.find((figure) => figure.id === 'legacy')?.pngBase64).toBeTruthy();
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
    const restored = await (await openStudyDb()).get('figures', 'legacy');
    expect(restored?.bytes).toBeInstanceOf(ArrayBuffer);
    expect(restored?.png).toBeUndefined();
    const [again] = await figuresForCard('card-legacy');
    expect(new Uint8Array(await again.png.arrayBuffer())[0]).toBe(137);
  });

  it('reports a plain message when a picture cannot be stored', async () => {
    await expect(
      putFigures([
        { id: 'empty', draftId: null, cardId: null, captureId: 'cap', role: 'question' },
      ]),
    ).rejects.toThrow(/Could not save the pictures from this PDF/);
  });

  it('loads a saved flagged field and imports a backup that still has one', async () => {
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
    expect(again.cards.find((card) => card.id === 'card-1')?.question).toBe('Which river runs through Cairo?');
    expect(again.cards.find((card) => card.id === 'card-1')?.reported).toBe(true);
    expect(again.sessions[0]?.flagged).toEqual(['card-1']);
    expect(again.sessions[0]?.skipped).toEqual(['card-1']);
    const backup = await exportBackup();
    await resetStudyDb();
    await importBackup(backup);
    const imported = await loadSnapshot();
    expect(imported.cards.find((card) => card.id === 'card-1')?.reported).toBe(true);
    expect(imported.sessions[0]?.flagged).toEqual(['card-1']);
    expect(imported.sessions[0]?.skipped).toEqual(['card-1']);
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

  it('remembers when a backup was exported and when the reminder was dismissed', async () => {
    await saveBackupMeta({ key: 'backup', exportedAt: 50, reminderDismissedAt: null });
    await closeStudyDb();
    const again = await loadSnapshot();
    expect(again.backup).toEqual({ key: 'backup', exportedAt: 50, reminderDismissedAt: null });
    await saveBackupMeta({ key: 'backup', exportedAt: 50, reminderDismissedAt: 80 });
    await closeStudyDb();
    const dismissed = await loadSnapshot();
    expect(dismissed.backup?.reminderDismissedAt).toBe(80);
    expect(dismissed.persist).toBeNull();
  });

  it('deletes one uploaded PDF and leaves the other file in the same subject', async () => {
    const now = 20;
    await putSubject({ id: 'a', name: 'A+', createdAt: now, updatedAt: now });
    const kept: Deck = {
      id: 'deck-keep',
      subjectId: 'a',
      name: 'Notes',
      sourceFileName: 'notes.pdf',
      sourceGroupId: 'file-notes',
      domains: [],
      createdAt: now,
      updatedAt: now,
    };
    const dropped: Deck = {
      id: 'deck-drop',
      subjectId: 'a',
      name: 'Practice Test 1',
      sourceFileName: 'core.pdf',
      sourceGroupId: 'file-core',
      domains: [],
      createdAt: now,
      updatedAt: now,
    };
    const keptCard: Card = {
      id: 'card-keep',
      deckId: 'deck-keep',
      subjectId: 'a',
      order: 0,
      sourceLabel: '1',
      question: 'Keep me',
      choices: [],
      correctLabels: [],
      answer: 'Yes',
      explanation: null,
      section: null,
      domainNumber: null,
      domainName: null,
      objective: null,
      objectiveTitle: null,
      examCode: null,
      lessonUrl: null,
      videoStartSec: null,
    };
    const droppedCard: Card = { ...keptCard, id: 'card-drop', deckId: 'deck-drop', question: 'Drop me' };
    await putDeckBundle(kept, [keptCard]);
    await putDeckBundle(dropped, [droppedCard]);
    const session = createExamSession({ id: 'deck-drop', subjectId: 'a', name: 'Practice Test 1' }, [droppedCard], 'untimed', now);
    await putSession(session);
    await putReviewBundle(
      {
        id: 'rev-drop',
        cardId: 'card-drop',
        deckId: 'deck-drop',
        subjectId: 'a',
        sessionId: session.id,
        correct: false,
        chosenLabels: [],
        at: now,
      },
      { ...emptyMemory('card-drop', 'deck-drop', 'a'), attempts: 1, incorrect: 1, lastResult: 'incorrect', streak: 0 },
      session,
    );
    await putFigures([
      {
        id: 'fig-drop',
        draftId: null,
        cardId: 'card-drop',
        captureId: 'cap-drop',
        role: 'question',
        png: new Blob([Uint8Array.from([1])], { type: 'image/png' }),
      },
    ]);
    await putDraft({
      id: 'file-core',
      subjectId: 'a',
      fileName: 'core.pdf',
      tests: [],
      domains: [],
      updatedAt: now,
    });
    await putDraft({
      id: 'draft-other',
      subjectId: 'a',
      fileName: 'later.pdf',
      tests: [],
      domains: [],
      updatedAt: now,
    });
    await deleteSourceGroup('file-core');
    const snapshot = await loadSnapshot();
    expect(snapshot.subjects.map((subject) => subject.id)).toEqual(['a']);
    expect(snapshot.decks.map((deck) => deck.id)).toEqual(['deck-keep']);
    expect(snapshot.cards.map((card) => card.id)).toEqual(['card-keep']);
    expect(snapshot.reviews).toEqual([]);
    expect(snapshot.sessions).toEqual([]);
    expect(snapshot.memories).toEqual([]);
    expect(snapshot.drafts.map((draft) => draft.id)).toEqual(['draft-other']);
    expect(await figuresForCard('card-drop')).toEqual([]);
  });

  it('deletes a subject together with its questions, metrics, sessions, and files', async () => {
    const now = 30;
    await putSubject({ id: 'a', name: 'A+', createdAt: now, updatedAt: now });
    await putSubject({ id: 'b', name: 'Network+', createdAt: now, updatedAt: now });
    const deck: Deck = {
      id: 'deck-a',
      subjectId: 'a',
      name: 'Practice Test 1',
      sourceFileName: 'core.pdf',
      sourceGroupId: 'file-a',
      domains: [],
      createdAt: now,
      updatedAt: now,
    };
    const other: Deck = { ...deck, id: 'deck-b', subjectId: 'b', name: 'Network notes', sourceGroupId: 'file-b' };
    const card: Card = {
      id: 'card-a',
      deckId: 'deck-a',
      subjectId: 'a',
      order: 0,
      sourceLabel: '1',
      question: 'Which cable?',
      choices: [],
      correctLabels: [],
      answer: 'Cat 6',
      explanation: null,
      section: null,
      domainNumber: 1,
      domainName: 'Hardware',
      objective: '1.1',
      objectiveTitle: 'Cables',
      examCode: null,
      lessonUrl: null,
      videoStartSec: null,
    };
    const otherCard: Card = { ...card, id: 'card-b', deckId: 'deck-b', subjectId: 'b', question: 'Which protocol?' };
    await putDeckBundle(deck, [card]);
    await putDeckBundle(other, [otherCard]);
    const session = createExamSession({ id: 'deck-a', subjectId: 'a', name: 'Practice Test 1' }, [card], 'untimed', now);
    await putReviewBundle(
      {
        id: 'rev-a',
        cardId: 'card-a',
        deckId: 'deck-a',
        subjectId: 'a',
        sessionId: session.id,
        correct: true,
        chosenLabels: ['A'],
        at: now,
      },
      { ...emptyMemory('card-a', 'deck-a', 'a'), attempts: 4, correct: 2, incorrect: 2, streak: 2, bestStreak: 3 },
      session,
    );
    await putDraft({
      id: 'draft-a',
      subjectId: 'a',
      fileName: 'core.pdf',
      tests: [],
      domains: [],
      updatedAt: now,
    });
    await putFigures([
      {
        id: 'fig-a',
        draftId: 'draft-a',
        cardId: null,
        captureId: 'cap-a',
        role: 'question',
        png: new Blob([Uint8Array.from([2])], { type: 'image/png' }),
      },
    ]);
    await deleteSubject('a');
    const snapshot = await loadSnapshot();
    expect(snapshot.subjects.map((subject) => subject.name)).toEqual(['Network+']);
    expect(snapshot.decks.map((item) => item.id)).toEqual(['deck-b']);
    expect(snapshot.cards.map((item) => item.id)).toEqual(['card-b']);
    expect(snapshot.reviews).toEqual([]);
    expect(snapshot.sessions).toEqual([]);
    expect(snapshot.memories).toEqual([]);
    expect(snapshot.drafts).toEqual([]);
    const db = await openStudyDb();
    expect(await db.getAll('figures')).toEqual([]);
  });

  it('wipes every study store, including backup meta, back to an empty database', async () => {
    const now = 40;
    await putSubject({ id: 'a', name: 'A+', createdAt: now, updatedAt: now });
    await putDeckBundle(
      {
        id: 'deck-a',
        subjectId: 'a',
        name: 'Practice Test 1',
        sourceFileName: 'core.pdf',
        sourceGroupId: 'file-a',
        domains: [],
        createdAt: now,
        updatedAt: now,
      },
      [
        {
          id: 'card-a',
          deckId: 'deck-a',
          subjectId: 'a',
          order: 0,
          sourceLabel: '1',
          question: 'Which cable?',
          choices: [],
          correctLabels: [],
          answer: 'Cat 6',
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
      ],
    );
    const session = createExamSession({ id: 'deck-a', subjectId: 'a', name: 'Practice Test 1' }, [], 'untimed', now);
    await putSession({ ...session, cardIds: ['card-a'], originalCount: 1 });
    await saveBackupMeta({ key: 'backup', exportedAt: now, reminderDismissedAt: now });
    await savePersistMeta({ key: 'persist', granted: true, at: now });
    await putDraft({ id: 'draft-a', subjectId: 'a', fileName: 'core.pdf', tests: [], domains: [], updatedAt: now });
    const fresh = await wipeStudyDatabase();
    expect(fresh.subjects).toEqual([]);
    expect(fresh.decks).toEqual([]);
    expect(fresh.cards).toEqual([]);
    expect(fresh.reviews).toEqual([]);
    expect(fresh.sessions).toEqual([]);
    expect(fresh.memories).toEqual([]);
    expect(fresh.drafts).toEqual([]);
    expect(fresh.backup).toBeNull();
    expect(fresh.persist).toBeNull();
    await closeStudyDb();
    const again = await loadSnapshot();
    expect(again.subjects).toEqual([]);
    expect(again.sessions).toEqual([]);
    const db = await openStudyDb();
    expect(await db.getAll('figures')).toEqual([]);
    expect(await db.getAll('meta')).toEqual([]);
  });
});

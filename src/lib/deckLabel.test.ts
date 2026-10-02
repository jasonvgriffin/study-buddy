import { describe, expect, it } from 'vitest';
import { deckLabel, sessionDeckLabel, type DeckLabelSource } from './deckLabel';

const MESSER = 'professor-messer-a-plus-220-1201-core-1-practice-exams-v111.pdf';

function deck(partial: Partial<DeckLabelSource> & Pick<DeckLabelSource, 'id' | 'name' | 'sourceFileName'>): DeckLabelSource {
  return {
    subjectId: 'core',
    createdAt: 1,
    ...partial,
  };
}

describe('deckLabel', () => {
  it('leaves a unique name unchanged', () => {
    const only = deck({ id: 'a', name: 'Practice Exam A', sourceFileName: MESSER });
    const other = deck({ id: 'b', name: 'Practice Exam B', sourceFileName: MESSER, createdAt: 2 });
    expect(deckLabel(only, [only, other])).toBe('Practice Exam A');
    expect(deckLabel(other, [only, other])).toBe('Practice Exam B');
  });

  it('adds a short source when the same subject has the name twice', () => {
    const messer = deck({ id: 'm', name: 'Practice Exam A', sourceFileName: MESSER, createdAt: 1 });
    const dion = deck({
      id: 'd',
      name: 'Practice Exam A',
      sourceFileName: 'dion-training-comptia-a-plus-core-1-practice-exams.pdf',
      createdAt: 2,
    });
    const decks = [messer, dion];
    expect(deckLabel(messer, decks)).toBe('Practice Exam A, Messer');
    expect(deckLabel(dion, decks)).toBe('Practice Exam A, Dion');
  });

  it('treats case and extra spaces as the same name, and only within one subject', () => {
    const messer = deck({ id: 'm', name: 'Practice Exam A', sourceFileName: MESSER });
    const spaced = deck({
      id: 's',
      name: 'practice   exam a',
      sourceFileName: 'dion-training-practice.pdf',
      createdAt: 2,
    });
    const otherSubject = deck({
      id: 'o',
      subjectId: 'security',
      name: 'Practice Exam A',
      sourceFileName: 'jason-dion-practice.pdf',
      createdAt: 3,
    });
    expect(deckLabel(messer, [messer, spaced, otherSubject])).toBe('Practice Exam A, Messer');
    expect(deckLabel(spaced, [messer, spaced, otherSubject])).toBe('practice   exam a, Dion');
    expect(deckLabel(otherSubject, [messer, spaced, otherSubject])).toBe('Practice Exam A');
  });

  it('falls back to the full file stem when the short source still matches', () => {
    const long = deck({ id: 'long', name: 'Practice Exam A', sourceFileName: MESSER, createdAt: 1 });
    const notes = deck({
      id: 'notes',
      name: 'Practice Exam A',
      sourceFileName: 'the-messer-comptia-core-2-practice-exam.pdf',
      createdAt: 2,
    });
    const dion = deck({
      id: 'dion',
      name: 'Practice Exam A',
      sourceFileName: 'dion-training-comptia-a-plus-practice-exams.pdf',
      createdAt: 3,
    });
    const decks = [long, notes, dion];
    expect(deckLabel(long, decks)).toBe(`Practice Exam A, ${MESSER.replace(/\.pdf$/i, '')}`);
    expect(deckLabel(notes, decks)).toBe('Practice Exam A, the-messer-comptia-core-2-practice-exam');
    expect(deckLabel(dion, decks)).toBe('Practice Exam A, Dion');
  });

  it('numbers identical file stems by createdAt', () => {
    const earlier = deck({ id: 'later-id', name: 'Practice Exam A', sourceFileName: 'notes.pdf', createdAt: 10 });
    const later = deck({ id: 'earlier-id', name: 'Practice Exam A', sourceFileName: 'notes.pdf', createdAt: 50 });
    const decks = [later, earlier];
    expect(deckLabel(earlier, decks)).toBe('Practice Exam A, notes (1)');
    expect(deckLabel(later, decks)).toBe('Practice Exam A, notes (2)');
  });
});

describe('sessionDeckLabel', () => {
  it('uses the display label for an exam and keeps a review label that is not the test name', () => {
    const messer = deck({ id: 'm', name: 'Practice Exam A', sourceFileName: MESSER });
    const dion = deck({
      id: 'd',
      name: 'Practice Exam A',
      sourceFileName: 'dion-training-practice.pdf',
      createdAt: 2,
    });
    const decks = [messer, dion];
    expect(sessionDeckLabel({ deckId: 'm', deckName: 'Practice Exam A', kind: 'exam' }, decks)).toBe(
      'Practice Exam A, Messer',
    );
    expect(sessionDeckLabel({ deckId: 'm', deckName: 'Due for review', kind: 'review' }, decks)).toBe(
      'Due for review',
    );
    expect(sessionDeckLabel({ deckId: 'missing', deckName: 'Practice Exam A', kind: 'exam' }, decks)).toBe(
      'Practice Exam A',
    );
  });
});

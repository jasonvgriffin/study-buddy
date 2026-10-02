import { describe, expect, it } from 'vitest';
import { sessionDeckLabel } from './deckLabel';
import { resumeButtonLabel } from './resumeButton';

describe('resume button label', () => {
  it('names the test being resumed', () => {
    expect(resumeButtonLabel('Practice Exam B')).toBe('Resume Practice Exam B');
    expect(resumeButtonLabel('  Practice Exam A  ')).toBe('Resume Practice Exam A');
  });

  it('says Resume when the test name is missing', () => {
    expect(resumeButtonLabel(null)).toBe('Resume');
    expect(resumeButtonLabel(undefined)).toBe('Resume');
    expect(resumeButtonLabel('')).toBe('Resume');
    expect(resumeButtonLabel('   ')).toBe('Resume');
    expect(resumeButtonLabel(sessionDeckLabel({ deckId: 'gone', deckName: '', kind: 'exam' }, []))).toBe('Resume');
  });

  it('uses the display label when two tests in one subject share a name', () => {
    const decks = [
      {
        id: 'm',
        subjectId: 'core',
        name: 'Practice Exam A',
        sourceFileName: 'professor-messer-a-plus-220-1201-core-1-practice-exams-v111.pdf',
        createdAt: 1,
      },
      {
        id: 'd',
        subjectId: 'core',
        name: 'Practice Exam A',
        sourceFileName: 'dion-training-comptia-a-plus-core-1-practice-exams.pdf',
        createdAt: 2,
      },
    ];
    expect(
      resumeButtonLabel(sessionDeckLabel({ deckId: 'm', deckName: 'Practice Exam A', kind: 'exam' }, decks)),
    ).toBe('Resume Practice Exam A, Messer');
    expect(
      resumeButtonLabel(sessionDeckLabel({ deckId: 'd', deckName: 'Practice Exam A', kind: 'exam' }, decks)),
    ).toBe('Resume Practice Exam A, Dion');
  });
});

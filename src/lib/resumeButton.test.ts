import { describe, expect, it } from 'vitest';
import { resumeButtonLabel, resumeTestName } from './resumeButton';

const decks = [
  { id: 'a', name: 'Practice Exam A' },
  { id: 'b', name: 'Practice Exam B' },
];

describe('resume button label', () => {
  it('names the test being resumed', () => {
    expect(resumeButtonLabel('Practice Exam B')).toBe('Resume Practice Exam B');
    expect(resumeButtonLabel('  Practice Exam A  ')).toBe('Resume Practice Exam A');
    expect(resumeButtonLabel(resumeTestName(decks, 'b'))).toBe('Resume Practice Exam B');
  });

  it('says Resume when the test name is missing', () => {
    expect(resumeButtonLabel(null)).toBe('Resume');
    expect(resumeButtonLabel(undefined)).toBe('Resume');
    expect(resumeButtonLabel('')).toBe('Resume');
    expect(resumeButtonLabel('   ')).toBe('Resume');
    expect(resumeButtonLabel(resumeTestName(decks, 'missing'))).toBe('Resume');
    expect(resumeButtonLabel(resumeTestName([{ id: 'blank', name: '   ' }], 'blank'))).toBe('Resume');
    expect(resumeButtonLabel(resumeTestName([], 'a'))).toBe('Resume');
  });
});

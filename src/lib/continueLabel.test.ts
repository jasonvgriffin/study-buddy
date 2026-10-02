import { describe, expect, it } from 'vitest';
import { continueButtonLabel } from './continueLabel';

const subjects = [
  { id: 'net', name: 'Net+' },
  { id: 'sec', name: 'Security+' },
  { id: 'custom', name: 'Field biology' },
];

describe('continue button label', () => {
  it('uses the subject the resumable session is filed under', () => {
    expect(continueButtonLabel({ subjects, sessionSubjectId: 'net', deckSubjectId: 'net' })).toBe('Continue Net+');
    expect(continueButtonLabel({ subjects, sessionSubjectId: 'sec', deckSubjectId: 'sec' })).toBe(
      'Continue Security+',
    );
    expect(continueButtonLabel({ subjects, sessionSubjectId: 'custom', deckSubjectId: 'custom' })).toBe(
      'Continue Field biology',
    );
  });

  it('falls back to the exam deck subject when the session has no subject', () => {
    expect(continueButtonLabel({ subjects, sessionSubjectId: null, deckSubjectId: 'sec' })).toBe(
      'Continue Security+',
    );
    expect(continueButtonLabel({ subjects, sessionSubjectId: '', deckSubjectId: 'net' })).toBe('Continue Net+');
    expect(continueButtonLabel({ subjects, sessionSubjectId: 'missing', deckSubjectId: 'custom' })).toBe(
      'Continue Field biology',
    );
  });

  it('says Continue when the subject cannot be determined', () => {
    expect(continueButtonLabel({ subjects, sessionSubjectId: null, deckSubjectId: null })).toBe('Continue');
    expect(continueButtonLabel({ subjects, sessionSubjectId: 'gone', deckSubjectId: 'also-gone' })).toBe('Continue');
    expect(continueButtonLabel({ subjects: [{ id: 'blank', name: '   ' }], sessionSubjectId: 'blank' })).toBe(
      'Continue',
    );
    expect(continueButtonLabel({ subjects: [], sessionSubjectId: 'net', deckSubjectId: 'sec' })).toBe('Continue');
  });
});

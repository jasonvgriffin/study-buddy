import { describe, expect, it } from 'vitest';
import { READING_STATUS, UPLOADING_STATUS, addedQuestionsMessage } from './importStatus';

describe('import status copy', () => {
  it('uses the upload and reading lines', () => {
    expect(UPLOADING_STATUS).toBe('Uploading…');
    expect(READING_STATUS).toBe('Reading questions… please wait');
  });

  it('counts questions in the success line', () => {
    expect(addedQuestionsMessage(1, 'core.pdf')).toBe('Added 1 question from core.pdf');
    expect(addedQuestionsMessage(28, 'Practice.pdf')).toBe('Added 28 questions from Practice.pdf');
  });
});

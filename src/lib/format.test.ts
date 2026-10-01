import { describe, expect, it } from 'vitest';
import { compareTestNames } from './format';

describe('compareTestNames', () => {
  it('sorts tests alphabetically with a natural, case-insensitive comparison', () => {
    const names = ['Practice Exam B', 'Practice Exam C', 'Practice Exam A', 'Exam 10', 'exam 2'];
    expect([...names].sort(compareTestNames)).toEqual([
      'exam 2',
      'Exam 10',
      'Practice Exam A',
      'Practice Exam B',
      'Practice Exam C',
    ]);
  });
});

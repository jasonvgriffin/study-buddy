import { describe, expect, it } from 'vitest';
import { isFooterChrome, isMarginChrome, linesFromGlyphs } from './pdfLayout';

describe('pdf layout', () => {
  it('drops margin links that share a row with a choice', () => {
    const lines = linesFromGlyphs([
      { str: 'A. ', x: 69, y: 400, w: 16 },
      { str: 'Restart the spooler', x: 86, y: 400, w: 110 },
      { str: 'Quick', x: 330, y: 402, w: 28 },
      { str: 'Answer: 31', x: 328, y: 388, w: 52 },
    ]);
    expect(lines.join('\n')).toContain('Restart the spooler');
    expect(lines.join('\n')).not.toContain('Quick');
    expect(lines.join('\n')).not.toContain('Answer: 31');
  });

  it('drops running footers', () => {
    expect(isFooterChrome('Practice Exam A - Questions 7')).toBe(true);
    expect(isFooterChrome('6 Practice Exam A - Questions')).toBe(true);
    expect(isMarginChrome('The Details: 44')).toBe(true);
    expect(isFooterChrome('Practice Exam A')).toBe(false);
  });
});

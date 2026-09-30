import { describe, expect, it } from 'vitest';
import { watchUrl } from './lessons';

describe('watch links', () => {
  it('opens a verified YouTube video and otherwise keeps the PDF URL', () => {
    expect(watchUrl(null, null)).toBeNull();
    expect(watchUrl('https://professormesser.link/1201050201', null)).toBe(
      'https://www.youtube.com/watch?v=aVIuyHCNPCE',
    );
    expect(watchUrl('https://example.com/not-in-the-map', null)).toBe('https://example.com/not-in-the-map');
  });

  it('adds a start time only when one was set', () => {
    expect(watchUrl('https://example.com/lesson', 95)).toBe('https://example.com/lesson?t=95');
    expect(watchUrl('https://www.youtube.com/watch?v=abc', 12)).toBe(
      'https://www.youtube.com/watch?v=abc&t=12',
    );
    expect(watchUrl('https://example.com/lesson', 0)).toBe('https://example.com/lesson');
  });
});

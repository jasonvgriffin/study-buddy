// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTextSize, parseTextSize, readTextSize, writeTextSize } from './textSize';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.textSize;
});

describe('text size', () => {
  it('keeps a known size and falls back to normal', () => {
    expect(parseTextSize('large')).toBe('large');
    expect(parseTextSize('xlarge')).toBe('xlarge');
    expect(parseTextSize('huge')).toBe('normal');
    expect(parseTextSize(null)).toBe('normal');
  });

  it('persists the choice and applies it on the page', () => {
    writeTextSize('xlarge');
    expect(readTextSize()).toBe('xlarge');
    expect(document.documentElement.dataset.textSize).toBe('xlarge');
    applyTextSize(readTextSize());
    expect(document.documentElement.dataset.textSize).toBe('xlarge');
  });
});

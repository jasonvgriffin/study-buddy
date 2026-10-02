import { describe, expect, it } from 'vitest';
import { parseRoute } from './nav';

describe('stats routes', () => {
  it('keeps the overall stats page and reads a per-test page', () => {
    expect(parseRoute('#/stats')).toEqual({ name: 'stats' });
    expect(parseRoute('#/stats/test')).toEqual({ name: 'stats' });
    expect(parseRoute('#/stats/test/deck-1')).toEqual({ name: 'stats', deckId: 'deck-1' });
    expect(parseRoute('#/stats/test/deck%2F1?x=1')).toEqual({ name: 'stats', deckId: 'deck/1' });
  });
});

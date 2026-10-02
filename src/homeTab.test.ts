import { describe, expect, it } from 'vitest';
import { legacyHomeHash, nextHomeTab, parseHomeTab, resolveHomeTab, tabForRoute } from './homeTab';
import type { Route } from './nav';

const deck: Route = { name: 'deck', deckId: 'deck-1', cardId: 'card-1' };
const review: Route = { name: 'review', draftId: 'draft-1' };
const session: Route = { name: 'session', sessionId: 'session-1' };
const results: Route = { name: 'results', sessionId: 'session-1' };

describe('home tab', () => {
  it('reads a tab deep link and ignores a bare home URL', () => {
    expect(parseHomeTab('#/?tab=study')).toBe('study');
    expect(parseHomeTab('#/?tab=library')).toBe('library');
    expect(parseHomeTab('#/?tab=stats')).toBe('stats');
    expect(parseHomeTab('#/?tab=settings')).toBe('settings');
    expect(parseHomeTab('#/')).toBeNull();
    expect(parseHomeTab('')).toBeNull();
    expect(parseHomeTab('#')).toBeNull();
    expect(parseHomeTab('#/?tab=nope')).toBeNull();
    expect(parseHomeTab('#/deck/abc?tab=library')).toBe('library');
  });

  it('opens the old progress tab as the Stats section', () => {
    expect(parseHomeTab('#/?tab=progress')).toBe('stats');
  });

  it('sends the old Stats and Settings screens to their Home sections, but keeps a single test’s stats', () => {
    expect(legacyHomeHash('#/stats')).toBe('#/?tab=stats');
    expect(legacyHomeHash('#/settings')).toBe('#/?tab=settings');
    expect(legacyHomeHash('#/stats/test/deck-1')).toBeNull();
    expect(legacyHomeHash('#/')).toBeNull();
    expect(legacyHomeHash('#/?tab=stats')).toBeNull();
    expect(legacyHomeHash('#/deck/abc')).toBeNull();
  });

  it('does not preselect Study when home is the first screen', () => {
    expect(
      resolveHomeTab({ current: null, requested: null, arriving: false, from: { name: 'home' } }),
    ).toBeNull();
  });

  it('opens the tab named in a deep link', () => {
    expect(
      resolveHomeTab({ current: null, requested: 'library', arriving: false, from: { name: 'home' } }),
    ).toBe('library');
    expect(
      resolveHomeTab({ current: 'study', requested: 'stats', arriving: false, from: { name: 'home' } }),
    ).toBe('stats');
  });

  it('returns from a lesson card, a finished sitting, or a test’s stats to that screen’s tab', () => {
    expect(tabForRoute(deck)).toBe('library');
    expect(tabForRoute(review)).toBe('library');
    expect(tabForRoute(session)).toBe('study');
    expect(tabForRoute(results)).toBe('study');
    expect(tabForRoute({ name: 'stats', deckId: 'deck-1' })).toBe('stats');
    expect(resolveHomeTab({ current: null, requested: null, arriving: true, from: deck })).toBe('library');
    expect(resolveHomeTab({ current: null, requested: null, arriving: true, from: results })).toBe('study');
    expect(resolveHomeTab({ current: null, requested: null, arriving: true, from: session })).toBe('study');
    expect(
      resolveHomeTab({ current: null, requested: null, arriving: true, from: { name: 'stats', deckId: 'deck-1' } }),
    ).toBe('stats');
  });

  it('keeps a tab already picked when coming back home', () => {
    expect(resolveHomeTab({ current: 'settings', requested: null, arriving: true, from: deck })).toBe('settings');
    expect(resolveHomeTab({ current: 'stats', requested: null, arriving: false, from: { name: 'home' } })).toBe('stats');
  });

  it('opens Study when coming back from a sitting or its results, even with another tab picked', () => {
    expect(resolveHomeTab({ current: 'library', requested: null, arriving: true, from: session })).toBe('study');
    expect(resolveHomeTab({ current: 'stats', requested: null, arriving: true, from: results })).toBe('study');
    expect(resolveHomeTab({ current: 'library', requested: 'library', arriving: true, from: session })).toBe('library');
  });

  it('collapses the open tab and shows only the tab that was tapped', () => {
    expect(nextHomeTab(null, 'study')).toBe('study');
    expect(nextHomeTab('study', 'study')).toBeNull();
    expect(nextHomeTab('library', 'library')).toBeNull();
    expect(nextHomeTab('stats', 'stats')).toBeNull();
    expect(nextHomeTab('settings', 'settings')).toBeNull();
    expect(nextHomeTab('study', 'library')).toBe('library');
    expect(nextHomeTab('library', 'stats')).toBe('stats');
    expect(nextHomeTab('settings', 'study')).toBe('study');
  });

  it('lets a home deep link replace the tab already picked', () => {
    expect(resolveHomeTab({ current: 'library', requested: 'study', arriving: true, from: deck })).toBe('study');
  });
});

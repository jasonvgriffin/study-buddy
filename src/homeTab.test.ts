import { describe, expect, it } from 'vitest';
import { nextHomeTab, parseHomeTab, resolveHomeTab, tabForRoute } from './homeTab';
import type { Route } from './nav';

const deck: Route = { name: 'deck', deckId: 'deck-1', cardId: 'card-1' };
const review: Route = { name: 'review', draftId: 'draft-1' };
const session: Route = { name: 'session', sessionId: 'session-1' };
const results: Route = { name: 'results', sessionId: 'session-1' };

describe('home tab', () => {
  it('reads a tab deep link and ignores a bare home URL', () => {
    expect(parseHomeTab('#/?tab=study')).toBe('study');
    expect(parseHomeTab('#/?tab=library')).toBe('library');
    expect(parseHomeTab('#/?tab=progress')).toBe('progress');
    expect(parseHomeTab('#/?tab=settings')).toBe('settings');
    expect(parseHomeTab('#/')).toBeNull();
    expect(parseHomeTab('')).toBeNull();
    expect(parseHomeTab('#')).toBeNull();
    expect(parseHomeTab('#/?tab=stats')).toBeNull();
    expect(parseHomeTab('#/deck/abc?tab=library')).toBe('library');
  });

  it('does not preselect Study when home is the first screen', () => {
    expect(
      resolveHomeTab({ current: null, requested: null, arriving: false, from: { name: 'home' } }),
    ).toBeNull();
  });

  it('opens the tab named in a deep link', () => {
    expect(
      resolveHomeTab({ current: null, requested: 'progress', arriving: false, from: { name: 'home' } }),
    ).toBe('progress');
  });

  it('returns from a lesson card or a finished sitting to that screen’s tab', () => {
    expect(tabForRoute(deck)).toBe('library');
    expect(tabForRoute(review)).toBe('library');
    expect(tabForRoute(session)).toBe('study');
    expect(tabForRoute(results)).toBe('study');
    expect(
      resolveHomeTab({ current: null, requested: null, arriving: true, from: deck }),
    ).toBe('library');
    expect(
      resolveHomeTab({ current: null, requested: null, arriving: true, from: results }),
    ).toBe('study');
    expect(
      resolveHomeTab({ current: null, requested: null, arriving: true, from: session }),
    ).toBe('study');
  });

  it('keeps a tab already picked when coming back home', () => {
    expect(
      resolveHomeTab({ current: 'progress', requested: null, arriving: true, from: deck }),
    ).toBe('progress');
  });

  it('collapses the open tab and shows only the tab that was tapped', () => {
    expect(nextHomeTab(null, 'study')).toBe('study');
    expect(nextHomeTab('study', 'study')).toBeNull();
    expect(nextHomeTab('library', 'library')).toBeNull();
    expect(nextHomeTab('progress', 'progress')).toBeNull();
    expect(nextHomeTab('settings', 'settings')).toBeNull();
    expect(nextHomeTab('study', 'library')).toBe('library');
    expect(nextHomeTab('library', 'progress')).toBe('progress');
    expect(nextHomeTab('settings', 'study')).toBe('study');
  });

  it('lets a home deep link replace the tab already picked', () => {
    expect(
      resolveHomeTab({ current: 'library', requested: 'study', arriving: true, from: deck }),
    ).toBe('study');
  });
});

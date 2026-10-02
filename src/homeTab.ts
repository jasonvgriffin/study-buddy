import { parseRoute, type Route } from './nav';

/** Home sections. Each one renders in the top spot of Home, above the four tab buttons. */
export type HomeTab = 'study' | 'library' | 'stats' | 'settings';

/** `?tab=` on a home hash. The old `progress` tab is Stats. Anything else, including a bare `#/`, selects nothing. */
export function parseHomeTab(hash: string): HomeTab | null {
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const value = new URLSearchParams(query).get('tab');
  if (value === 'progress' || value === 'stats') return 'stats';
  if (value === 'study' || value === 'library' || value === 'settings') return value;
  return null;
}

/**
 * Stats and Settings used to be their own screens. Their old links (`#/stats`, `#/settings`) now open
 * Home with that section showing. A single test's stats (`#/stats/test/<id>`) is still its own screen.
 */
export function legacyHomeHash(hash: string): string | null {
  const route = parseRoute(hash);
  if (route.name === 'stats' && !route.deckId) return '#/?tab=stats';
  if (route.name === 'settings') return '#/?tab=settings';
  return null;
}

/**
 * Where Home should open when nothing has been picked yet.
 * Deck and review are the library (tests and lesson links). A sitting and its
 * results are Study. A single test's stats goes back to Stats.
 */
export function tabForRoute(route: Route): HomeTab | null {
  switch (route.name) {
    case 'deck':
    case 'review':
      return 'library';
    case 'stats':
      return 'stats';
    case 'settings':
      return 'settings';
    case 'session':
    case 'results':
    case 'home':
      return 'study';
  }
}

/** Tapping the open tab collapses it. Tapping another tab shows only that one. */
export function nextHomeTab(current: HomeTab | null, tapped: HomeTab): HomeTab | null {
  return current === tapped ? null : tapped;
}

/**
 * Fresh home (`#/` with no tab) stays blank. A `?tab=` deep link wins.
 * Coming back from a sitting or its results opens Study. Coming back from another screen keeps a tab already picked this session,
 * and otherwise opens the tab that matches that screen.
 */
export function resolveHomeTab(input: {
  current: HomeTab | null;
  requested: HomeTab | null;
  arriving: boolean;
  from: Route;
}): HomeTab | null {
  if (input.requested) return input.requested;
  if (!input.arriving) return input.current;
  // Leaving a sitting or its results lands on Study so the Resume card (or the next Start) is on top.
  if (input.from.name === 'session' || input.from.name === 'results') return 'study';
  if (input.current) return input.current;
  return tabForRoute(input.from);
}

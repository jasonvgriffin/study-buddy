import type { Route } from './nav';

export type HomeTab = 'study' | 'library' | 'progress' | 'settings';

function isHomeTab(value: string | null): value is HomeTab {
  return value === 'study' || value === 'library' || value === 'progress' || value === 'settings';
}

/** `?tab=` on a home hash. Anything else, including a bare `#/`, selects nothing. */
export function parseHomeTab(hash: string): HomeTab | null {
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const value = new URLSearchParams(query).get('tab');
  return isHomeTab(value) ? value : null;
}

/**
 * Where Home should open when nothing has been picked yet.
 * Deck and review are the library (tests and lesson links). A sitting and its
 * results are Study. Stats and Settings match the home tab that leads there.
 */
export function tabForRoute(route: Route): HomeTab {
  switch (route.name) {
    case 'deck':
    case 'review':
      return 'library';
    case 'stats':
      return 'progress';
    case 'settings':
      return 'settings';
    case 'session':
    case 'results':
    case 'home':
      return 'study';
  }
}

/**
 * Fresh home (`#/` with no tab) stays blank. A `?tab=` deep link wins.
 * Coming back from another screen keeps a tab already picked this session,
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
  if (input.current) return input.current;
  return tabForRoute(input.from);
}

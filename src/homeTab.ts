import { parseRoute, type Route } from './nav';

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
 * results are Study. Settings matches the home tab that leads there.
 * Stats is its own screen, so coming back does not open a home tab.
 */
export function tabForRoute(route: Route): HomeTab | null {
  switch (route.name) {
    case 'deck':
    case 'review':
      return 'library';
    case 'stats':
      return null;
    case 'settings':
      return 'settings';
    case 'session':
    case 'results':
    case 'home':
      return 'study';
  }
}

/** The old progress tab (`#/?tab=progress`) opens the Stats screen. */
export function hashOpensStats(hash: string): boolean {
  return parseRoute(hash).name === 'home' && parseHomeTab(hash) === 'progress';
}

/** Progress is no longer a home panel. */
function panelTab(tab: HomeTab | null): HomeTab | null {
  return tab === 'progress' ? null : tab;
}

/**
 * Fresh home (`#/` with no tab) stays blank. A `?tab=` deep link wins.
 * Coming back from another screen keeps a tab already picked this session,
 * and otherwise opens the tab that matches that screen.
 */
/** Tapping the open tab collapses it. Tapping another tab shows only that one. */
export function nextHomeTab(current: HomeTab | null, tapped: HomeTab): HomeTab | null {
  return current === tapped ? null : tapped;
}

export function resolveHomeTab(input: {
  current: HomeTab | null;
  requested: HomeTab | null;
  arriving: boolean;
  from: Route;
}): HomeTab | null {
  if (input.requested) return panelTab(input.requested);
  if (!input.arriving) return panelTab(input.current);
  if (input.current && input.current !== 'progress') return input.current;
  return tabForRoute(input.from);
}

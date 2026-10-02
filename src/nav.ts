export type Route =
  | { name: 'home' }
  | { name: 'stats'; deckId?: string }
  | { name: 'settings' }
  | { name: 'review'; draftId: string }
  | { name: 'deck'; deckId: string; cardId: string | null }
  | { name: 'session'; sessionId: string }
  | { name: 'results'; sessionId: string };

export function parseRoute(hash: string): Route {
  const path = (hash.replace(/^#/, '') || '/').split('?')[0] ?? '/';
  const parts = path.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  if (parts[0] === 'stats') {
    if (parts[1] === 'test' && parts[2]) return { name: 'stats', deckId: parts[2] };
    return { name: 'stats' };
  }
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'review' && parts[1]) return { name: 'review', draftId: parts[1] };
  if (parts[0] === 'deck' && parts[1]) {
    const cardId = parts[2] === 'card' && parts[3] ? parts[3] : null;
    return { name: 'deck', deckId: parts[1], cardId };
  }
  if (parts[0] === 'session' && parts[1]) return { name: 'session', sessionId: parts[1] };
  if (parts[0] === 'results' && parts[1]) return { name: 'results', sessionId: parts[1] };
  return { name: 'home' };
}

export function navigate(path: string): void {
  const next = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : `/${path}`}`;
  if (location.hash === next) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  location.hash = next;
}

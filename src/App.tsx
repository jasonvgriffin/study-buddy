import { useEffect, useRef } from 'react';
import { BackupReminder } from './BackupReminder';
import { PressFeedback } from './PressFeedback';
import { DeckScreen } from './Deck';
import { Home } from './Home';
import { ResultsScreen } from './Results';
import { ReviewScreen } from './Review';
import { SessionScreen } from './Session';
import { Settings } from './Settings';
import { Stats } from './Stats';
import { Spinner } from './bits';
import { navigate } from './nav';
import { StudyProvider, useStudy } from './store';

export default function App() {
  return (
    <StudyProvider>
      <Shell />
    </StudyProvider>
  );
}

function StatusNotice() {
  const study = useStudy();
  const ref = useRef<HTMLParagraphElement>(null);
  const text = study.busy ?? study.message;
  const mirrored =
    study.route.name === 'home' && study.homeTab === 'library' && study.focus !== 'all' && Boolean(text);
  useEffect(() => {
    if (!text) return;
    const local = document.querySelector('[data-testid="import-status"]');
    if (local instanceof HTMLElement) {
      local.scrollIntoView({ block: 'center' });
      return;
    }
    ref.current?.scrollIntoView({ block: 'start' });
  }, [text]);
  const tone = study.busy ? 'progress' : study.messageTone;
  const className = [
    text && !mirrored ? 'banner' : 'sr-only',
    !mirrored && tone === 'progress' ? 'upload-status' : '',
    !mirrored && tone === 'error' ? 'banner-error' : '',
    !mirrored && tone === 'success' ? 'banner-success' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <p
      ref={ref}
      className={className}
      role={tone === 'error' && !study.busy ? 'alert' : 'status'}
      aria-live={tone === 'error' && !study.busy ? 'assertive' : 'polite'}
      aria-atomic="true"
      data-testid="app-status"
    >
      {study.busy ? (
        <>
          <Spinner />
          {study.busy}
        </>
      ) : (
        study.message
      )}
    </p>
  );
}

function Shell() {
  const study = useStudy();
  const route = study.route;
  const showNav = route.name === 'home' || route.name === 'stats' || route.name === 'settings';

  return (
    <div className="app-shell">
      <PressFeedback />
      <main className="frame">
        {!study.ready && !study.bootError ? <p>Opening saved decks…</p> : null}
        {study.bootError ? <p role="alert">{study.bootError}</p> : null}
        <StatusNotice />
        {study.ready && route.name !== 'session' && route.name !== 'review' ? <BackupReminder /> : null}
        {study.ready && route.name === 'home' ? <Home key={study.dataEpoch} /> : null}
        {study.ready && route.name === 'stats' ? <Stats /> : null}
        {study.ready && route.name === 'settings' ? <Settings /> : null}
        {study.ready && route.name === 'review' ? <ReviewScreen draftId={route.draftId} /> : null}
        {study.ready && route.name === 'deck' ? <DeckScreen deckId={route.deckId} cardId={route.cardId} /> : null}
        {study.ready && route.name === 'session' ? <SessionScreen sessionId={route.sessionId} /> : null}
        {study.ready && route.name === 'results' ? <ResultsScreen sessionId={route.sessionId} /> : null}
        <p className="muted" data-testid="build-version" style={{ fontSize: '0.75rem', textAlign: 'center', margin: '1.5rem 0 0' }}>
          Study Buddy build {__APP_VERSION__} · {__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC
        </p>
        <footer className="app-footer" data-testid="app-footer">
          Built by Jason Griffin with GrokBot/cursor
        </footer>
      </main>
      {showNav ? (
        <nav className="nav">
          <button className={route.name === 'home' ? 'on' : ''} type="button" onClick={() => navigate('/')}>
            Home
          </button>
          <button className={route.name === 'stats' ? 'on' : ''} type="button" onClick={() => navigate('/stats')}>
            Stats
          </button>
          <button className={route.name === 'settings' ? 'on' : ''} type="button" onClick={() => navigate('/settings')}>
            Settings
          </button>
        </nav>
      ) : null}
    </div>
  );
}

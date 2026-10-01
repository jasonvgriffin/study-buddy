import { BackupReminder } from './BackupReminder';
import { PressFeedback } from './PressFeedback';
import { DeckScreen } from './Deck';
import { Home } from './Home';
import { ResultsScreen } from './Results';
import { ReviewScreen } from './Review';
import { SessionScreen } from './Session';
import { Settings } from './Settings';
import { Stats } from './Stats';
import { navigate } from './nav';
import { StudyProvider, useStudy } from './store';

export default function App() {
  return (
    <StudyProvider>
      <Shell />
    </StudyProvider>
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
        {study.busy ? (
          <p className="banner" role="status">
            {study.busy}
          </p>
        ) : null}
        {study.message ? (
          <p className="banner" role="status">
            {study.message}
          </p>
        ) : null}
        {study.ready && route.name !== 'session' && route.name !== 'review' ? <BackupReminder /> : null}
        {study.ready && route.name === 'home' ? <Home /> : null}
        {study.ready && route.name === 'stats' ? <Stats /> : null}
        {study.ready && route.name === 'settings' ? <Settings /> : null}
        {study.ready && route.name === 'review' ? <ReviewScreen draftId={route.draftId} /> : null}
        {study.ready && route.name === 'deck' ? <DeckScreen deckId={route.deckId} cardId={route.cardId} /> : null}
        {study.ready && route.name === 'session' ? <SessionScreen sessionId={route.sessionId} /> : null}
        {study.ready && route.name === 'results' ? <ResultsScreen sessionId={route.sessionId} /> : null}
        <p className="muted" data-testid="build-version" style={{ fontSize: '0.75rem', textAlign: 'center', margin: '1.5rem 0 0' }}>
          Study Buddy build {__APP_VERSION__} · {__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC
        </p>
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

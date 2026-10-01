import { attemptComparison, formatPercentSafe } from './resultsMath';
import { formatDuration, formatPercent } from './lib/format';
import { elapsedMs, liveScore, sessionMissedCardIds } from './lib/session';
import { navigate } from './nav';
import { Screen } from './bits';
import { useStudy } from './store';

export function ResultsScreen({ sessionId }: { sessionId: string }) {
  const study = useStudy();
  const session = study.snap?.sessions.find((item) => item.id === sessionId) ?? null;
  if (!session) {
    return (
      <Screen title="Results" onBack={() => navigate('/')}>
        <p>Those results are not on this device.</p>
      </Screen>
    );
  }
  const score = liveScore(session);
  const missed = sessionMissedCardIds(session);
  const previous = (study.snap?.sessions ?? [])
    .filter(
      (item) =>
        item.id !== session.id &&
        item.deckId === session.deckId &&
        item.kind === session.kind &&
        item.status === 'finished',
    )
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .map((item) => liveScore(item).percent)
    .filter((value): value is number => value != null);
  const comparison = attemptComparison(score.percent ?? 0, previous);
  const deck = study.snap?.decks.find((item) => item.id === session.deckId) ?? null;

  return (
    <Screen title={session.deckName} lede="Results for this sitting" onBack={() => navigate('/')}>
      <article className="card stack" style={{ padding: '1rem' }}>
        <h2>{formatPercent(score.percent)}</h2>
        <p data-testid="score-counts" style={{ margin: 0 }}>
          {score.correct} right, {score.incorrect} wrong, {score.unanswered} unanswered.{' '}
          {formatDuration(elapsedMs(session, session.updatedAt))} of active time.
        </p>
        {session.finishedReason === 'time' ? <p style={{ margin: 0 }}>The 90 minutes ran out.</p> : null}
        <p style={{ margin: 0 }}>
          {comparison.last == null
            ? 'No earlier finished attempt of this kind on this test.'
            : `Previous attempt ${formatPercent(comparison.last)}. This one is ${formatPercentSafe(comparison.deltaFromLast)} compared with that.`}
        </p>
        {comparison.best != null ? <p style={{ margin: 0 }}>Best so far: {formatPercent(comparison.best)}.</p> : null}
      </article>
      {deck && missed.length ? (
        <button
          className="btn btn-primary btn-block"
          type="button"
          onClick={() => void study.startMissedDrill(deck, session.section)}
        >
          Drill {missed.length} missed card{missed.length === 1 ? '' : 's'}
        </button>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Nothing missed in this sitting.
        </p>
      )}
      <button className="btn btn-ghost btn-block" type="button" onClick={() => navigate('/')}>
        Home
      </button>
    </Screen>
  );
}

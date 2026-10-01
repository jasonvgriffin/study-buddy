import { domainBreakdown } from './lib/domains';
import { accuracyByDay, rollup, studyStreak, weakestMemories } from './lib/scoring';
import { elapsedMs } from './lib/session';
import { formatDuration, formatPercent } from './lib/format';
import { Screen } from './bits';
import { useStudy } from './store';

export function Stats() {
  const study = useStudy();
  const snap = study.snap;
  if (!snap) return null;
  const inFocus = (subjectId: string) => study.focus === 'all' || study.focus === subjectId;
  const reviews = snap.reviews.filter((review) => inFocus(review.subjectId));
  const memories = snap.memories.filter((memory) => inFocus(memory.subjectId));
  const decks = snap.decks.filter((deck) => inFocus(deck.subjectId));
  const sessions = snap.sessions.filter((session) => inFocus(session.subjectId));
  const totals = rollup(memories);
  const offset = new Date().getTimezoneOffset();
  const days = accuracyByDay(reviews, offset).slice(-14);
  const streak = studyStreak(
    reviews.map((review) => review.at),
    Date.now(),
    offset,
  );
  const weakest = weakestMemories(memories, 5);
  const activeMs = sessions.reduce((sum, session) => sum + elapsedMs(session, Date.now()), 0);
  const cardById = new Map(snap.cards.map((card) => [card.id, card]));
  const domains = domainBreakdown(
    snap.cards.filter((card) => inFocus(card.subjectId)),
    reviews.map((review) => ({ cardId: review.cardId, correct: review.correct })),
  );

  return (
    <Screen
      title="Stats"
      lede={study.focus === 'all' ? 'Every subject on this device.' : 'This subject only. Time counts while a session is open, not while the screen is hidden.'}
    >
      <article className="card stack" style={{ padding: '1rem' }}>
        <h2>{formatPercent(totals.accuracy)}</h2>
        <p style={{ margin: 0 }}>
          {totals.correct} right, {totals.incorrect} wrong, {totals.attempts} answers.
        </p>
        <p style={{ margin: 0 }}>Active study time {formatDuration(activeMs)}.</p>
        <p style={{ margin: 0 }}>
          {streak.current ? `${streak.current} day streak.` : 'No streak yet.'} Best {streak.best}.
        </p>
      </article>
      <section className="stack">
        <h2>Accuracy by day</h2>
        {!days.length ? <p className="muted">Answer a few cards and the days show up here.</p> : null}
        {days.map((day) => (
          <div key={day.day}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span>{day.day}</span>
              <span>
                {formatPercent(day.accuracy)} · {day.correct}/{day.correct + day.incorrect}
              </span>
            </div>
            <div className="bar">
              <span style={{ width: `${Math.round((day.accuracy ?? 0) * 100)}%` }} />
            </div>
          </div>
        ))}
      </section>
      <section className="stack" data-testid="domain-stats">
        <h2>By domain</h2>
        {!domains.length ? <p className="muted">Answer a few cards and the domains from your PDF show up here.</p> : null}
        {domains.map((domain) => (
          <article key={domain.key} className="card stack" data-testid="domain-score" style={{ padding: '0.85rem' }}>
            <strong>{domain.name}</strong>
            <p style={{ margin: '0.25rem 0 0' }}>
              {formatPercent(domain.correct + domain.incorrect ? domain.correct / (domain.correct + domain.incorrect) : null)} · {domain.correct} right, {domain.incorrect} wrong
            </p>
            {domain.objectives.map((objective) => (
              <p key={objective.key} className="muted" data-testid="objective-score" style={{ margin: '0.25rem 0 0' }}>
                {objective.label}: {objective.correct} right, {objective.incorrect} wrong
              </p>
            ))}
          </article>
        ))}
      </section>
      <section className="stack">
        <h2>By test</h2>
        {!decks.length ? <p className="muted">No tests in this view.</p> : null}
        {decks.map((deck) => {
          const stats = rollup(memories.filter((memory) => memory.deckId === deck.id));
          return (
            <article key={deck.id} className="card" style={{ padding: '0.85rem' }}>
              <strong>{deck.name}</strong>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                {stats.attempts
                  ? `${formatPercent(stats.accuracy)} over ${stats.attempts} answers`
                  : 'No answers yet'}
              </p>
            </article>
          );
        })}
      </section>
      <section className="stack">
        <h2>Weakest cards</h2>
        {!weakest.length ? <p className="muted">Not enough answers to rank cards yet.</p> : null}
        {weakest.map((memory) => {
          const card = cardById.get(memory.cardId);
          return (
            <article key={memory.cardId} className="card" style={{ padding: '0.85rem' }}>
              <p style={{ margin: 0 }}>{card?.question ?? 'Card'}</p>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                {memory.correct} of {memory.attempts} correct
              </p>
            </article>
          );
        })}
      </section>
    </Screen>
  );
}

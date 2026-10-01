import { attemptComparison, formatPercentSafe } from './resultsMath';
import { answerText, correctAnswerText, domainBreakdown } from './lib/domains';
import { MISSING_EXPLANATION, formatDuration, formatPercent } from './lib/format';
import { elapsedMs, liveScore, sessionMissedCardIds } from './lib/session';
import { navigate } from './nav';
import { Screen, WatchLesson } from './bits';
import { lessonHref, lessonLabel, useStudy } from './store';

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
  const cards = study.snap?.cards ?? [];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const latest = new Map<string, (typeof session.answers)[number]>();
  for (const answer of session.answers) latest.set(answer.cardId, answer);
  const seen = new Set<string>();
  const sitting = session.cardIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const domains = domainBreakdown(
    sitting.map((id) => cardById.get(id)).filter((card) => !!card),
    sitting.map((id) => ({ cardId: id, correct: latest.get(id)?.correct ?? null })),
  );

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
      {domains.length ? (
        <section className="stack" data-testid="domain-scores">
          <h2>By domain</h2>
          {domains.map((domain) => (
            <article key={domain.key} className="card stack" data-testid="domain-score" style={{ padding: '0.9rem' }}>
              <strong>{domain.name}</strong>
              <p style={{ margin: 0 }}>
                {domain.correct} right, {domain.incorrect} wrong
                {domain.unanswered ? `, ${domain.unanswered} unanswered` : ''}.
              </p>
              {domain.objectives.map((objective) => (
                <p key={objective.key} className="muted" data-testid="objective-score" style={{ margin: 0 }}>
                  {objective.label}: {objective.correct} right, {objective.incorrect} wrong
                  {objective.unanswered ? `, ${objective.unanswered} unanswered` : ''}.
                </p>
              ))}
            </article>
          ))}
        </section>
      ) : null}
      {missed.length ? (
        <section className="stack" data-testid="missed-review">
          <h2>Missed questions</h2>
          {missed.map((id) => {
            const card = cardById.get(id);
            const answer = latest.get(id);
            if (!card || !answer) return null;
            const yours = answerText(card, answer.chosenLabels);
            const right = correctAnswerText(card);
            const explanation = card.explanation?.trim() ? card.explanation : MISSING_EXPLANATION;
            const href = lessonHref(card);
            return (
              <article key={id} className="card stack" data-testid="missed-card" style={{ padding: '0.9rem' }}>
                <h3 className="question" style={{ fontSize: '1.2rem' }}>
                  {card.question}
                </h3>
                <p data-testid="your-answer" style={{ margin: 0 }}>
                  Your answer: {yours || "You chose I don't know"}
                </p>
                <p data-testid="right-answer" style={{ margin: 0 }}>
                  Right answer: {right}
                </p>
                <p data-testid="missed-explanation" style={{ margin: 0 }}>
                  {explanation}
                </p>
                {href ? (
                  <WatchLesson href={href} title={lessonLabel(card)} onPersist={() => study.persistSession(session.id)} />
                ) : null}
                {deck ? (
                  <button
                    className="btn btn-ghost btn-block"
                    data-testid="open-card"
                    type="button"
                    onClick={() => navigate(`/deck/${deck.id}/card/${card.id}`)}
                  >
                    Open card
                  </button>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
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

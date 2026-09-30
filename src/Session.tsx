import { useEffect, useState } from 'react';
import { formatDuration, formatPercent } from './lib/format';
import { choiceGraded } from './lib/parser';
import { elapsedMs, liveScore } from './lib/session';
import { navigate } from './nav';
import { WatchLesson } from './bits';
import { lessonHref, lessonLabel, useStudy } from './store';

export function SessionScreen({ sessionId }: { sessionId: string }) {
  const study = useStudy();
  const session = study.snap?.sessions.find((item) => item.id === sessionId) ?? null;
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState<string[]>([]);
  const [reveal, setReveal] = useState<{
    cardId: string;
    correct: boolean;
    chosen: string[];
    finished: boolean;
  } | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);

  useEffect(() => {
    if (!session || session.status !== 'active') return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void study.syncTimer(sessionId);
    }, 500);
    return () => window.clearInterval(timer);
  }, [session?.status, sessionId, study]);

  if (!session) {
    return (
      <div className="stack">
        <button className="btn btn-ghost" type="button" onClick={() => navigate('/')}>
          Back
        </button>
        <p>That session is not on this device.</p>
      </div>
    );
  }

  const revealedCard = reveal
    ? study.snap?.cards.find((card) => card.id === reveal.cardId) ?? null
    : null;
  const currentId = session.cardIds[Math.min(session.index, Math.max(session.cardIds.length - 1, 0))];
  const card = revealedCard ?? study.snap?.cards.find((item) => item.id === currentId) ?? null;
  const total = session.kind === 'exam' ? session.originalCount : session.cardIds.length;
  const positionIndex = card ? session.cardIds.indexOf(card.id) : session.index;
  const score = liveScore(session);
  const elapsed = elapsedMs(session, session.status === 'active' ? now : session.updatedAt);
  const remaining = session.timeLimitMs != null ? Math.max(0, session.timeLimitMs - elapsed) : null;
  const paused = session.status !== 'active';

  const submit = (chosen: string[], correct: boolean) => {
    if (!card || reveal || paused) return;
    void study.answer(session.id, card, chosen, correct).then((result) => {
      setReveal({ cardId: card.id, correct, chosen, finished: result.finished });
      setPicked([]);
    });
  };

  const href = card ? lessonHref(card) : null;

  return (
    <div className="stack">
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => {
          void study.pause(session.id).then(() => navigate('/'));
        }}
      >
        Back
      </button>
      <div className="card stack" style={{ padding: '0.9rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
          <strong data-testid="position">
            question {Math.min(positionIndex + 1, Math.max(total, 1))} of {total}
          </strong>
          <span data-testid="elapsed">{formatDuration(elapsed)}</span>
        </div>
        <p data-testid="live-score" style={{ margin: 0 }}>
          {score.percent == null
            ? 'No answers yet'
            : `${formatPercent(score.percent)} · ${score.correct} of ${score.answered} correct`}
        </p>
        <div className="bar" aria-hidden="true">
          <span style={{ width: `${total ? Math.min(100, (score.answered / total) * 100) : 0}%` }} />
        </div>
        {remaining != null ? <p style={{ margin: 0 }}>Time left {formatDuration(remaining)}</p> : null}
        {session.status === 'finished' && session.finishedReason === 'time' ? <p style={{ margin: 0 }}>Time is up.</p> : null}
      </div>
      {paused && session.status !== 'finished' ? (
        <button className="btn btn-primary btn-block" data-testid="resume" type="button" onClick={() => void study.resume(session.id)}>
          Resume
        </button>
      ) : (
        <button className="btn btn-ghost btn-block" data-testid="pause" type="button" onClick={() => void study.pause(session.id)}>
          Pause
        </button>
      )}
      {card ? (
        <article
          className="card stack"
          style={{ padding: '1rem' }}
          onTouchStart={(event) => setTouchX(event.changedTouches[0]?.clientX ?? null)}
          onTouchEnd={(event) => {
            if (touchX == null || choiceGraded(card) || reveal || paused) return;
            const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
            if (dx > 70) submit([], true);
            if (dx < -70) submit([], false);
            setTouchX(null);
          }}
        >
          <p className="muted" style={{ margin: 0 }}>
            {card.sourceLabel}
            {card.domainName ? ` · ${card.domainName}` : ''}
            {card.objective ? ` · ${card.objective}` : ''}
          </p>
          <h2 className="question">{card.question}</h2>
          {card.choices.length ? (
            <div className="stack">
              {card.choices.map((choice) => {
                const on = (reveal ? reveal.chosen : picked).includes(choice.label);
                const show = !!reveal;
                const isCorrect = card.correctLabels.includes(choice.label);
                const className = [
                  'choice',
                  on ? 'picked' : '',
                  show && isCorrect ? 'correct' : '',
                  show && on && !isCorrect ? 'wrong' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={choice.label}
                    className={className}
                    data-testid="choice"
                    type="button"
                    disabled={!!reveal || paused}
                    onClick={() =>
                      setPicked((current) =>
                        current.includes(choice.label)
                          ? current.filter((label) => label !== choice.label)
                          : [...current, choice.label],
                      )
                    }
                  >
                    <strong>{choice.label}.</strong> {choice.text}
                    {show && choice.explanation ? (
                      <span className="muted" style={{ display: 'block', marginTop: '0.35rem' }}>
                        {choice.explanation}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {!reveal && choiceGraded(card) ? (
            <button
              className="btn btn-primary btn-block"
              data-testid="check"
              type="button"
              disabled={paused || picked.length === 0}
              onClick={() => {
                const correct =
                  [...picked].map((label) => label.toUpperCase()).sort().join(',') ===
                  [...card.correctLabels].map((label) => label.toUpperCase()).sort().join(',');
                submit(picked, correct);
              }}
            >
              Check answer
            </button>
          ) : null}
          {!reveal && !choiceGraded(card) ? (
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>
                This item has no lettered key. Grade it yourself, or swipe right for correct and left for missed.
              </p>
              <button className="btn btn-primary btn-block" data-testid="got-it" type="button" disabled={paused} onClick={() => submit([], true)}>
                I got it
              </button>
              <button className="btn btn-clay btn-block" data-testid="missed" type="button" disabled={paused} onClick={() => submit([], false)}>
                I missed it
              </button>
            </div>
          ) : null}
          {reveal ? (
            <div className="stack">
              <p style={{ margin: 0 }}>
                <strong>{reveal.correct ? 'Correct' : 'Not quite'}.</strong>{' '}
                {card.answer || (card.correctLabels.length ? `Answer: ${card.correctLabels.join(', ')}` : '')}
              </p>
              <p style={{ margin: 0 }}>{card.explanation ?? 'No explanation provided in your PDF.'}</p>
              {href ? (
                <WatchLesson
                  href={href}
                  title={lessonLabel(card)}
                  onPersist={() => study.persistSession(session.id)}
                />
              ) : null}
              <button
                className="btn btn-primary btn-block"
                data-testid="next"
                type="button"
                onClick={() => {
                  const finished = reveal.finished || session.status === 'finished';
                  setReveal(null);
                  if (finished) navigate(`/results/${session.id}`);
                }}
              >
                {reveal.finished || session.status === 'finished' ? 'See results' : 'Next'}
              </button>
            </div>
          ) : null}
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => void study.flag(session.id, card.id)}
          >
            {session.flagged.includes(card.id) ? 'Flagged' : 'Flag'}
          </button>
        </article>
      ) : (
        <p>No card is left in this session.</p>
      )}
    </div>
  );
}

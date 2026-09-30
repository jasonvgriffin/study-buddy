import { useEffect, useRef, useState } from 'react';
import { figuresForCard } from './lib/db';
import { formatDuration, formatPercent } from './lib/format';
import { choiceGraded, gradeLabels } from './lib/parser';
import { PbqForm } from './PbqForm';
import { elapsedMs, liveScore } from './lib/session';
import { navigate } from './nav';
import { WatchLesson } from './bits';
import { lessonHref, lessonLabel, useStudy } from './store';

export function SessionScreen({ sessionId }: { sessionId: string }) {
  const study = useStudy();
  const session = study.snap?.sessions.find((item) => item.id === sessionId) ?? null;
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState<string[]>([]);
  const [why, setWhy] = useState(false);
  const [reveal, setReveal] = useState<{
    cardId: string;
    correct: boolean;
    chosen: string[];
    finished: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const [figures, setFigures] = useState<{ question: string[]; explanation: string[] }>({
    question: [],
    explanation: [],
  });
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    if (!session || session.status !== 'active') return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void study.syncTimer(sessionId);
    }, 500);
    return () => window.clearInterval(timer);
  }, [session?.status, sessionId, study]);

  const revealedCard = reveal
    ? study.snap?.cards.find((card) => card.id === reveal.cardId) ?? null
    : null;
  const currentId = session
    ? session.cardIds[Math.min(session.index, Math.max(session.cardIds.length - 1, 0))]
    : null;
  const card = revealedCard ?? study.snap?.cards.find((item) => item.id === currentId) ?? null;

  useEffect(() => {
    if (!card) return;
    let alive = true;
    const urls: string[] = [];
    void figuresForCard(card.id).then((rows) => {
      const question: string[] = [];
      const explanation: string[] = [];
      for (const row of rows) {
        const url = URL.createObjectURL(row.png);
        urls.push(url);
        if (row.role === 'explanation') explanation.push(url);
        else question.push(url);
      }
      if (!alive) {
        for (const url of urls) URL.revokeObjectURL(url);
        return;
      }
      setFigures({ question, explanation });
    });
    return () => {
      alive = false;
      for (const url of urls) URL.revokeObjectURL(url);
      setFigures({ question: [], explanation: [] });
    };
  }, [card?.id]);

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

  const total = session.kind === 'exam' ? session.originalCount : session.cardIds.length;
  const positionIndex = card ? session.cardIds.indexOf(card.id) : session.index;
  const score = liveScore(session);
  const elapsed = elapsedMs(session, session.status === 'active' ? now : session.updatedAt);
  const remaining = session.timeLimitMs != null ? Math.max(0, session.timeLimitMs - elapsed) : null;
  const paused = session.status !== 'active';
  const graded = card ? choiceGraded(card) : false;
  const multi = graded && !!card && card.correctLabels.length > 1;
  const pbq = card?.pbq ?? null;
  const showExplanation = !!reveal && !!card?.explanation && (!!pbq || !reveal.correct || why);
  const href = card ? lessonHref(card) : null;

  const submit = (chosen: string[], correct: boolean) => {
    if (!card || reveal || paused || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    void study.answer(session.id, card, chosen, correct)
      .then((result) => {
        setWhy(false);
        setReveal({ cardId: card.id, correct, chosen, finished: result.finished });
        setPicked([]);
      })
      .finally(() => {
        pendingRef.current = false;
        setPending(false);
      });
  };

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
            if (touchX == null || graded || pbq || reveal || paused || pending) return;
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
          {figures.question.length ? (
            <div className="stack">
              {figures.question.map((src) => (
                <button key={src} className="figure-button" type="button" data-testid="zoom-figure" onClick={() => setZoom(src)}>
                  <img className="figure-img" data-testid="question-figure" src={src} alt="Figure from your PDF" />
                </button>
              ))}
            </div>
          ) : null}
          {zoom ? (
            <button className="zoom-layer" type="button" data-testid="zoom-close" onClick={() => setZoom(null)}>
              <img src={zoom} alt="Enlarged figure from your PDF" />
            </button>
          ) : null}
          {card.choices.length ? (
            <div className="stack">
              {card.choices.map((choice) => {
                const on = (reveal ? reveal.chosen : picked).includes(choice.label);
                const isCorrect = card.correctLabels.includes(choice.label);
                const className = [
                  'choice',
                  !reveal && on ? 'picked' : '',
                  reveal && isCorrect ? 'correct' : '',
                  reveal && on && !isCorrect ? 'wrong' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={choice.label}
                    className={className}
                    data-testid="choice"
                    type="button"
                    disabled={!!reveal || paused || pending}
                    onClick={() => {
                      if (reveal || paused) return;
                      if (!multi && graded) {
                        submit([choice.label], gradeLabels(card.correctLabels, [choice.label]));
                        return;
                      }
                      setPicked((current) =>
                        current.includes(choice.label)
                          ? current.filter((label) => label !== choice.label)
                          : [...current, choice.label],
                      );
                    }}
                  >
                    <strong>{choice.label}.</strong> {choice.text}
                    {showExplanation && choice.explanation ? (
                      <span className="muted" style={{ display: 'block', marginTop: '0.35rem' }}>
                        {choice.explanation}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {pbq ? (
            <PbqForm
              key={card.id}
              task={pbq}
              paused={paused}
              pending={pending}
              revealed={!!reveal && reveal.cardId === card.id}
              onSubmit={(correct, chosen) => submit(chosen, correct)}
            />
          ) : null}
          {!reveal && multi ? (
            <button
              className="btn btn-primary btn-block"
              data-testid="submit"
              type="button"
              disabled={paused || pending || picked.length === 0}
              onClick={() => submit(picked, gradeLabels(card.correctLabels, picked))}
            >
              Submit
            </button>
          ) : null}
          {!reveal && !graded && !pbq ? (
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>
                This item has no lettered key. Grade it yourself, or swipe right for correct and left for missed.
              </p>
              <button className="btn btn-primary btn-block" data-testid="got-it" type="button" disabled={paused || pending} onClick={() => submit([], true)}>
                I got it
              </button>
              <button className="btn btn-clay btn-block" data-testid="missed" type="button" disabled={paused || pending} onClick={() => submit([], false)}>
                I missed it
              </button>
            </div>
          ) : null}
          {reveal ? (
            <div className="stack">
              <p data-testid="result" className={reveal.correct ? 'result-correct' : 'result-wrong'} style={{ margin: 0 }}>
                {reveal.correct ? 'Correct' : 'Incorrect'}
              </p>
              {!reveal.correct && !graded && !pbq && card.answer ? (
                <p data-testid="correct-answer" style={{ margin: 0 }}>
                  {card.answer}
                </p>
              ) : null}
              {reveal.correct && card.explanation ? (
                <button className="btn btn-ghost btn-block" data-testid="why" type="button" onClick={() => setWhy((open) => !open)}>
                  {why ? 'Hide explanation' : 'Why?'}
                </button>
              ) : null}
              {showExplanation ? (
                <div className="stack">
                  <p data-testid="explanation" style={{ margin: 0 }}>
                    {card.explanation}
                  </p>
                  {figures.explanation.map((src) => (
                    <img key={src} className="figure-img" data-testid="explanation-figure" src={src} alt="Figure from your PDF" />
                  ))}
                </div>
              ) : null}
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
                  setWhy(false);
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

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { figuresForCard } from './lib/db';
import { MISSING_EXPLANATION, formatDuration, formatPercent } from './lib/format';
import { gradeFeedback } from './lib/feedback';
import { choiceGraded, gradeLabels } from './lib/parser';
import { choiceForKey, presentChoices, readShuffle } from './lib/shuffle';
import { PbqForm } from './PbqForm';
import { itemExplanations } from './lib/pbq';
import { resumeButtonLabel, resumeTestName } from './lib/resumeButton';
import { elapsedMs, liveScore, skippedUnanswered } from './lib/session';
import { navigate } from './nav';
import { WatchLesson } from './bits';
import type { AnswerResult } from './lib/types';
import { lessonHref, lessonLabel, useStudy } from './store';

export function SessionScreen({ sessionId }: { sessionId: string }) {
  const study = useStudy();
  const session = study.snap?.sessions.find((item) => item.id === sessionId) ?? null;
  const [now, setNow] = useState(() => Date.now());
  const [picked, setPicked] = useState<string[]>([]);
  const [pickedFor, setPickedFor] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{
    cardId: string;
    correct: boolean;
    chosen: string[];
    finished: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const [figures, setFigures] = useState<{ question: string[]; explanation: string[]; items: Map<string, string> }>(
    () => ({ question: [], explanation: [], items: new Map() }),
  );
  const [zoom, setZoom] = useState<string | null>(null);
  const keyRef = useRef<((event: KeyboardEvent) => void) | null>(null);
  const presentation = useRef<{ id: string; seed: number }>({ id: '', seed: 1 });

  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => keyRef.current?.(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  if (card && presentation.current.id !== card.id) {
    presentation.current = { id: card.id, seed: Math.floor(Math.random() * 0x7fffffff) };
  }
  const shown = card ? presentChoices(card.choices, presentation.current.seed, readShuffle()) : [];
  if ((card?.id ?? null) !== pickedFor) {
    setPickedFor(card?.id ?? null);
    setPicked([]);
  }

  useEffect(() => {
    if (!card) return;
    document.getElementById('study-question')?.scrollIntoView({ block: 'start' });
  }, [card?.id]);

  useEffect(() => {
    if (!card) return;
    let alive = true;
    const urls: string[] = [];
    void figuresForCard(card.id).then((rows) => {
      const question: string[] = [];
      const explanation: string[] = [];
      const items = new Map<string, string>();
      for (const row of rows) {
        const url = URL.createObjectURL(row.png);
        urls.push(url);
        if (row.role === 'explanation') explanation.push(url);
        else if (row.itemId) items.set(row.itemId, url);
        else question.push(url);
      }
      if (!alive) {
        for (const url of urls) URL.revokeObjectURL(url);
        return;
      }
      setFigures({ question, explanation, items });
    });
    return () => {
      alive = false;
      for (const url of urls) URL.revokeObjectURL(url);
      setFigures({ question: [], explanation: [], items: new Map() });
    };
  }, [card?.id]);

  if (!session) {
    keyRef.current = null;
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
  const resumeSittingLabel = resumeButtonLabel(resumeTestName(study.snap?.decks ?? [], session.deckId));
  const graded = card ? choiceGraded(card) : false;
  const multi = graded && !!card && card.correctLabels.length > 1;
  const pbq = card?.pbq ?? null;
  const pbqNotes = pbq && card ? itemExplanations(pbq, card.explanation) : null;
  const href = card ? lessonHref(card) : null;
  const required = graded && card ? card.correctLabels.length : 0;
  const skippedIds = skippedUnanswered(session);
  const showSkipReview = session.skipReview && !reveal && session.status !== 'finished';
  const explanationText = card?.explanation?.trim() ? card.explanation : MISSING_EXPLANATION;

  const submit = (chosen: string[], correct: boolean, result?: AnswerResult) => {
    if (!card || reveal || paused || pendingRef.current) return;
    const resolved: AnswerResult = result ?? (correct ? 'correct' : 'incorrect');
    const gradedCorrect = resolved === 'correct';
    gradeFeedback(gradedCorrect);
    pendingRef.current = true;
    setPending(true);
    void study.answer(session.id, card, chosen, gradedCorrect, resolved)
      .then((result) => {
        setReveal({ cardId: card.id, correct: gradedCorrect, chosen, finished: result.finished });
        setPicked([]);
      })
      .finally(() => {
        pendingRef.current = false;
        setPending(false);
      });
  };

  keyRef.current = (event: KeyboardEvent) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
    }
    if (!card || showSkipReview || pendingRef.current) return;
    // A finished sitting is not "active", but Enter still has to leave the explanation.
    if (paused && !reveal) return;
    const key = event.key === ' ' ? ' ' : event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const pick = key === ' ' ? null : choiceForKey(shown, key);
    if (pick && !reveal && graded && !pbq) {
      event.preventDefault();
      if (multi) {
        setPicked((current) =>
          current.includes(pick.label) ? current.filter((label) => label !== pick.label) : [...current, pick.label],
        );
        return;
      }
      submit([pick.label], gradeLabels(card.correctLabels, [pick.label]));
      return;
    }
    if (key === 's' && !reveal) {
      event.preventDefault();
      pendingRef.current = true;
      setPending(true);
      void study.skip(session.id, card.id).finally(() => {
        pendingRef.current = false;
        setPending(false);
        setPicked([]);
      });
      return;
    }
    if (key === 'Enter' || key === ' ') {
      if (reveal) {
        event.preventDefault();
        const finished = reveal.finished || session.status === 'finished';
        setReveal(null);
        setPicked([]);
        if (finished) navigate(`/results/${session.id}`);
        return;
      }
      if (multi && !pbq && picked.length === required) {
        event.preventDefault();
        submit(picked, gradeLabels(card.correctLabels, picked));
      }
    }
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
            {showSkipReview
              ? 'Skipped questions'
              : `Question ${Math.min(positionIndex + 1, Math.max(total, 1))} of ${total}`}
          </strong>
          <span data-testid="elapsed">{formatDuration(elapsed)}</span>
        </div>
        <p data-testid="live-score" style={{ margin: 0 }}>
          {score.percent == null
            ? skippedIds.length
              ? `No answers yet · ${skippedIds.length} skipped`
              : 'No answers yet'
            : `${formatPercent(score.percent)} · ${score.correct} of ${score.answered} correct${
                skippedIds.length ? ` · ${skippedIds.length} skipped` : ''
              }`}
        </p>
        <div className="bar" data-testid="progress" aria-hidden="true">
          <span
            style={{
              width: `${
                total
                  ? Math.min(
                      100,
                      ((showSkipReview ? score.answered : Math.min(positionIndex + 1, total)) / total) * 100,
                    )
                  : 0
              }%`,
            }}
          />
        </div>
        {remaining != null ? <p style={{ margin: 0 }}>Time left {formatDuration(remaining)}</p> : null}
        {session.status === 'finished' && session.finishedReason === 'time' ? <p style={{ margin: 0 }}>Time is up.</p> : null}
        {session.status === 'finished' && !reveal ? (
          <button className="btn btn-primary btn-block" data-testid="see-results" type="button" onClick={() => navigate(`/results/${session.id}`)}>
            See results
          </button>
        ) : null}
      </div>
      {paused && session.status !== 'finished' ? (
        <button className="btn btn-primary btn-block home-continue" data-testid="resume" type="button" onClick={() => void study.resume(session.id)}>
          <span className="home-continue-label">{resumeSittingLabel}</span>
        </button>
      ) : (
        <button className="btn btn-ghost btn-block" data-testid="pause" type="button" onClick={() => void study.pause(session.id)}>
          Pause
        </button>
      )}
      {showSkipReview ? (
        <section className="card stack" data-testid="skip-review" style={{ padding: '1rem' }}>
          <h2>Skipped questions</h2>
          <p data-testid="unanswered-count" style={{ margin: 0 }}>
            {skippedIds.length === 1
              ? '1 unanswered question. Jump back to answer it, or end the session and leave it unanswered.'
              : `${skippedIds.length} unanswered questions. Jump back to answer one, or end the session and leave them unanswered.`}
          </p>
          {skippedIds.map((id) => {
            const item = study.snap?.cards.find((entry) => entry.id === id);
            const number = session.cardIds.indexOf(id) + 1;
            const flat = (item?.question ?? 'Question').replace(/\s+/g, ' ').trim();
            const short = flat.length > 160 ? `${flat.slice(0, 157)}…` : flat;
            return (
              <button
                key={id}
                className="choice"
                type="button"
                data-testid="jump-skipped"
                disabled={paused || pending}
                onClick={() => void study.jumpTo(session.id, id)}
              >
                <strong>Question {number}.</strong> {short}
              </button>
            );
          })}
          {session.bookmarkIndex != null ? (
            <button
              className="btn btn-primary btn-block"
              data-testid="continue-session"
              type="button"
              disabled={paused || pending}
              onClick={() => void study.continueSession(session.id)}
            >
              Continue where you left off
            </button>
          ) : null}
          <button
            className="btn btn-primary btn-block"
            data-testid="end-session"
            type="button"
            disabled={paused || pending}
            onClick={() => void study.endSession(session.id)}
          >
            End session
          </button>
        </section>
      ) : card ? (
        <article
          id="study-question"
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
          <p className="kbd-hint muted" data-testid="kbd-hint" style={{ margin: 0 }}>
              {shown.length
                ? multi
                  ? 'Keys: 1–9 or A–D toggle, Enter submits. S skips.'
                  : 'Keys: 1–9 or A–D answer, Enter next. S skips.'
                : 'Keys: S skips.'}
          </p>
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
          {shown.length ? (
            <div className="stack">
              {shown.map((choice) => {
                const on = (reveal ? reveal.chosen : picked).includes(choice.label);
                const isCorrect = card.correctLabels.includes(choice.label);
                const className = [
                  'choice',
                  !reveal && on ? 'picked' : '',
                  reveal && isCorrect ? 'correct' : '',
                  reveal && on && !isCorrect ? 'wrong shake' : '',
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
                    {reveal && choice.explanation ? (
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
              itemFigures={figures.items}
              explanations={pbqNotes ?? undefined}
              onZoom={setZoom}
            />
          ) : null}
          {!reveal && multi ? (
            <div className="stack">
              <p className="muted" data-testid="choose-count" style={{ margin: 0 }}>
                Choose {required}. {picked.length} of {required} selected.
              </p>
              <button
                className="btn btn-primary btn-block"
                data-testid="submit"
                type="button"
                disabled={paused || pending || picked.length !== required}
                onClick={() => submit(picked, gradeLabels(card.correctLabels, picked))}
              >
                Submit
              </button>
            </div>
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
                <span className="result-icon" aria-hidden="true">
                  {reveal.correct ? '✓' : '✗'}
                </span>{' '}
                {reveal.correct ? 'Correct' : 'Incorrect'}
              </p>
              {!reveal.correct && !graded && !pbq && card.answer ? (
                <p data-testid="correct-answer" style={{ margin: 0 }}>
                  {card.answer}
                </p>
              ) : null}
              {pbq && figures.explanation.length ? (
                <div className="stack">
                  {figures.explanation.map((src) => (
                    <img key={src} className="figure-img" data-testid="explanation-figure" src={src} alt="Figure from your PDF" />
                  ))}
                </div>
              ) : null}
              {!pbq ? (
                <div className="stack">
                  <p data-testid="explanation" style={{ margin: 0 }}>
                    {explanationText}
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
                  setReveal(null);
                  setPicked([]);
                  if (finished) navigate(`/results/${session.id}`);
                }}
              >
                {reveal.finished || session.status === 'finished' ? 'See results' : session.skipReview ? 'Review skipped' : 'Next'}
              </button>
            </div>
          ) : (
            <div className="stack">
              <button
                className="btn btn-ghost btn-block"
                data-testid="skip-for-later"
                type="button"
                disabled={paused || pending}
                onClick={() => {
                  if (pendingRef.current) return;
                  pendingRef.current = true;
                  setPending(true);
                  void study.skip(session.id, card.id).finally(() => {
                    pendingRef.current = false;
                    setPending(false);
                    setPicked([]);
                  });
                }}
              >
                Skip for later
              </button>
              <button
                className="btn btn-ghost btn-block"
                data-testid="i-dont-know"
                type="button"
                aria-label="I don't know"
                disabled={paused || pending}
                onClick={() => submit([], false, 'unknown')}
              >
                I don't know
              </button>
            </div>
          )}
        </article>
      ) : (
        <p>No card is left in this session.</p>
      )}
    </div>
  );
}

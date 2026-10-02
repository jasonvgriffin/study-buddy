import { PbqAnswerList } from './PbqAnswers';
import { useEffect, useState } from 'react';
import { figureCountForCards } from './lib/db';
import { dueCardIds } from './lib/queue';
import { isUnclearedMiss, rollup } from './lib/scoring';
import { deckLabel } from './lib/deckLabel';
import { resumeButtonLabel } from './lib/resumeButton';
import { activeSessionForDeck, resumeLabelParts } from './lib/session';
import { navigate } from './nav';
import { DemandPanel, DrillReplacePrompt, ResetConfirm, Screen } from './bits';
import { useStudy } from './store';
import type { Card } from './lib/types';

export function DeckScreen({ deckId, cardId = null }: { deckId: string; cardId?: string | null }) {
  const study = useStudy();
  const snap = study.snap;
  const deck = snap?.decks.find((item) => item.id === deckId) ?? null;
  const [editing, setEditing] = useState<string | null>(cardId);
  const [openedCard, setOpenedCard] = useState<string | null>(cardId);
  if (cardId !== openedCard) {
    setOpenedCard(cardId);
    setEditing(cardId);
  }
  useEffect(() => {
    if (!cardId) return;
    const panel = document.querySelector('[data-testid="card-editor-panel"]');
    if (panel instanceof HTMLElement) {
      panel.scrollIntoView({ block: 'start' });
      return;
    }
    document.getElementById(`card-${cardId}`)?.scrollIntoView({ block: 'center' });
  }, [cardId]);
  const [name, setName] = useState(deck?.name ?? '');
  const [figureCount, setFigureCount] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [drillPrompt, setDrillPrompt] = useState(false);
  useEffect(() => {
    if (deck) setName(deck.name);
  }, [deck]);
  const cardKey = snap?.cards
    .filter((card) => card.deckId === deckId)
    .map((card) => card.id)
    .join('|') ?? '';
  useEffect(() => {
    let alive = true;
    const ids = cardKey.length ? cardKey.split('|') : [];
    void figureCountForCards(ids).then((count) => {
      if (alive) setFigureCount(count);
    });
    return () => {
      alive = false;
    };
  }, [deckId, cardKey]);
  if (!snap || !deck) {
    return (
      <Screen title="Test" onBack={() => navigate('/')}>
        <p>That test is not on this device.</p>
      </Screen>
    );
  }
  const label = deckLabel(deck, snap.decks);
  const cards = snap.cards.filter((card) => card.deckId === deck.id).sort((a, b) => a.order - b.order);
  const memories = snap.memories.filter((memory) => memory.deckId === deck.id);
  const stats = rollup(memories);
  const missed = cards.filter((card) => {
    const memory = snap.memories.find((item) => item.cardId === card.id);
    return memory ? isUnclearedMiss(memory) : false;
  }).length;
  const due = dueCardIds(cards, snap.memories, Date.now(), { deckId: deck.id }).length;
  const active = activeSessionForDeck(snap.sessions, deck.id);
  const resumeParts = active ? resumeLabelParts(active, Date.now()) : null;
  const domains = [...new Set(cards.map((card) => card.domainNumber).filter((n): n is number => n != null))];

  const editingCard = cards.find((card) => card.id === editing) ?? null;

  return (
    <Screen title={label} lede={deck.sourceFileName} onBack={() => navigate('/')}>
      {editingCard ? (
        <DemandPanel
          key={editingCard.id}
          title={`Edit ${editingCard.sourceLabel}`}
          testId="card-editor-panel"
          onCancel={() => setEditing(null)}
        >
          <p style={{ margin: 0 }}>{editingCard.question}</p>
          <CardFields card={editingCard} />
        </DemandPanel>
      ) : null}
      {figureCount === 0 ? (
        <p className="banner" data-testid="reimport-figures" style={{ margin: 0 }}>
          No diagrams are saved with this test. If the PDF has pictures, import it again.
        </p>
      ) : null}
      <p className="muted" data-testid="figure-status" data-count={figureCount == null ? '' : String(figureCount)} style={{ margin: 0 }}>
        {cards.length} cards
        {stats.attempts ? ` · ${stats.correct} right, ${stats.incorrect} wrong` : ' · no answers yet'}
      </p>
      {active ? (
        <article className="card stack" style={{ padding: '0.9rem' }} data-testid="deck-resume">
          <p style={{ margin: 0 }}>
            {resumeParts?.lead}
            {label}
            {resumeParts?.rest}
          </p>
          <button className="btn btn-primary btn-block home-continue" data-testid="resume" type="button" onClick={() => void study.resume(active.id)}>
            <span className="home-continue-label">{resumeButtonLabel(label)}</span>
          </button>
          <button className="btn btn-ghost" data-testid="discard" type="button" onClick={() => setConfirmReset(true)}>
            Discard and start over
          </button>
        </article>
      ) : (
        <div className="stack">
          <button className="btn btn-primary btn-block" data-testid="start-untimed" type="button" onClick={() => void study.startExam(deck, false)}>
            Start untimed
          </button>
          <button className="btn btn-ghost btn-block" data-testid="start-timed" type="button" onClick={() => void study.startExam(deck, true)}>
            Start 90-minute exam
          </button>
        </div>
      )}
      <button
        className="btn btn-ghost btn-block"
        data-testid="drill-missed"
        type="button"
        onClick={() => {
          void study.startMissedDrill(deck, null, { holdForConfirm: true }).then((result) => {
            setDrillPrompt(result === 'busy');
          });
        }}
      >
        Drill missed cards{missed ? ` (${missed})` : ''}
      </button>
      {drillPrompt ? (
        <DrillReplacePrompt
          deckName={label}
          onStart={() => {
            setDrillPrompt(false);
            void study.startMissedDrill(deck, null, { replaceOpen: true });
          }}
          onCancel={() => setDrillPrompt(false)}
        />
      ) : null}
      <button
        className="btn btn-ghost btn-block"
        data-testid="review-due"
        type="button"
        onClick={() =>
          void study.startDueReview(deck.name, {
            subjectId: deck.subjectId,
            deckId: deck.id,
            scopeKey: `review:deck:${deck.id}`,
          })
        }
      >
        Recommended Questions{due ? ` (${due})` : ''}
      </button>
      {domains.length ? (
        <div className="row-scroll">
          {domains.map((number) => {
            const label = cards.find((card) => card.domainNumber === number)?.domainName ?? `Domain ${number}`;
            return (
              <button
                key={number}
                className="chip"
                type="button"
                onClick={() =>
                  void study.startDueReview(label, {
                    subjectId: deck.subjectId,
                    deckId: deck.id,
                    domainNumber: number,
                    scopeKey: `review:deck:${deck.id}:domain:${number}`,
                  })
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void study.renameDeck(deck, name);
        }}
      >
        <label className="stack" style={{ gap: '0.35rem' }}>
          <span>Test name</span>
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <button className="btn btn-ghost" type="submit">
          Rename test
        </button>
      </form>
      <div className="stack">
        {cards.map((card) => (
          <div key={card.id} id={`card-${card.id}`} className="card stack" data-testid="deck-card" data-card-id={card.id} style={{ padding: '0.85rem' }}>
            <button className="btn btn-ghost btn-block" type="button" aria-pressed={editing === card.id} onClick={() => setEditing(editing === card.id ? null : card.id)}>
              {card.sourceLabel}. {card.question.slice(0, 90)}
            </button>
          </div>
        ))}
      </div>
      <button
        className="btn btn-clay btn-block"
        type="button"
        onClick={() => {
          if (window.confirm(`Delete ${label}? Answers for this test are removed too.`)) {
            void study.removeDeck(deck.id);
          }
        }}
      >
        Delete test
      </button>
      {confirmReset ? (
        <ResetConfirm
          onConfirm={() => {
            setConfirmReset(false);
            void study.discard();
          }}
          onCancel={() => setConfirmReset(false)}
        />
      ) : null}
    </Screen>
  );
}

function CardFields({ card }: { card: Card }) {
  const study = useStudy();
  const [explanation, setExplanation] = useState(card.explanation ?? '');
  const [lessonUrl, setLessonUrl] = useState(card.lessonUrl ?? '');
  const [start, setStart] = useState(card.videoStartSec?.toString() ?? '');
  const [section, setSection] = useState(card.section ?? '');
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = start.trim() ? Number(start) : null;
        void study.writeCard({
          ...card,
          explanation: explanation.trim() ? explanation : null,
          lessonUrl: lessonUrl.trim() || null,
          section: section.trim() || null,
          videoStartSec: parsed != null && parsed > 0 ? Math.floor(parsed) : null,
        });
      }}
    >
      {card.pbq ? <PbqAnswerList task={card.pbq} explanation={card.explanation} /> : null}
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Explanation</span>
        <textarea className="field" rows={4} value={explanation} onChange={(event) => setExplanation(event.target.value)} />
      </label>
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Section</span>
        <input className="field" value={section} onChange={(event) => setSection(event.target.value)} />
      </label>
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Lesson link</span>
        <input className="field" value={lessonUrl} onChange={(event) => setLessonUrl(event.target.value)} />
      </label>
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Video start (seconds)</span>
        <input className="field" inputMode="numeric" value={start} onChange={(event) => setStart(event.target.value)} />
      </label>
      <button className="btn btn-primary" type="submit">
        Save card
      </button>
    </form>
  );
}

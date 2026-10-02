import { Fragment, type ReactNode } from 'react';
import { MesserVideoLink, Screen } from './bits';
import { deckLabel } from './lib/deckLabel';
import { detectCert } from './lib/comptia';
import type { DomainScore } from './lib/domains';
import { formatDuration, formatPercent } from './lib/format';
import { CHECKLIST_NOTE, readinessFacts, type ChecklistFacts } from './lib/readiness';
import type { DayStat } from './lib/scoring';
import {
  STATS_DECK_SECTIONS,
  byTestRows,
  deckBreakdown,
  type ByTestRow,
} from './lib/statsDeck';
import { navigate } from './nav';
import { useStudy } from './store';

type AccuracyTotals = {
  accuracy: number | null;
  correct: number;
  incorrect: number;
  attempts: number;
};

export type WeakestRow = {
  cardId: string;
  question: string;
  correct: number;
  attempts: number;
  deckLabel: string | null;
};

function AccuracyCard({
  totals,
  activeMs,
  testId,
}: {
  totals: AccuracyTotals;
  activeMs: number;
  testId: string;
}) {
  return (
    <article className="card stack" data-testid={testId} style={{ padding: '1rem' }}>
      <h2>{formatPercent(totals.accuracy)}</h2>
      <p style={{ margin: 0 }}>
        {totals.correct} right, {totals.incorrect} wrong, {totals.attempts} answers.
      </p>
      <p style={{ margin: 0 }}>Active study time {formatDuration(activeMs)}.</p>
    </article>
  );
}

function DaySection({ days }: { days: DayStat[] }) {
  return (
    <section className="stack" data-testid="accuracy-by-day">
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
  );
}

function DomainSection({ domains, certId }: { domains: DomainScore[]; certId: string | null }) {
  return (
    <section className="stack" data-testid="domain-stats">
      <h2>By domain</h2>
      {!domains.length ? <p className="muted">Answer a few cards and the domains from your PDF show up here.</p> : null}
      {domains.map((domain) => (
        <article key={domain.key} className="card stack" data-testid="domain-score" style={{ padding: '0.85rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.35rem', alignItems: 'baseline' }}>
            <strong>{domain.name}</strong>
            <MesserVideoLink certId={certId} domainName={domain.name} />
          </div>
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
  );
}

function WeakestSection({ rows }: { rows: WeakestRow[] }) {
  return (
    <section className="stack" data-testid="weakest-cards">
      <h2>Weakest cards</h2>
      {!rows.length ? <p className="muted">Not enough answers to rank cards yet.</p> : null}
      {rows.map((row) => (
        <article key={row.cardId} className="card" data-testid="weakest-card" style={{ padding: '0.85rem' }}>
          <p style={{ margin: 0 }}>{row.question}</p>
          {row.deckLabel ? (
            <p className="muted" data-testid="weakest-deck" style={{ margin: '0.25rem 0 0' }}>
              {row.deckLabel}
            </p>
          ) : null}
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {row.correct} of {row.attempts} correct
          </p>
        </article>
      ))}
    </section>
  );
}

function factLine(fact: { name: string; correct: number; answered: number }) {
  return `${fact.name}: ${fact.correct} of ${fact.answered}`;
}

function streakLine(days: number): string {
  return days === 1 ? 'Streak: 1 day' : `Streak: ${days} days`;
}

export function ChecklistSection({ facts }: { facts: ChecklistFacts }) {
  return (
    <section className="stack" data-testid="readiness-checklist">
      <h2>Checklist</h2>
      <div>
        <p style={{ margin: 0 }}>At or above 80%</p>
        {facts.above.length ? (
          <ul className="today-subjects" data-testid="checklist-above">
            {facts.above.map((fact) => (
              <li key={fact.name}>{factLine(fact)}</li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            None
          </p>
        )}
      </div>
      <div>
        <p style={{ margin: 0 }}>Below 80%</p>
        {facts.below.length ? (
          <ul className="today-subjects" data-testid="checklist-below">
            {facts.below.map((fact) => (
              <li key={fact.name}>{factLine(fact)}</li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            None
          </p>
        )}
      </div>
      <p data-testid="checklist-due" style={{ margin: 0 }}>
        Due now: {facts.due}
      </p>
      <p data-testid="checklist-streak" style={{ margin: 0 }}>
        {streakLine(facts.streak)}
      </p>
      <p className="muted" data-testid="checklist-note" style={{ margin: 0 }}>
        {CHECKLIST_NOTE}
      </p>
    </section>
  );
}

export function StatsOverview({
  tests,
  checklist,
  onOpenTest,
}: {
  tests: ByTestRow[];
  checklist: ChecklistFacts;
  onOpenTest: (deckId: string) => void;
}) {
  return (
    <Screen title="Stats">
      <ChecklistSection facts={checklist} />
      <section className="stack" data-testid="by-test">
        <h2>By test</h2>
        {!tests.length ? <p className="muted">No tests in this view.</p> : null}
        {tests.map((row) => (
          <button
            key={row.id}
            type="button"
            className="card by-test"
            data-testid="by-test-row"
            data-deck-id={row.id}
            onClick={() => onOpenTest(row.id)}
          >
            <strong>{row.label}</strong>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>
              {row.attempts ? `${formatPercent(row.accuracy)} over ${row.attempts} answers` : 'No answers yet'}
            </p>
            {row.progress ? (
              <p className="muted" data-testid="in-progress" style={{ margin: '0.25rem 0 0' }}>
                {row.progress}
              </p>
            ) : null}
          </button>
        ))}
      </section>
    </Screen>
  );
}

export function StatsDeckDetail({
  title,
  totals,
  activeMs,
  days,
  domains,
  certId = null,
  weakest,
  onBack,
}: {
  title: string;
  totals: AccuracyTotals;
  activeMs: number;
  days: DayStat[];
  domains: DomainScore[];
  certId?: string | null;
  weakest: WeakestRow[];
  onBack: () => void;
}) {
  const sections: Record<(typeof STATS_DECK_SECTIONS)[number], ReactNode> = {
    accuracy: <AccuracyCard totals={totals} activeMs={activeMs} testId="deck-accuracy" />,
    'by-day': <DaySection days={days} />,
    'by-domain': <DomainSection domains={domains} certId={certId} />,
    weakest: <WeakestSection rows={weakest} />,
  };

  return (
    <Screen
      title={title}
      lede="This test only. Time counts while a session is open, not while the screen is hidden."
      onBack={onBack}
    >
      <div className="stack" data-testid="stats-deck">
        {STATS_DECK_SECTIONS.map((id) => (
          <Fragment key={id}>{sections[id]}</Fragment>
        ))}
      </div>
    </Screen>
  );
}

export function Stats() {
  const study = useStudy();
  const snap = study.snap;
  if (!snap) return null;
  const deckId = study.route.name === 'stats' ? study.route.deckId : undefined;

  if (deckId) {
    const deck = snap.decks.find((item) => item.id === deckId);
    if (!deck) {
      return (
        <Screen title="Stats" onBack={() => navigate('/stats')}>
          <p>That test is not on this device.</p>
        </Screen>
      );
    }
    const offset = new Date().getTimezoneOffset();
    const now = Date.now();
    const cardById = new Map(snap.cards.map((card) => [card.id, card]));
    const breakdown = deckBreakdown({
      deckId,
      reviews: snap.reviews,
      memories: snap.memories,
      sessions: snap.sessions,
      cards: snap.cards,
      now,
      offsetMinutes: offset,
    });
    const subject = snap.subjects.find((item) => item.id === deck.subjectId);
    const deckCards = snap.cards.filter((card) => card.deckId === deck.id);
    return (
      <StatsDeckDetail
        title={deckLabel(deck, snap.decks)}
        totals={breakdown.totals}
        activeMs={breakdown.activeMs}
        days={breakdown.days.slice(-14)}
        domains={breakdown.domains}
        certId={!deck.mentionsMesser ? null : detectCert([
          subject?.name,
          deck.name,
          deck.sourceFileName,
          ...deckCards.map((card) => card.examCode),
        ])}
        weakest={breakdown.weakest.map((memory) => ({
          cardId: memory.cardId,
          question: cardById.get(memory.cardId)?.question ?? 'Card',
          correct: memory.correct,
          attempts: memory.attempts,
          deckLabel: null,
        }))}
        onBack={() => navigate('/stats')}
      />
    );
  }

  const inFocus = (subjectId: string) => study.focus === 'all' || study.focus === subjectId;
  const memories = snap.memories.filter((memory) => inFocus(memory.subjectId));
  const decks = snap.decks.filter((deck) => inFocus(deck.subjectId));
  const sessions = snap.sessions.filter((session) => inFocus(session.subjectId));
  const cards = snap.cards.filter((card) => inFocus(card.subjectId));
  const reviews = snap.reviews.filter((review) => inFocus(review.subjectId));

  return (
    <StatsOverview
      tests={byTestRows({ decks, catalog: snap.decks, memories, sessions })}
      checklist={readinessFacts({
        cards,
        memories,
        reviews,
        now: Date.now(),
        offsetMinutes: new Date().getTimezoneOffset(),
      })}
      onOpenTest={(id) => navigate(`/stats/test/${encodeURIComponent(id)}`)}
    />
  );
}

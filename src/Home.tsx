import { useState } from 'react';
import { studyRecommendations } from './lib/areas';
import { domainBreakdown } from './lib/domains';
import { formatPercent } from './lib/format';
import { dueCardIds } from './lib/queue';
import { isUnclearedMiss } from './lib/scoring';
import { resumeLabel, sessionMissedCardIds } from './lib/session';
import { navigate } from './nav';
import type { StudySnapshot } from './lib/db';
import { useStudy } from './store';
import type { Card, Deck, LiveSession, Subject } from './lib/types';

type HomeTab = 'study' | 'library' | 'progress' | 'settings';

function defaultTab(snap: StudySnapshot | null, focus: string): HomeTab {
  if (!snap) return 'library';
  const inFocus = (subjectId: string) => focus === 'all' || focus === subjectId;
  const hasDeck = snap.decks.some((deck) => inFocus(deck.subjectId));
  const hasSession = snap.sessions.some((session) => session.status !== 'finished' && inFocus(session.subjectId));
  return hasDeck || hasSession ? 'study' : 'library';
}

export function Home() {
  const study = useStudy();
  const snap = study.snap;
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  const [tab, setTab] = useState<HomeTab>(() => defaultTab(study.snap, study.focus));
  const [examDeckId, setExamDeckId] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  if (!snap) return null;

  const now = Date.now();
  const subjects = [...snap.subjects].sort((a, b) => a.name.localeCompare(b.name));
  const inFocus = (subjectId: string) => study.focus === 'all' || study.focus === subjectId;
  const decks = snap.decks.filter((deck) => inFocus(deck.subjectId));
  const cards = snap.cards.filter((card) => inFocus(card.subjectId));
  const due = dueCardIds(snap.cards, snap.memories, now, study.focus === 'all' ? {} : { subjectId: study.focus });
  const sessions = snap.sessions
    .filter((session) => session.status !== 'finished' && inFocus(session.subjectId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const primary = sessions[0] ?? null;
  const recommendations = studyRecommendations(
    snap.subjects,
    snap.decks,
    snap.cards,
    snap.reviews,
    snap.memories,
    study.focus,
    now,
  ).slice(0, 6);
  const focused = subjects.find((subject) => subject.id === study.focus) ?? null;
  const examDeck = decks.find((deck) => deck.id === examDeckId) ?? decks[0] ?? null;
  const recentDeck =
    decks.find((deck) => deck.id === [...snap.sessions].sort((a, b) => b.updatedAt - a.updatedAt).find((session) => inFocus(session.subjectId))?.deckId) ??
    decks[0] ??
    null;

  return (
    <div className="stack">
      <header className="stack" style={{ gap: '0.3rem' }}>
        <h1>Study Buddy</h1>
        <p className="muted" style={{ margin: 0 }}>
          Your PDFs, as flashcards. Questions come only from files you add.
        </p>
      </header>

      <div className="row-scroll" role="tablist" aria-label="Subjects">
        <button className={study.focus === 'all' ? 'chip on' : 'chip'} type="button" onClick={() => study.setFocus('all')}>
          All subjects
        </button>
        {subjects.map((subject) => (
          <button
            key={subject.id}
            className={study.focus === subject.id ? 'chip on' : 'chip'}
            type="button"
            data-testid="subject-chip"
            data-subject-name={subject.name}
            onClick={() => study.setFocus(subject.id)}
          >
            {subject.name}
          </button>
        ))}
      </div>

      <StudyHero
        primary={primary}
        now={now}
        startDeck={recentDeck}
        onContinue={() => {
          if (primary) void study.resume(primary.id);
        }}
        onStart={() => {
          if (recentDeck) void study.startExam(recentDeck, false);
          else setTab('library');
        }}
      />

      <div className="home-tabs" role="tablist" aria-label="Home">
        {(
          [
            ['study', 'Study', 'Continue'],
            ['library', 'Library', 'Decks'],
            ['progress', 'Progress', 'Scores'],
            ['settings', 'Settings', 'Backup'],
          ] as const
        ).map(([id, label, note]) => (
          <button
            key={id}
            className={tab === id ? 'home-tab on' : 'home-tab'}
            type="button"
            role="tab"
            id={`home-tab-${id}`}
            data-testid={`home-tab-${id}`}
            aria-selected={tab === id}
            aria-controls="home-panel"
            aria-label={id === 'settings' ? 'Settings and backup' : label}
            onClick={() => setTab(id)}
          >
            <span>{label}</span>
            <span className="home-tab-note">{note}</span>
          </button>
        ))}
      </div>

      <div className="card stack home-panel" role="tabpanel" id="home-panel" aria-labelledby={`home-tab-${tab}`}>
        {tab === 'study' ? (
          <StudyPanel
            sessions={sessions}
            primary={primary}
            now={now}
            decks={decks}
            examDeck={examDeck}
            dueCount={due.length}
            recommendations={recommendations}
            onPickDeck={setExamDeckId}
            onLibrary={() => setTab('library')}
            onResume={(id) => void study.resume(id)}
            onDiscard={(id) => void study.discard(id)}
            onUntimed={() => {
              if (examDeck) void study.startExam(examDeck, false);
            }}
            onTimed={() => {
              if (examDeck) void study.startExam(examDeck, true);
            }}
            onDrill={() => {
              if (examDeck) void study.startMissedDrill(examDeck, null);
            }}
            onReviewDue={() => {
              void study.startDueReview(study.focus === 'all' ? 'Due for review' : 'Due in this subject', {
                subjectId: study.focus === 'all' ? null : study.focus,
                scopeKey: `review:home:${study.focus}`,
              });
            }}
            onRecommendation={(item) => void study.startRecommendation(item)}
          />
        ) : null}
        {tab === 'library' ? (
          <LibraryPanel
            snap={snap}
            decks={decks}
            cards={cards}
            subjects={subjects}
            focused={focused}
            name={name}
            rename={rename}
            inFocus={inFocus}
            onName={setName}
            onRename={setRename}
            onAddSubject={() => {
              void study.addSubject(name).then(() => setName(''));
            }}
            onSaveSubject={() => {
              if (focused) void study.renameSubject(focused.id, rename || focused.name);
            }}
            onDeleteSubject={() => {
              if (!focused) return;
              if (window.confirm(`Delete ${focused.name} and every test inside it?`)) void study.removeSubject(focused.id);
            }}
          />
        ) : null}
        {tab === 'progress' ? <ProgressPanel snap={snap} cards={cards} inFocus={inFocus} /> : null}
        {tab === 'settings' ? (
          <SettingsPanel
            error={backupError}
            onExport={() => void study.downloadBackup()}
            onImport={(file) => {
              void study.restoreBackup(file).catch((reason: unknown) => {
                setBackupError(reason instanceof Error ? reason.message : 'Could not import that file.');
              });
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function StudyHero({
  primary,
  now,
  startDeck,
  onContinue,
  onStart,
}: {
  primary: LiveSession | null;
  now: number;
  startDeck: Deck | null;
  onContinue: () => void;
  onStart: () => void;
}) {
  if (primary) {
    return (
      <article className="card stack home-hero" style={{ padding: '1rem' }} data-testid="resume-card">
        <p className="muted" style={{ margin: 0 }}>
          Continue
        </p>
        <p style={{ margin: 0 }}>{resumeLabel(primary, now)}</p>
        <button className="btn btn-primary btn-block" data-testid="resume" type="button" onClick={onContinue}>
          Continue
        </button>
      </article>
    );
  }
  return (
    <article className="card stack home-hero" style={{ padding: '1rem' }} data-testid="study-hero">
      <p className="muted" style={{ margin: 0 }}>
        Start studying
      </p>
      <p style={{ margin: 0 }}>{startDeck ? startDeck.name : 'Add a PDF to build your first test.'}</p>
      <button className="btn btn-primary btn-block" data-testid="start-studying" type="button" onClick={onStart}>
        {startDeck ? 'Start studying' : 'Import a PDF'}
      </button>
    </article>
  );
}

function StudyPanel({
  sessions,
  primary,
  now,
  decks,
  examDeck,
  dueCount,
  recommendations,
  onPickDeck,
  onLibrary,
  onResume,
  onDiscard,
  onUntimed,
  onTimed,
  onDrill,
  onReviewDue,
  onRecommendation,
}: {
  sessions: LiveSession[];
  primary: LiveSession | null;
  now: number;
  decks: Deck[];
  examDeck: Deck | null;
  dueCount: number;
  recommendations: ReturnType<typeof studyRecommendations>;
  onPickDeck: (id: string) => void;
  onLibrary: () => void;
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
  onUntimed: () => void;
  onTimed: () => void;
  onDrill: () => void;
  onReviewDue: () => void;
  onRecommendation: (item: ReturnType<typeof studyRecommendations>[number]) => void;
}) {
  const others = sessions.filter((session) => session.id !== primary?.id);
  return (
    <>
      <h2>Study</h2>
      {primary ? (
        <button className="btn btn-ghost btn-block" data-testid="discard" type="button" onClick={() => onDiscard(primary.id)}>
          Discard and start over
        </button>
      ) : null}
      {others.map((session) => (
        <article key={session.id} className="stack" data-testid="resume-card">
          <p style={{ margin: 0 }}>{resumeLabel(session, now)}</p>
          <button className="btn btn-primary btn-block" data-testid="resume" type="button" onClick={() => onResume(session.id)}>
            Continue
          </button>
          <button className="btn btn-ghost btn-block" data-testid="discard" type="button" onClick={() => onDiscard(session.id)}>
            Discard and start over
          </button>
        </article>
      ))}
      {!decks.length ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Add a test in Library, then come back to practice, drill, or review.
          </p>
          <button className="btn btn-primary btn-block" type="button" onClick={onLibrary}>
            Open library
          </button>
        </>
      ) : (
        <>
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span>Test</span>
            <select
              className="field"
              data-testid="exam-deck"
              value={examDeck?.id ?? ''}
              onChange={(event) => onPickDeck(event.target.value)}
            >
              {decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary btn-block" data-testid="practice-exam" type="button" onClick={onUntimed}>
            Practice exam
          </button>
          <button className="btn btn-ghost btn-block" data-testid="start-timed-home" type="button" onClick={onTimed}>
            90-minute exam
          </button>
          <button className="btn btn-ghost btn-block" data-testid="drill-home" type="button" onClick={onDrill}>
            Drill missed cards
          </button>
          <button className="btn btn-ghost btn-block" data-testid="review-due-home" type="button" onClick={onReviewDue}>
            Review due cards{dueCount ? ` (${dueCount})` : ''}
          </button>
        </>
      )}
      {recommendations.length ? (
        <div className="stack">
          <h2>What to study next</h2>
          {recommendations.map((item) => (
            <article key={item.id} className="stack">
              <p style={{ margin: 0 }}>{item.text}</p>
              <button className="btn btn-primary btn-block" type="button" onClick={() => onRecommendation(item)}>
                Study this
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}

function LibraryPanel({
  snap,
  decks,
  cards,
  subjects,
  focused,
  name,
  rename,
  inFocus,
  onName,
  onRename,
  onAddSubject,
  onSaveSubject,
  onDeleteSubject,
}: {
  snap: StudySnapshot;
  decks: Deck[];
  cards: Card[];
  subjects: Subject[];
  focused: Subject | null;
  name: string;
  rename: string;
  inFocus: (subjectId: string) => boolean;
  onName: (value: string) => void;
  onRename: (value: string) => void;
  onAddSubject: () => void;
  onSaveSubject: () => void;
  onDeleteSubject: () => void;
}) {
  const groups = new Map<string, Deck[]>();
  for (const deck of [...decks].sort((a, b) => a.name.localeCompare(b.name))) {
    const list = groups.get(deck.sourceGroupId) ?? [];
    list.push(deck);
    groups.set(deck.sourceGroupId, list);
  }
  const drafts = snap.drafts.filter((draft) => !draft.subjectId || inFocus(draft.subjectId));

  return (
    <>
      <h2>Library</h2>
      {!decks.length ? (
        <p className="muted" style={{ margin: 0 }}>
          {subjects.length
            ? 'No tests in this view yet. Upload a PDF and save the tests you want to keep.'
            : 'Add a subject, then upload a PDF. Each file stays in the subject you pick.'}
        </p>
      ) : (
        [...groups.entries()].map(([groupId, list]) => (
          <div key={groupId} className="stack">
            <p className="muted" style={{ margin: 0 }}>
              {list[0]?.sourceFileName}
            </p>
            {list.map((deck) => {
              const count = cards.filter((card) => card.deckId === deck.id).length;
              return (
                <button
                  key={deck.id}
                  className="card"
                  data-testid="deck-link"
                  data-deck-name={deck.name}
                  type="button"
                  style={{ padding: '0.95rem 1rem', textAlign: 'left' }}
                  onClick={() => navigate(`/deck/${deck.id}`)}
                >
                  <strong>{deck.name}</strong>
                  <span className="muted" style={{ display: 'block' }}>
                    {count} cards
                  </span>
                </button>
              );
            })}
          </div>
        ))
      )}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          onAddSubject();
        }}
      >
        <label className="stack" style={{ gap: '0.35rem' }}>
          <span>New subject</span>
          <input
            className="field"
            data-testid="subject-name"
            value={name}
            placeholder="Core 1, Network+, a textbook..."
            onChange={(event) => onName(event.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-block" data-testid="add-subject" type="submit">
          Add subject
        </button>
      </form>
      {focused ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveSubject();
          }}
        >
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span>Rename {focused.name}</span>
            <input className="field" value={rename || focused.name} onChange={(event) => onRename(event.target.value)} />
          </label>
          <button className="btn btn-ghost btn-block" type="submit">
            Save name
          </button>
          <button className="btn btn-clay btn-block" type="button" onClick={onDeleteSubject}>
            Delete subject
          </button>
        </form>
      ) : null}
      <UploadBlock />
      {drafts.length ? (
        <div className="stack">
          <h2>Waiting for review</h2>
          {drafts.map((draft) => (
            <button key={draft.id} className="btn btn-ghost btn-block" type="button" onClick={() => navigate(`/review/${draft.id}`)}>
              {draft.fileName}: {draft.tests.length} test{draft.tests.length === 1 ? '' : 's'}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ProgressPanel({
  snap,
  cards,
  inFocus,
}: {
  snap: StudySnapshot;
  cards: Card[];
  inFocus: (subjectId: string) => boolean;
}) {
  const domains = domainBreakdown(
    cards,
    snap.reviews.filter((review) => inFocus(review.subjectId)).map((review) => ({ cardId: review.cardId, correct: review.correct })),
  );
  const finished = snap.sessions
    .filter((session) => session.status === 'finished' && inFocus(session.subjectId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const missedCards = cards.filter((card) => {
    const memory = snap.memories.find((item) => item.cardId === card.id);
    return memory ? isUnclearedMiss(memory) : false;
  });

  return (
    <>
      <h2>Progress</h2>
      <button className="btn btn-primary btn-block" type="button" onClick={() => navigate('/stats')}>
        Stats
      </button>
      <h2>Domain breakdown</h2>
      {!domains.length ? <p className="muted" style={{ margin: 0 }}>Answer a few cards and the domains from your PDF show up here.</p> : null}
      {domains.map((domain) => (
        <article key={domain.key} className="stack">
          <strong>{domain.name}</strong>
          <p style={{ margin: 0 }}>
            {formatPercent(domain.correct + domain.incorrect ? domain.correct / (domain.correct + domain.incorrect) : null)} · {domain.correct} right, {domain.incorrect} wrong
          </p>
        </article>
      ))}
      <h2>Missed questions</h2>
      {!finished.some((session) => sessionMissedCardIds(session).length) && !missedCards.length ? (
        <p className="muted" style={{ margin: 0 }}>
          Nothing missed yet.
        </p>
      ) : null}
      {finished.map((session) => {
        const missed = sessionMissedCardIds(session);
        if (!missed.length) return null;
        return (
          <button
            key={session.id}
            className="btn btn-ghost btn-block"
            type="button"
            onClick={() => navigate(`/results/${session.id}`)}
          >
            Missed questions · {session.deckName} ({missed.length})
          </button>
        );
      })}
      {missedCards.map((card) => (
        <button
          key={card.id}
          className="btn btn-ghost btn-block"
          type="button"
          style={{ textAlign: 'left' }}
          onClick={() => navigate(`/deck/${card.deckId}/card/${card.id}`)}
        >
          {card.question}
        </button>
      ))}
    </>
  );
}

function SettingsPanel({
  error,
  onExport,
  onImport,
}: {
  error: string | null;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  return (
    <>
      <h2>Settings and backup</h2>
      <p className="muted" style={{ margin: 0 }}>
        Text size, haptics, sounds, and storage live on the settings screen. Export a backup after you study.
      </p>
      <button className="btn btn-primary btn-block" type="button" onClick={() => navigate('/settings')}>
        Open settings
      </button>
      <button className="btn btn-ghost btn-block" type="button" onClick={onExport}>
        Export backup
      </button>
      <label className="btn btn-ghost btn-block">
        Import backup
        <input
          hidden
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onImport(file);
          }}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}

function UploadBlock() {
  const study = useStudy();
  const snap = study.snap;
  const needsSubject = study.focus === 'all' || !snap?.subjects.some((subject) => subject.id === study.focus);

  return (
    <div className="stack">
      <h2>Import a PDF</h2>
      <p className="muted" style={{ margin: 0 }}>
        {needsSubject
          ? 'Choose a subject first. All subjects is only a view. Uploads stay on this device.'
          : 'Text is copied from the PDF as written. Study Buddy does not write new questions.'}
      </p>
      <label className="btn btn-primary btn-block" style={{ opacity: needsSubject ? 0.55 : 1 }}>
        Upload a PDF
        <input
          data-testid="pdf-file"
          type="file"
          accept="application/pdf,.pdf"
          disabled={needsSubject || !!study.busy}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void study.importPdf(file);
          }}
        />
      </label>
      <button
        className="btn btn-ghost btn-block"
        data-testid="load-sample-three"
        type="button"
        disabled={needsSubject || !!study.busy}
        onClick={() => void study.loadSample('three')}
      >
        Load sample: three tests
      </button>
      <button
        className="btn btn-ghost btn-block"
        data-testid="load-sample-notes"
        type="button"
        disabled={needsSubject || !!study.busy}
        onClick={() => void study.loadSample('notes')}
      >
        Load sample: notes
      </button>
      <p className="muted" style={{ margin: 0 }}>
        Samples are labeled practice files. They are not added until you save them.
      </p>
    </div>
  );
}

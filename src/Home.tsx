import { useState } from 'react';
import { DestructiveConfirm, ResetConfirm } from './bits';
import { domainBreakdown } from './lib/domains';
import { readExamDeckId, resolveDeckPick, sortDecksByName, writeExamDeckId } from './lib/examDeck';
import { formatPercent } from './lib/format';
import { dueCardIds } from './lib/queue';
import { isUnclearedMiss } from './lib/scoring';
import { resumeLabel, sessionMissedCardIds } from './lib/session';
import { nextHomeTab } from './homeTab';
import { navigate } from './nav';
import type { StudySnapshot } from './lib/db';
import { useStudy } from './store';
import type { Card, Deck, LiveSession, Subject } from './lib/types';

export function Home() {
  const study = useStudy();
  const snap = study.snap;
  const tab = study.homeTab;
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  const [examDeckId, setExamDeckId] = useState<string | null>(() => readExamDeckId());
  const [naming, setNaming] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  if (!snap) return null;

  const now = Date.now();
  const subjects = [...snap.subjects].sort((a, b) => a.name.localeCompare(b.name));
  const inFocus = (subjectId: string) => study.focus === 'all' || study.focus === subjectId;
  const decks = sortDecksByName(snap.decks.filter((deck) => inFocus(deck.subjectId)));
  const cards = snap.cards.filter((card) => inFocus(card.subjectId));
  const due = dueCardIds(snap.cards, snap.memories, now, study.focus === 'all' ? {} : { subjectId: study.focus });
  const sessions = snap.sessions
    .filter((session) => session.status !== 'finished' && inFocus(session.subjectId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const primary = sessions[0] ?? null;
  const focused = subjects.find((subject) => subject.id === study.focus) ?? null;
  const examDeck = resolveDeckPick(decks, snap.sessions, inFocus, examDeckId);
  const recentDeck = resolveDeckPick(decks, snap.sessions, inFocus, null);

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
        emptyDetail={focused ? `Import a PDF into ${focused.name}.` : 'Name a subject, then import its PDF.'}
        emptyAction={focused ? 'Import a PDF' : 'Start a new subject'}
        onContinue={() => {
          if (primary) void study.resume(primary.id);
        }}
        onStart={() => {
          if (recentDeck) void study.startExam(recentDeck, false);
          else {
            study.setHomeTab('library');
            if (!focused) setNaming(true);
          }
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
            aria-controls={tab === id ? 'home-panel' : undefined}
            aria-label={id === 'settings' ? 'Settings and backup' : label}
            onClick={() => study.setHomeTab(nextHomeTab(tab, id))}
          >
            <span>{label}</span>
            <span className="home-tab-note">{note}</span>
          </button>
        ))}
      </div>

      {tab ? (
        <div className="card stack home-panel" role="tabpanel" id="home-panel" aria-labelledby={`home-tab-${tab}`}>
          {tab === 'study' ? (
            <StudyPanel
              sessions={sessions}
              primary={primary}
              now={now}
              decks={decks}
              examDeck={examDeck}
              dueCount={due.length}
              onPickDeck={(id) => {
                setExamDeckId(id);
                writeExamDeckId(id);
              }}
              onLibrary={() => study.setHomeTab('library')}
              onResume={(id) => void study.resume(id)}
              onReset={() => void study.discard()}
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
              naming={naming}
              inFocus={inFocus}
              onName={setName}
              onRename={setRename}
              onNaming={setNaming}
              onAddSubject={() => {
                void study.addSubject(name).then(() => {
                  setName('');
                  setNaming(false);
                });
              }}
              onSaveSubject={() => {
                if (focused) void study.renameSubject(focused.id, rename || focused.name);
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
      ) : (
        <p className="muted home-tab-hint" data-testid="home-tab-hint">
          Pick a tab to start
        </p>
      )}
    </div>
  );
}

function StudyHero({
  primary,
  now,
  startDeck,
  emptyDetail,
  emptyAction,
  onContinue,
  onStart,
}: {
  primary: LiveSession | null;
  now: number;
  startDeck: Deck | null;
  emptyDetail: string;
  emptyAction: string;
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
      <p style={{ margin: 0 }}>{startDeck ? startDeck.name : emptyDetail}</p>
      <button className="btn btn-primary btn-block" data-testid="start-studying" type="button" onClick={onStart}>
        {startDeck ? 'Start studying' : emptyAction}
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
  onPickDeck,
  onLibrary,
  onResume,
  onReset,
  onUntimed,
  onTimed,
  onDrill,
  onReviewDue,
}: {
  sessions: LiveSession[];
  primary: LiveSession | null;
  now: number;
  decks: Deck[];
  examDeck: Deck | null;
  dueCount: number;
  onPickDeck: (id: string) => void;
  onLibrary: () => void;
  onResume: (id: string) => void;
  onReset: () => void;
  onUntimed: () => void;
  onTimed: () => void;
  onDrill: () => void;
  onReviewDue: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const others = sessions.filter((session) => session.id !== primary?.id);
  return (
    <>
      <h2>Study</h2>
      {primary ? (
        <button className="btn btn-ghost btn-block" data-testid="discard" type="button" onClick={() => setConfirmReset(true)}>
          Discard and start over
        </button>
      ) : null}
      {others.map((session) => (
        <article key={session.id} className="stack" data-testid="resume-card">
          <p style={{ margin: 0 }}>{resumeLabel(session, now)}</p>
          <button className="btn btn-primary btn-block" data-testid="resume" type="button" onClick={() => onResume(session.id)}>
            Continue
          </button>
          <button className="btn btn-ghost btn-block" data-testid="discard" type="button" onClick={() => setConfirmReset(true)}>
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
      {confirmReset ? (
        <ResetConfirm
          onConfirm={() => {
            setConfirmReset(false);
            onReset();
          }}
          onCancel={() => setConfirmReset(false)}
        />
      ) : null}
    </>
  );
}

type LibraryConfirm =
  | { kind: 'subject'; id: string; name: string }
  | { kind: 'source'; sourceGroupId: string; fileName: string; subjectName: string };

function LibraryPanel({
  snap,
  decks,
  cards,
  subjects,
  focused,
  name,
  rename,
  naming,
  inFocus,
  onName,
  onRename,
  onNaming,
  onAddSubject,
  onSaveSubject,
}: {
  snap: StudySnapshot;
  decks: Deck[];
  cards: Card[];
  subjects: Subject[];
  focused: Subject | null;
  name: string;
  rename: string;
  naming: boolean;
  inFocus: (subjectId: string) => boolean;
  onName: (value: string) => void;
  onRename: (value: string) => void;
  onNaming: (naming: boolean) => void;
  onAddSubject: () => void;
  onSaveSubject: () => void;
}) {
  const study = useStudy();
  const [pending, setPending] = useState<LibraryConfirm | null>(null);
  const visibleSubjects = subjects.filter((subject) => inFocus(subject.id));
  const drafts = snap.drafts.filter((draft) => !draft.subjectId || inFocus(draft.subjectId));

  return (
    <>
      <h2>Library</h2>
      {!subjects.length ? (
        <p className="muted" style={{ margin: 0 }}>
          Start a new subject, name it, then import that subject&apos;s PDF.
        </p>
      ) : null}
      {visibleSubjects.map((subject) => {
        const subjectDecks = decks.filter((deck) => deck.subjectId === subject.id);
        const groups = new Map<string, Deck[]>();
        for (const deck of sortDecksByName(subjectDecks)) {
          const list = groups.get(deck.sourceGroupId) ?? [];
          list.push(deck);
          groups.set(deck.sourceGroupId, list);
        }
        const subjectDrafts = drafts.filter((draft) => draft.subjectId === subject.id);
        return (
          <section key={subject.id} className="stack" data-testid="library-subject">
            <h3>{subject.name}</h3>
            <button
              className="btn btn-clay btn-block"
              data-testid="delete-subject"
              type="button"
              onClick={() => setPending({ kind: 'subject', id: subject.id, name: subject.name })}
            >
              Delete {subject.name}
            </button>
            {!subjectDecks.length && !subjectDrafts.length ? (
              <p className="muted" style={{ margin: 0 }}>
                No tests in this subject yet. Upload a PDF and save the tests you want to keep.
              </p>
            ) : null}
            {subjectDrafts.map((draft) => (
              <div
                key={draft.id}
                className="stack"
                data-testid="source-file"
                data-file-name={draft.fileName}
                data-source-id={draft.id}
              >
                <p className="muted" style={{ margin: 0 }}>
                  {draft.fileName}
                </p>
                <button
                  className="btn btn-clay btn-block"
                  data-testid="delete-source"
                  data-file-name={draft.fileName}
                  data-source-id={draft.id}
                  type="button"
                  onClick={() =>
                    setPending({
                      kind: 'source',
                      sourceGroupId: draft.id,
                      fileName: draft.fileName,
                      subjectName: subject.name,
                    })
                  }
                >
                  Delete PDF
                </button>
                <button className="btn btn-ghost btn-block" type="button" onClick={() => navigate(`/review/${draft.id}`)}>
                  {draft.fileName}: {draft.tests.length} test{draft.tests.length === 1 ? '' : 's'} waiting for review
                </button>
              </div>
            ))}
            {[...groups.entries()].map(([groupId, list]) => (
              <div
                key={groupId}
                className="stack"
                data-testid="source-file"
                data-file-name={list[0]?.sourceFileName ?? ''}
                data-source-id={groupId}
              >
                <p className="muted" style={{ margin: 0 }}>
                  {list[0]?.sourceFileName}
                </p>
                <button
                  className="btn btn-clay btn-block"
                  data-testid="delete-source"
                  data-file-name={list[0]?.sourceFileName ?? ''}
                  data-source-id={groupId}
                  type="button"
                  onClick={() =>
                    setPending({
                      kind: 'source',
                      sourceGroupId: groupId,
                      fileName: list[0]?.sourceFileName ?? 'this PDF',
                      subjectName: subject.name,
                    })
                  }
                >
                  Delete PDF
                </button>
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
            ))}
          </section>
        );
      })}
      {drafts
        .filter((draft) => !draft.subjectId)
        .map((draft) => (
          <div key={draft.id} className="stack" data-testid="source-file" data-file-name={draft.fileName} data-source-id={draft.id}>
            <p className="muted" style={{ margin: 0 }}>
              {draft.fileName}
            </p>
            <button
              className="btn btn-clay btn-block"
              data-testid="delete-source"
              data-file-name={draft.fileName}
              data-source-id={draft.id}
              type="button"
              onClick={() =>
                setPending({
                  kind: 'source',
                  sourceGroupId: draft.id,
                  fileName: draft.fileName,
                  subjectName: 'this device',
                })
              }
            >
              Delete PDF
            </button>
            <button className="btn btn-ghost btn-block" type="button" onClick={() => navigate(`/review/${draft.id}`)}>
              {draft.fileName}: {draft.tests.length} test{draft.tests.length === 1 ? '' : 's'} waiting for review
            </button>
          </div>
        ))}
      {naming ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            onAddSubject();
          }}
        >
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span>Subject name</span>
            <input
              className="field"
              data-testid="subject-name"
              value={name}
              placeholder="Core 1, Network+, a textbook..."
              onChange={(event) => onName(event.target.value)}
            />
          </label>
          <button className="btn btn-primary btn-block" data-testid="add-subject" type="submit">
            Save subject
          </button>
        </form>
      ) : (
        <button className="btn btn-primary btn-block" data-testid="start-subject" type="button" onClick={() => onNaming(true)}>
          Start a new subject
        </button>
      )}
      {!focused && subjects.length ? (
        <p className="muted" data-testid="pick-subject-hint" style={{ margin: 0 }}>
          Choose a subject to import a PDF into it. All subjects is only a view.
        </p>
      ) : null}
      {focused ? <UploadBlock subjectName={focused.name} /> : null}
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
        </form>
      ) : null}
      {pending?.kind === 'subject' ? (
        <DestructiveConfirm
          title={`Delete ${pending.name}?`}
          body={`This permanently removes ${pending.name} and all of its questions, metrics, progress, test sessions, and source files.`}
          confirmLabel={`Delete ${pending.name}`}
          onConfirm={() => {
            const id = pending.id;
            setPending(null);
            void study.removeSubject(id);
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
      {pending?.kind === 'source' ? (
        <DestructiveConfirm
          title={`Delete ${pending.fileName}?`}
          body={`This removes ${pending.fileName} from ${pending.subjectName}, including the tests, questions, progress, and saved sessions that came from that file.`}
          confirmLabel="Delete PDF"
          onConfirm={() => {
            const sourceGroupId = pending.sourceGroupId;
            setPending(null);
            void study.removeSource(sourceGroupId);
          }}
          onCancel={() => setPending(null)}
        />
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

function UploadBlock({ subjectName }: { subjectName: string }) {
  const study = useStudy();

  return (
    <div className="stack" data-testid="import-for-subject">
      <h2>Import a PDF into {subjectName}</h2>
      <p className="muted" style={{ margin: 0 }}>
        This file is saved in {subjectName}. Text is copied from the PDF as written. Study Buddy does not write new questions.
      </p>
      <label className="btn btn-primary btn-block">
        Import a PDF
        <input
          data-testid="pdf-file"
          type="file"
          accept="application/pdf,.pdf"
          disabled={!!study.busy}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void study.importPdf(file);
          }}
        />
      </label>
    </div>
  );
}

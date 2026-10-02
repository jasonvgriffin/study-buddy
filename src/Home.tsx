import { useEffect, useRef, useState } from 'react';
import { DemandPanel, DestructiveConfirm, DrillReplacePrompt, ResetConfirm, Spinner } from './bits';
import { deckLabel, sessionDeckLabel } from './lib/deckLabel';
import { resumeButtonLabel } from './lib/resumeButton';
import { feedbackMailHref } from './lib/feedbackMail';
import { readExamDeckId, resolveDeckPick, sortDecksByName, writeExamDeckId } from './lib/examDeck';
import { formatDuration, formatPercent } from './lib/format';
import { todayProgressLine, todayRecap } from './lib/today';
import { dueCardIds } from './lib/queue';
import { resumeLabelParts } from './lib/session';
import { openHomeSessions } from './homeSessions';
import { nextHomeTab } from './homeTab';
import { navigate } from './nav';
import type { StudySnapshot } from './lib/db';
import { useStudy } from './store';
import type { Card, Deck, LiveSession, Subject } from './lib/types';
import type { TodayRecap } from './lib/today';

export function Home() {
  const study = useStudy();
  const snap = study.snap;
  const tab = study.homeTab;
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  const [examDeckId, setExamDeckId] = useState<string | null>(() => readExamDeckId());
  const [naming, setNaming] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const offerId = study.startOffer?.deckId ?? null;
  const offerNote = study.startOffer?.added ?? null;
  useEffect(() => {
    if (!offerId) return;
    const root = document.querySelector('[data-testid="start-offer"]');
    if (!(root instanceof HTMLElement)) return;
    root.scrollIntoView({ block: 'start' });
    root.querySelector<HTMLButtonElement>('[data-testid="start-saved"]')?.focus({ preventScroll: true });
  }, [offerId, offerNote]);
  if (!snap) return null;

  const now = Date.now();
  const subjects = [...snap.subjects].sort((a, b) => a.name.localeCompare(b.name));
  const inFocus = (subjectId: string) => study.focus === 'all' || study.focus === subjectId;
  const decks = sortDecksByName(snap.decks.filter((deck) => inFocus(deck.subjectId)));
  const cards = snap.cards.filter((card) => inFocus(card.subjectId));
  const due = dueCardIds(snap.cards, snap.memories, now, study.focus === 'all' ? {} : { subjectId: study.focus });
  const sessions = openHomeSessions(snap.sessions, inFocus);
  const primary = sessions[0] ?? null;
  const focused = subjects.find((subject) => subject.id === study.focus) ?? null;
  const examDeck = resolveDeckPick(decks, snap.sessions, inFocus, examDeckId);
  const recentDeck = resolveDeckPick(decks, snap.sessions, inFocus, null);
  const offerDeck = study.startOffer
    ? decks.find((deck) => deck.id === study.startOffer?.deckId) ?? null
    : null;
  const nameFor = (session: LiveSession) => sessionDeckLabel(session, snap.decks);
  const recap = todayRecap({
    reviews: snap.reviews,
    sessions: snap.sessions,
    subjects: snap.subjects,
    decks: snap.decks.map((deck) => ({ id: deck.id, name: deckLabel(deck, snap.decks) })),
    now,
    offsetMinutes: new Date().getTimezoneOffset(),
    subjectId: study.focus === 'all' ? null : study.focus,
  });

  return (
    <div className="stack">
      <header className="stack" style={{ gap: '0.3rem' }}>
        <h1>Study Buddy Beta</h1>
        <p className="muted" data-testid="tagline" style={{ margin: 0 }}>
          An experimental tool to help you study. Create a subject, upload a pdf of test questions and this tool will quiz you.
        </p>
        <p className="feedback-note" data-testid="feedback-note">
          <strong>Found a bug or have feedback?</strong> Email{' '}
          <a data-testid="feedback-mail" href={feedbackMailHref(__APP_VERSION__, __BUILD_TIME__)}>
            eve.chief_of_staff@agentmail.to
          </a>
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

      {naming ? (
        <NewSubjectPanel
          name={name}
          error={nameError}
          onName={(value) => {
            setName(value);
            setNameError(null);
          }}
          onCancel={() => setNaming(false)}
          onSave={() => {
            void study.addSubject(name).then(() => {
              setName('');
              setNameError(null);
              setNaming(false);
            }).catch((reason: unknown) => {
              setNameError(reason instanceof Error ? reason.message : 'Could not save that subject.');
            });
          }}
        />
      ) : null}

      {offerDeck ? (
        <StartOffer
          label={deckLabel(offerDeck, snap.decks)}
          added={study.startOffer?.added ?? null}
          onStart={() => void study.startExam(offerDeck, false)}
          onOrganize={() => void study.openOrganize(offerDeck.sourceGroupId)}
        />
      ) : null}

      <StudyHero
        sessions={sessions}
        nameFor={nameFor}
        now={now}
        recap={recap}
        arrival={study.homeArrival}
        startDeck={recentDeck}
        startLabel={recentDeck ? deckLabel(recentDeck, snap.decks) : null}
        emptyDetail={focused ? `Import a PDF into ${focused.name}.` : 'Name a subject, then import its PDF.'}
        emptyAction={focused ? 'Import a PDF' : 'Start a new subject'}
        onResume={(session) => {
          void study.resume(session.id);
        }}
        onStart={() => {
          if (recentDeck) void study.startExam(recentDeck, false);
          else {
            study.setHomeTab('library');
            if (!focused) {
              setNameError(null);
              setNaming(true);
            }
          }
        }}
      />

      <div className="home-tabs" role="group" aria-label="Home">
        {(
          [
            { id: 'study', label: 'Study', note: 'Continue' },
            { id: 'library', label: 'Library', note: 'Decks' },
            { id: 'stats', label: 'Stats', note: '' },
            { id: 'settings', label: 'Settings', note: 'Backup' },
          ] as const
        ).map((item) =>
          item.id === 'stats' ? (
            <button
              key="stats"
              className="home-tab"
              type="button"
              data-testid="home-tab-stats"
              onClick={() => navigate('/stats')}
            >
              Stats
            </button>
          ) : (
            <button
              key={item.id}
              className={tab === item.id ? 'home-tab on' : 'home-tab'}
              type="button"
              role="tab"
              id={`home-tab-${item.id}`}
              data-testid={`home-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={tab === item.id ? 'home-panel' : undefined}
              aria-label={item.id === 'settings' ? 'Settings and backup' : item.label}
              onClick={() => study.setHomeTab(nextHomeTab(tab, item.id))}
            >
              <span>{item.label}</span>
              <span className="home-tab-note">{item.note}</span>
            </button>
          ),
        )}
      </div>

      {tab === 'study' || tab === 'library' || tab === 'settings' ? (
        <div className="card stack home-panel" role="tabpanel" id="home-panel" aria-labelledby={`home-tab-${tab}`}>
          {tab === 'study' ? (
            <StudyPanel
              primary={primary}
              decks={decks}
              catalog={snap.decks}
              examDeck={examDeck}
              dueCount={due.length}
              onPickDeck={(id) => {
                setExamDeckId(id);
                writeExamDeckId(id);
              }}
              onLibrary={() => study.setHomeTab('library')}
              onReset={() => void study.discard()}
              onUntimed={() => {
                if (examDeck) void study.startExam(examDeck, false);
              }}
              onTimed={() => {
                if (examDeck) void study.startExam(examDeck, true);
              }}
              onDrill={async () => {
                if (!examDeck) return 'none';
                return study.startMissedDrill(examDeck, null, { holdForConfirm: true });
              }}
              onReplaceDrill={() => {
                if (examDeck) void study.startMissedDrill(examDeck, null, { replaceOpen: true });
              }}
              onReviewDue={() => {
                void study.startDueReview('Recommended Questions', {
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
              rename={rename}
              naming={naming}
              inFocus={inFocus}
              onRename={setRename}
              onNaming={(open) => {
                if (open) setNameError(null);
                setNaming(open);
              }}
              onSaveSubject={() => {
                if (focused) void study.renameSubject(focused.id, rename || focused.name);
              }}
            />
          ) : null}
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
  sessions,
  nameFor,
  now,
  recap,
  arrival,
  startDeck,
  startLabel,
  emptyDetail,
  emptyAction,
  onResume,
  onStart,
}: {
  sessions: LiveSession[];
  nameFor: (session: LiveSession) => string;
  now: number;
  recap: TodayRecap;
  arrival: { from: string; at: number } | null;
  startDeck: Deck | null;
  startLabel: string | null;
  emptyDetail: string;
  emptyAction: string;
  onResume: (session: LiveSession) => void;
  onStart: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!arrival || (arrival.from !== 'session' && arrival.from !== 'results')) return;
    if (document.querySelector('[data-testid="new-subject-panel"], [data-testid="start-offer"]')) return;
    ref.current?.scrollIntoView({ block: 'start' });
  }, [arrival]);

  if (sessions.length) {
    return (
      <article ref={ref} className="card stack home-hero" style={{ padding: '1rem' }} data-testid="resume-card">
        {sessions.map((session) => {
          const name = nameFor(session);
          return (
            <div key={session.id} className="resume-entry" data-testid="resume-entry">
              <ResumeLine session={session} now={now} name={name} />
              <button
                className="btn btn-primary btn-block home-continue"
                data-testid="resume"
                type="button"
                onClick={() => onResume(session)}
              >
                <span className="home-continue-label">{resumeButtonLabel(name)}</span>
              </button>
            </div>
          );
        })}
        {recap.answered > 0 ? (
          <p className="today-line" data-testid="today-line">
            {todayProgressLine(recap)}
          </p>
        ) : null}
      </article>
    );
  }
  const ready = !!startDeck;
  return (
    <article
      ref={ref}
      className={ready ? 'card stack home-hero home-hero-ready' : 'card stack home-hero'}
      style={{ padding: '1rem' }}
      data-testid="study-hero"
    >
      <p className="muted" style={{ margin: 0 }}>
        Start studying
      </p>
      <p style={{ margin: 0 }}>{startLabel ?? emptyDetail}</p>
      <button
        className={ready ? 'btn btn-primary btn-block btn-start' : 'btn btn-primary btn-block'}
        data-testid="start-studying"
        type="button"
        onClick={onStart}
      >
        {startDeck ? 'Start studying' : emptyAction}
      </button>
      {recap.answered > 0 ? <TodayDetails recap={recap} /> : null}
    </article>
  );
}

function ResumeLine({ session, now, name }: { session: LiveSession; now: number; name: string }) {
  const parts = resumeLabelParts(session, now);
  return (
    <p style={{ margin: 0 }}>
      {parts.lead}
      <strong className="resume-test-name" data-testid="resume-test-name">
        {name}
      </strong>
      {parts.rest}
    </p>
  );
}

function StartOffer({
  label,
  added,
  onStart,
  onOrganize,
}: {
  label: string;
  added: string | null;
  onStart: () => void;
  onOrganize: () => void;
}) {
  return (
    <section className="card stack start-offer" data-testid="start-offer" aria-label="Start studying" style={{ padding: '1rem' }}>
      {added ? (
        <p className="muted" data-testid="import-added" style={{ margin: 0 }}>
          {added}
        </p>
      ) : null}
      <p data-testid="start-offer-cue" style={{ margin: 0 }}>
        You're all set — tap Start studying to begin
      </p>
      <p className="muted" data-testid="start-offer-test" style={{ margin: 0 }}>
        {label}
      </p>
      <button className="btn btn-primary btn-block btn-start" data-testid="start-saved" type="button" onClick={onStart}>
        Start studying
      </button>
      <button className="text-link" data-testid="organize-tests" type="button" onClick={onOrganize}>
        Organize tests
      </button>
    </section>
  );
}

function TodayDetails({ recap }: { recap: TodayRecap }) {
  return (
    <div className="stack today-recap" data-testid="today-recap" aria-label="Today">
      <p className="today-line" data-testid="today-line">
        {todayProgressLine(recap)}
      </p>
      {recap.unknown > 0 ? (
        <p data-testid="today-unknown" style={{ margin: 0 }}>
          I don&apos;t know: {recap.unknown}
        </p>
      ) : null}
      <ul className="today-subjects" data-testid="today-subjects">
        {recap.subjects.map((subject) => (
          <li key={subject.subjectId}>
            <span className="today-subject">
              {subject.name} · {subject.correct} of {subject.answered} · {formatPercent(subject.accuracy)}
            </span>
            <ul className="today-tests">
              {subject.tests.map((test) => (
                <li key={test.deckId} className="muted" data-testid="today-test">
                  {test.name} · {test.correct} of {test.answered} · {formatPercent(test.accuracy)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {recap.studiedMs != null && recap.studiedMs > 0 ? (
        <p data-testid="today-time" style={{ margin: 0 }}>
          {formatDuration(recap.studiedMs)} studied
        </p>
      ) : null}
      <p data-testid="today-encouragement" style={{ margin: 0 }}>
        {recap.encouragement}
      </p>
    </div>
  );
}

function StudyPanel({
  primary,
  decks,
  catalog,
  examDeck,
  dueCount,
  onPickDeck,
  onLibrary,
  onReset,
  onUntimed,
  onTimed,
  onDrill,
  onReplaceDrill,
  onReviewDue,
}: {
  primary: LiveSession | null;
  decks: Deck[];
  catalog: Deck[];
  examDeck: Deck | null;
  dueCount: number;
  onPickDeck: (id: string) => void;
  onLibrary: () => void;
  onReset: () => void;
  onUntimed: () => void;
  onTimed: () => void;
  onDrill: () => Promise<'started' | 'none' | 'busy'>;
  onReplaceDrill: () => void;
  onReviewDue: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [drillDeckName, setDrillDeckName] = useState<string | null>(null);
  const examLabel = examDeck ? deckLabel(examDeck, catalog) : null;
  const promptName = drillDeckName && drillDeckName === examLabel ? drillDeckName : null;
  return (
    <>
      <h2>Study</h2>
      {primary ? (
        <button className="btn btn-ghost btn-block" data-testid="discard" type="button" onClick={() => setConfirmReset(true)}>
          Discard and start over
        </button>
      ) : null}
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
            <span className="test-picker">
              <span className="test-picker-value" data-testid="exam-deck-label" aria-hidden="true">
                {examLabel ?? ''}
              </span>
              <select
                className="field"
                data-testid="exam-deck"
                value={examDeck?.id ?? ''}
                onChange={(event) => {
                  setDrillDeckName(null);
                  onPickDeck(event.target.value);
                }}
              >
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deckLabel(deck, catalog)}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <button className="btn btn-primary btn-block" data-testid="practice-exam" type="button" onClick={onUntimed}>
            Practice exam
          </button>
          <button className="btn btn-ghost btn-block" data-testid="start-timed-home" type="button" onClick={onTimed}>
            90-minute exam
          </button>
          <button
            className="btn btn-ghost btn-block"
            data-testid="drill-home"
            type="button"
            onClick={() => {
              void onDrill().then((result) => {
                setDrillDeckName(result === 'busy' && examLabel ? examLabel : null);
              });
            }}
          >
            Drill missed cards
          </button>
          {promptName ? (
            <DrillReplacePrompt
              deckName={promptName}
              onStart={() => {
                setDrillDeckName(null);
                onReplaceDrill();
              }}
              onCancel={() => setDrillDeckName(null)}
            />
          ) : null}
          <button className="btn btn-ghost btn-block" data-testid="review-due-home" type="button" onClick={onReviewDue}>
            Recommended Questions{dueCount ? ` (${dueCount})` : ''}
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

function NewSubjectPanel({
  name,
  error,
  onName,
  onCancel,
  onSave,
}: {
  name: string;
  error: string | null;
  onName: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <DemandPanel title="Start a new subject" testId="new-subject-panel" onCancel={onCancel}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
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
        {error ? <p role="alert">{error}</p> : null}
        <button className="btn btn-primary btn-block" data-testid="add-subject" type="submit">
          Save subject
        </button>
      </form>
    </DemandPanel>
  );
}

function LibraryPanel({
  snap,
  decks,
  cards,
  subjects,
  focused,
  rename,
  naming,
  inFocus,
  onRename,
  onNaming,
  onSaveSubject,
}: {
  snap: StudySnapshot;
  decks: Deck[];
  cards: Card[];
  subjects: Subject[];
  focused: Subject | null;
  rename: string;
  naming: boolean;
  inFocus: (subjectId: string) => boolean;
  onRename: (value: string) => void;
  onNaming: (naming: boolean) => void;
  onSaveSubject: () => void;
}) {
  const study = useStudy();
  const [pending, setPending] = useState<LibraryConfirm | null>(null);
  const visibleSubjects = subjects.filter((subject) => inFocus(subject.id));
  const drafts = snap.drafts.filter(
    (draft) => !draft.fromSourceGroupId && (!draft.subjectId || inFocus(draft.subjectId)),
  );

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
              Delete {subject.name} and all its PDFs
            </button>
            {!subjectDecks.length && !subjectDrafts.length ? (
              <p className="muted" style={{ margin: 0 }}>
                No tests in this subject yet. Upload a PDF and the tests are saved here.
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
                  Delete this PDF only
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
                  className="text-link"
                  data-testid="organize-tests"
                  data-source-id={groupId}
                  type="button"
                  onClick={() => void study.openOrganize(groupId)}
                >
                  Organize tests
                </button>
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
                  Delete this PDF only
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
                      <strong>{deckLabel(deck, snap.decks)}</strong>
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
              Delete this PDF only
            </button>
            <button className="btn btn-ghost btn-block" type="button" onClick={() => navigate(`/review/${draft.id}`)}>
              {draft.fileName}: {draft.tests.length} test{draft.tests.length === 1 ? '' : 's'} waiting for review
            </button>
          </div>
        ))}
      {naming ? null : (
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
          confirmLabel={`Delete ${pending.name} and all its PDFs`}
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
          confirmLabel="Delete this PDF only"
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
  const statusRef = useRef<HTMLParagraphElement>(null);
  const statusText = study.busy || study.message;
  useEffect(() => {
    if (!statusText) return;
    if (document.querySelector('[data-testid="start-offer"]')) return;
    statusRef.current?.scrollIntoView({ block: 'center' });
  }, [statusText]);
  const toneClass = study.busy
    ? 'upload-status'
    : study.messageTone === 'error'
      ? 'banner-error'
      : study.messageTone === 'success'
        ? 'banner-success'
        : '';

  return (
    <div className="stack" data-testid="import-for-subject">
      <h2>Import a PDF into {subjectName}</h2>
      <p className="muted" style={{ margin: 0 }}>
        This file is saved in {subjectName}. Text is copied from the PDF as written. Study Buddy does not write new questions.
      </p>
      <label className={study.busy ? 'btn btn-primary btn-block is-disabled' : 'btn btn-primary btn-block'} aria-disabled={study.busy ? true : undefined}>
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
      {statusText ? (
        <p ref={statusRef} className={`banner ${toneClass}`} data-testid="import-status" aria-hidden="true">
          {study.busy ? <Spinner /> : null}
          {statusText}
        </p>
      ) : null}
    </div>
  );
}

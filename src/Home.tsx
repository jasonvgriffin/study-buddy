import { useState } from 'react';
import { dueCardIds } from './lib/queue';
import { studyRecommendations } from './lib/areas';
import { resumeLabel } from './lib/session';
import { useStudy } from './store';
import { navigate } from './nav';

export function Home() {
  const study = useStudy();
  const snap = study.snap;
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  if (!snap) return null;
  const now = Date.now();
  const subjects = [...snap.subjects].sort((a, b) => a.name.localeCompare(b.name));
  const inFocus = (subjectId: string) => study.focus === 'all' || study.focus === subjectId;
  const decks = snap.decks.filter((deck) => inFocus(deck.subjectId));
  const cards = snap.cards.filter((card) => inFocus(card.subjectId));
  const due = dueCardIds(
    snap.cards,
    snap.memories,
    now,
    study.focus === 'all' ? {} : { subjectId: study.focus },
  );
  const sessions = snap.sessions.filter(
    (session) => session.status !== 'finished' && inFocus(session.subjectId),
  );
  const recommendations = studyRecommendations(
    snap.subjects,
    snap.decks,
    snap.cards,
    snap.reviews,
    snap.memories,
    study.focus,
    now,
  ).slice(0, 6);
  const groups = new Map<string, typeof decks>();
  for (const deck of [...decks].sort((a, b) => a.name.localeCompare(b.name))) {
    const list = groups.get(deck.sourceGroupId) ?? [];
    list.push(deck);
    groups.set(deck.sourceGroupId, list);
  }
  const focused = subjects.find((subject) => subject.id === study.focus) ?? null;

  return (
    <div className="stack">
      <header className="stack" style={{ gap: '0.3rem' }}>
        <h1>Study Buddy</h1>
        <p className="muted" style={{ margin: 0 }}>
          Your PDFs, as flashcards. Questions come only from files you add.
        </p>
      </header>

      <div className="row-scroll" role="tablist" aria-label="Subjects">
        <button
          className={study.focus === 'all' ? 'chip on' : 'chip'}
          type="button"
          onClick={() => study.setFocus('all')}
        >
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

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void study.addSubject(name).then(() => setName(''));
        }}
      >
        <label className="stack" style={{ gap: '0.35rem' }}>
          <span>New subject</span>
          <input
            className="field"
            data-testid="subject-name"
            value={name}
            placeholder="Core 1, Network+, a textbook..."
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button className="btn btn-primary" data-testid="add-subject" type="submit">
          Add subject
        </button>
      </form>

      {focused ? (
        <form
          className="card stack"
          style={{ padding: '0.9rem' }}
          onSubmit={(event) => {
            event.preventDefault();
            void study.renameSubject(focused.id, rename || focused.name);
          }}
        >
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span>Rename {focused.name}</span>
            <input
              className="field"
              value={rename || focused.name}
              onChange={(event) => setRename(event.target.value)}
            />
          </label>
          <button className="btn btn-ghost" type="submit">
            Save name
          </button>
          <button
            className="btn btn-clay"
            type="button"
            onClick={() => {
              if (window.confirm(`Delete ${focused.name} and every test inside it?`)) {
                void study.removeSubject(focused.id);
              }
            }}
          >
            Delete subject
          </button>
        </form>
      ) : null}

      <section className="card stack" style={{ padding: '1rem' }}>
        <h2>{due.length ? `${due.length} due for review` : 'Nothing due yet'}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {due.length
            ? 'Due cards can come from more than one test. A practice exam still stays inside one test.'
            : 'A card is due only after you have answered it and its review time arrives. A miss is due right away.'}
        </p>
        <button
          className="btn btn-primary"
          type="button"
          data-testid="review-due-home"
          onClick={() => {
            void study.startDueReview(study.focus === 'all' ? 'Due for review' : 'Due in this subject', {
              subjectId: study.focus === 'all' ? null : study.focus,
              scopeKey: `review:home:${study.focus}`,
            });
          }}
        >
          Review due cards
        </button>
      </section>

      {sessions.length ? (
        <section className="stack">
          <h2>In progress</h2>
          {sessions.map((session) => (
            <article key={session.id} className="card stack" style={{ padding: '0.9rem' }} data-testid="resume-card">
              <p style={{ margin: 0 }}>{resumeLabel(session, now)}</p>
              <button className="btn btn-primary" data-testid="resume" type="button" onClick={() => void study.resume(session.id)}>
                Resume
              </button>
              <button
                className="btn btn-ghost"
                data-testid="discard"
                type="button"
                onClick={() => void study.discard(session.id)}
              >
                Discard and start over
              </button>
            </article>
          ))}
        </section>
      ) : null}

      {recommendations.length ? (
        <section className="stack">
          <h2>What to study next</h2>
          {recommendations.map((item) => (
            <article key={item.id} className="card stack" style={{ padding: '0.9rem' }}>
              <p style={{ margin: 0 }}>{item.text}</p>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void study.startRecommendation(item)}
              >
                Study this
              </button>
            </article>
          ))}
        </section>
      ) : null}

      <UploadBlock />

      {snap.drafts.filter((draft) => inFocus(draft.subjectId ?? '')).length ? (
        <section className="stack">
          <h2>Waiting for review</h2>
          {snap.drafts
            .filter((draft) => !draft.subjectId || inFocus(draft.subjectId))
            .map((draft) => (
              <button
                key={draft.id}
                className="btn btn-ghost btn-block"
                type="button"
                onClick={() => navigate(`/review/${draft.id}`)}
              >
                {draft.fileName}: {draft.tests.length} test{draft.tests.length === 1 ? '' : 's'}
              </button>
            ))}
        </section>
      ) : null}

      <section className="stack">
        <h2>Tests</h2>
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
      </section>
    </div>
  );
}

function UploadBlock() {
  const study = useStudy();
  const snap = study.snap;
  const needsSubject = study.focus === 'all' || !snap?.subjects.some((subject) => subject.id === study.focus);

  return (
    <section className="card stack" style={{ padding: '1rem' }}>
      <h2>Add a PDF</h2>
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
    </section>
  );
}

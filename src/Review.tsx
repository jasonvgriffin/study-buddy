import { useEffect, useState } from 'react';
import { figuresForDraftCapture } from './lib/db';
import { mergeWithPrevious, renameSection, renameTest, splitAt, updateParsedCard } from './lib/draft';
import type { ImportDraft } from './lib/types';
import { navigate } from './nav';
import { Screen } from './bits';
import { useStudy } from './store';

export function ReviewScreen({ draftId }: { draftId: string }) {
  const study = useStudy();
  const draft = study.snap?.drafts.find((item) => item.id === draftId) ?? null;
  const [testIndex, setTestIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [replaceOld, setReplaceOld] = useState(true);
  if (!draft) {
    return (
      <Screen title="Review" onBack={() => navigate('/')}>
        <p>That import is no longer on this device.</p>
      </Screen>
    );
  }
  const test = draft.tests[Math.min(testIndex, draft.tests.length - 1)];
  const card = test?.cards[Math.min(cardIndex, (test?.cards.length ?? 1) - 1)];

  const commit = (next: ImportDraft) => {
    void study.writeDraft(next);
  };
  const earlierDecks = (study.snap?.decks ?? []).filter(
    (deck) => deck.subjectId === draft.subjectId && deck.sourceFileName === draft.fileName,
  );
  const save = () =>
    void study.saveDraftTests(draft, { replaceDeckIds: replaceOld ? earlierDecks.map((deck) => deck.id) : [] });

  return (
    <Screen
      title="Check the tests"
      lede={`${draft.fileName}. Each test becomes its own deck. A later quiz uses one test at a time.`}
      onBack={() => navigate('/')}
    >
      <p className="banner" data-testid="review-notice" style={{ margin: 0 }}>
        This is the import check, not the quiz. Answers stay hidden here unless you tap Show answer. Save the tests,
        then open one and tap Start to study.
      </p>
      {earlierDecks.length ? (
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="checkbox"
            data-testid="replace-old"
            checked={replaceOld}
            onChange={(event) => setReplaceOld(event.target.checked)}
          />
          <span>
            Replace the {earlierDecks.length} earlier test{earlierDecks.length === 1 ? '' : 's'} from {draft.fileName} (their
            answers and paused sessions are removed)
          </span>
        </label>
      ) : null}
      <button className="btn btn-primary btn-block" data-testid="save-tests-top" type="button" onClick={save}>
        Save {draft.tests.length} test{draft.tests.length === 1 ? '' : 's'}
      </button>
      {draft.domains.length ? (
        <p className="muted" style={{ margin: 0 }}>
          Domains in this PDF:{' '}
          {draft.domains
            .map((domain) =>
              domain.weight == null ? domain.name : `${domain.name} (${Math.round(domain.weight * 100)}%)`,
            )
            .join(', ')}
        </p>
      ) : null}
      <div className="row-scroll">
        {draft.tests.map((item, index) => (
          <button
            key={`${item.name}-${index}`}
            className={index === testIndex ? 'chip on' : 'chip'}
            type="button"
            onClick={() => {
              setTestIndex(index);
              setCardIndex(0);
            }}
          >
            {item.name} ({item.cards.length})
          </button>
        ))}
      </div>
      {test ? (
        <label className="stack" style={{ gap: '0.35rem' }}>
          <span>Test name</span>
          <input
            className="field"
            data-testid="test-name"
            value={test.name}
            onChange={(event) =>
              commit({ ...draft, tests: renameTest(draft.tests, testIndex, event.target.value) })
            }
          />
        </label>
      ) : null}
      <div className="stack">
        <button
          className="btn btn-ghost"
          type="button"
          disabled={testIndex === 0}
          onClick={() => {
            commit({ ...draft, tests: mergeWithPrevious(draft.tests, testIndex) });
            setTestIndex(Math.max(0, testIndex - 1));
            setCardIndex(0);
          }}
        >
          Merge with previous test
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={!test || cardIndex <= 0}
          onClick={() => {
            commit({ ...draft, tests: splitAt(draft.tests, testIndex, cardIndex) });
          }}
        >
          Split this test at the selected card
        </button>
      </div>
      {test ? (
        <div className="row-scroll">
          {test.cards.map((item, index) => (
            <button
              key={`${item.sourceLabel}-${index}`}
              className={index === cardIndex ? 'chip on' : 'chip'}
              type="button"
              onClick={() => setCardIndex(index)}
            >
              {item.sourceLabel || index + 1}
            </button>
          ))}
        </div>
      ) : null}
      {test && card ? (
        <CardEditor
          key={`${testIndex}:${cardIndex}`}
          draft={draft}
          testIndex={testIndex}
          cardIndex={cardIndex}
          onChange={commit}
        />
      ) : null}
      <button className="btn btn-primary btn-block" data-testid="save-tests" type="button" onClick={save}>
        Save {draft.tests.length} test{draft.tests.length === 1 ? '' : 's'}
      </button>
      <button className="btn btn-ghost btn-block" type="button" onClick={() => void study.dropDraft(draft.id)}>
        Discard this import
      </button>
    </Screen>
  );
}

function CardEditor({
  draft,
  testIndex,
  cardIndex,
  onChange,
}: {
  draft: ImportDraft;
  testIndex: number;
  cardIndex: number;
  onChange: (draft: ImportDraft) => void;
}) {
  const test = draft.tests[testIndex];
  const card = test.cards[cardIndex];
  const startKey = `${testIndex}:${cardIndex}`;
  const [showAnswer, setShowAnswer] = useState(false);
  const [figureUrls, setFigureUrls] = useState<string[]>([]);
  const captureId = card.captureId ?? null;
  useEffect(() => {
    if (!captureId) return;
    let live = true;
    const urls: string[] = [];
    void figuresForDraftCapture(draft.id, captureId).then((rows) => {
      if (!live) return;
      for (const row of rows) if (row.role === 'question') urls.push(URL.createObjectURL(row.png));
      setFigureUrls(urls);
    });
    return () => {
      live = false;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [draft.id, captureId]);
  const start = draft.videoStarts?.[startKey];
  const patch = (partial: Partial<typeof card>) => {
    onChange({
      ...draft,
      tests: draft.tests.map((item, index) =>
        index === testIndex ? updateParsedCard(item, cardIndex, partial) : item,
      ),
    });
  };
  return (
    <div className="card stack" style={{ padding: '0.9rem' }}>
      <p className="question" style={{ margin: 0 }}>
        {card.question}
      </p>
      {card.choices.length ? (
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {card.choices.map((choice) => (
            <li key={choice.label}>
              {choice.label}. {choice.text}
            </li>
          ))}
        </ul>
      ) : null}
      {figureUrls.map((src) => (
        <img key={src} className="figure-img" data-testid="review-figure" src={src} alt="Figure from your PDF" />
      ))}
      <button
        className="btn btn-ghost btn-block"
        data-testid="review-show-answer"
        type="button"
        aria-expanded={showAnswer}
        onClick={() => setShowAnswer((value) => !value)}
      >
        {showAnswer ? 'Hide answer and explanation' : 'Show answer and explanation (spoiler)'}
      </button>
      {showAnswer ? (
        <>
          <p style={{ margin: 0 }} data-testid="review-answer">
            <strong>Answer from the PDF: </strong>
            {card.answer || card.correctLabels.join(', ') || 'None found'}
          </p>
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span>Explanation</span>
            <textarea
              className="field"
              data-testid="review-explanation"
              rows={4}
              value={card.explanation ?? ''}
              placeholder="No explanation provided in your PDF."
              onChange={(event) => patch({ explanation: event.target.value.trim() ? event.target.value : null })}
            />
          </label>
        </>
      ) : null}
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Section</span>
        <input
          className="field"
          value={card.section ?? ''}
          onChange={(event) => patch({ section: event.target.value.trim() || null })}
        />
      </label>
      {card.section ? (
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => {
            const next = window.prompt('Rename this section for every card in the test', card.section ?? '');
            if (next == null || !card.section) return;
            onChange({
              ...draft,
              tests: draft.tests.map((item, index) =>
                index === testIndex ? renameSection(item, card.section as string, next) : item,
              ),
            });
          }}
        >
          Rename this section in the whole test
        </button>
      ) : null}
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Lesson link</span>
        <input
          className="field"
          value={card.lessonUrl ?? ''}
          placeholder="Only if the PDF included one"
          onChange={(event) => patch({ lessonUrl: event.target.value.trim() || null })}
        />
      </label>
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Video start (seconds, optional)</span>
        <input
          className="field"
          inputMode="numeric"
          value={start ?? ''}
          placeholder="Leave blank to start at 0:00"
          onChange={(event) => {
            const raw = event.target.value.trim();
            const videoStarts = { ...(draft.videoStarts ?? {}) };
            videoStarts[startKey] = raw ? Number(raw) : null;
            onChange({ ...draft, videoStarts });
          }}
        />
      </label>
    </div>
  );
}

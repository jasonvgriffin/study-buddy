import { PbqAnswerList } from './PbqAnswers';
import { useEffect, useState } from 'react';
import { figuresForDraftCapture } from './lib/db';
import { MISSING_EXPLANATION } from './lib/format';
import { mergeWithPrevious, moveTest, renameSection, renameTest, splitAt, updateParsedCard } from './lib/draft';
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
  const organizing = Boolean(draft.fromSourceGroupId);
  const earlierDecks = draft.replacesDeckIds?.length
    ? (study.snap?.decks ?? []).filter((deck) => draft.replacesDeckIds?.includes(deck.id))
    : (study.snap?.decks ?? []).filter(
        (deck) => deck.subjectId === draft.subjectId && deck.sourceFileName === draft.fileName,
      );
  const save = () =>
    void study.saveDraftTests(draft, { replaceDeckIds: replaceOld || organizing ? earlierDecks.map((deck) => deck.id) : [] });
  const shiftTest = (direction: -1 | 1) => {
    const moved = moveTest(draft.tests, draft.videoStarts, testIndex, direction);
    commit({ ...draft, tests: moved.tests, videoStarts: moved.videoStarts });
    setTestIndex(Math.max(0, testIndex + direction));
  };

  return (
    <Screen
      title={organizing ? 'Organize tests' : 'Check the tests'}
      lede={
        organizing
          ? `${draft.fileName}. These tests are already saved. Start studying does not need this step.`
          : `${draft.fileName}. Each test becomes its own deck. A later quiz uses one test at a time.`
      }
      onBack={() => navigate('/')}
    >
      <p className="banner" data-testid="review-notice" style={{ margin: 0 }}>
        {organizing
          ? 'Optional. Rename, merge, split, or reorder, then save if you want those changes. Answers stay hidden unless you tap Show answer.'
          : 'This is the import check, not the quiz. Answers stay hidden here unless you tap Show answer. Save the tests, then open one and tap Start to study.'}
      </p>
      {earlierDecks.length && !organizing ? (
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
      <button className="btn btn-primary btn-block" data-testid="save-tests-top" type="button" disabled={!!study.busy} onClick={save}>
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
      <div className="chip-row" data-testid="test-chip-row">
        {draft.tests.map((item, index) => (
          <button
            key={`${item.name}-${index}`}
            className={index === testIndex ? 'chip chip-name on' : 'chip chip-name'}
            type="button"
            data-testid="test-chip"
            aria-pressed={index === testIndex}
            onClick={() => {
              setTestIndex(index);
              setCardIndex(0);
            }}
          >
            {index + 1}. {item.name} ({item.cards.length})
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
          data-testid="move-test-earlier"
          disabled={testIndex === 0}
          onClick={() => shiftTest(-1)}
        >
          Move test earlier
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          data-testid="move-test-later"
          disabled={!test || testIndex >= draft.tests.length - 1}
          onClick={() => shiftTest(1)}
        >
          Move test later
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
        <div className="chip-row" data-testid="card-chip-row">
          {test.cards.map((item, index) => (
            <button
              key={`${item.sourceLabel}-${index}`}
              className={index === cardIndex ? 'chip chip-token on' : 'chip chip-token'}
              type="button"
              data-testid="card-chip"
              aria-pressed={index === cardIndex}
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
      <button className="btn btn-primary btn-block" data-testid="save-tests" type="button" disabled={!!study.busy} onClick={save}>
        Save {draft.tests.length} test{draft.tests.length === 1 ? '' : 's'}
      </button>
      <button className="btn btn-ghost btn-block" type="button" onClick={() => void study.dropDraft(draft.id)}>
        {organizing ? 'Discard changes' : 'Discard this import'}
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
  const [itemUrls, setItemUrls] = useState<Map<string, string>>(() => new Map());
  const captureId = card.captureId ?? null;
  useEffect(() => {
    if (!captureId) return;
    let live = true;
    const urls: string[] = [];
    void figuresForDraftCapture(draft.id, captureId).then((rows) => {
      if (!live) return;
      const main: string[] = [];
      const items = new Map<string, string>();
      for (const row of rows) {
        if (row.role !== 'question') continue;
        const url = URL.createObjectURL(row.png);
        urls.push(url);
        if (row.itemId) items.set(row.itemId, url);
        else main.push(url);
      }
      setFigureUrls(main);
      setItemUrls(items);
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
      {card.pbq && itemUrls.size ? (
        <div className="pbq-thumbs" data-testid="review-item-figures">
          {card.pbq.items.map((item) =>
            itemUrls.get(item.id) ? (
              <figure key={item.id} className="pbq-thumb-cell">
                <img className="figure-img" data-testid="review-figure" src={itemUrls.get(item.id)} alt={`${item.prompt} from your PDF`} />
                <figcaption>{item.prompt}</figcaption>
              </figure>
            ) : null,
          )}
        </div>
      ) : null}
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
          {card.pbq ? (
            <PbqAnswerList task={card.pbq} explanation={card.explanation} itemFigures={itemUrls} />
          ) : (
            <p style={{ margin: 0 }} data-testid="review-answer">
              <strong>Answer from the PDF: </strong>
              {card.answer || card.correctLabels.join(', ') || 'None found'}
            </p>
          )}
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span>Explanation</span>
            <textarea
              className="field"
              data-testid="review-explanation"
              rows={4}
              value={card.explanation ?? ''}
              placeholder={MISSING_EXPLANATION}
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

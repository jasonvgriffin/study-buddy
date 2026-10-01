import { useState } from 'react';
import { correctOrder, gradePbq } from './lib/pbq';
import type { PbqTask } from './lib/types';

export type PbqExplanations = { perItem: Map<string, string>; shared: string | null };

function controlLabel(title: string, count: number, kind: 'select' | 'text'): string {
  if (title) return title;
  if (count > 1) return 'Answer';
  return kind === 'select' ? 'Your choice' : 'Your answer';
}

export function PbqForm({
  task,
  paused,
  pending,
  revealed,
  onSubmit,
  itemFigures,
  explanations,
  onZoom,
}: {
  task: PbqTask;
  paused: boolean;
  pending: boolean;
  revealed: boolean;
  onSubmit: (correct: boolean, chosen: string[]) => void;
  itemFigures?: Map<string, string>;
  explanations?: PbqExplanations;
  onZoom?: (src: string) => void;
}) {
  const [values, setValues] = useState<string[][]>(() => task.items.map((item) => item.controls.map(() => '')));
  const [typing, setTyping] = useState<Set<string>>(() => new Set());
  const [order, setOrder] = useState<string[]>(() => task.items.map((item) => item.id));
  const grade = gradePbq(task, values, order);
  const ordered = order
    .map((id) => task.items.find((item) => item.id === id))
    .filter((item): item is PbqTask['items'][number] => !!item);
  const rows = task.grade === 'order' ? ordered : task.items;
  const locked = revealed || paused || pending;
  const parts = grade.items.flatMap((item) => item.controls);
  const partsRight = parts.filter((part) => part.correct).length;

  const move = (index: number, direction: -1 | 1) => {
    setOrder((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const swap = next[target];
      const here = next[index];
      if (swap == null || here == null) return current;
      next[index] = swap;
      next[target] = here;
      return next;
    });
  };

  const setValue = (itemIndex: number, controlIndex: number, value: string) => {
    setValues((current) =>
      current.map((row, rowIndex) =>
        rowIndex === itemIndex ? row.map((old, valueIndex) => (valueIndex === controlIndex ? value : old)) : row,
      ),
    );
  };

  return (
    <div className="stack" data-testid="pbq-form" data-format={task.format}>
      {revealed ? (
        <p className="pbq-score" data-testid="pbq-score">
          {partsRight} of {parts.length} parts correct
        </p>
      ) : null}
      {rows.map((item, index) => {
        const itemIndex = task.items.findIndex((entry) => entry.id === item.id);
        const result = revealed ? grade.items.find((entry) => entry.id === item.id) ?? null : null;
        const figure = itemFigures?.get(item.id);
        const note = revealed ? explanations?.perItem.get(item.id) : undefined;
        return (
          <section
            key={item.id}
            className={`pbq-item${result ? (result.correct ? ' is-right' : ' is-wrong') : ''}`}
            data-testid="pbq-item"
            data-item={item.id}
          >
            <div className="pbq-item-head">
              <h3 className="pbq-item-title">{task.grade === 'order' ? `${index + 1}. ${item.prompt}` : item.prompt}</h3>
              {result ? (
                <span data-testid="pbq-item-result" className={result.correct ? 'result-correct' : 'result-wrong'}>
                  <span className="result-icon" aria-hidden="true">
                    {result.correct ? '✓' : '✗'}
                  </span>{' '}
                  {result.correct ? 'Correct' : 'Incorrect'}
                </span>
              ) : null}
            </div>
            {figure ? (
              <button
                className="pbq-thumb"
                type="button"
                data-testid="pbq-item-figure"
                aria-label={`Enlarge ${item.prompt}`}
                onClick={() => onZoom?.(figure)}
              >
                <img src={figure} alt={`${item.prompt} from your PDF`} />
              </button>
            ) : null}
            {task.grade === 'order' ? (
              <div className="pbq-row">
                <button
                  className="btn btn-ghost"
                  data-testid="pbq-up"
                  type="button"
                  aria-label={`Move ${item.prompt} up`}
                  disabled={locked || index === 0}
                  onClick={() => move(index, -1)}
                >
                  Up
                </button>
                <button
                  className="btn btn-ghost"
                  data-testid="pbq-down"
                  type="button"
                  aria-label={`Move ${item.prompt} down`}
                  disabled={locked || index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
              </div>
            ) : null}
            {task.grade !== 'order'
              ? item.controls.map((control, controlIndex) => {
                  const key = `${item.id}-${controlIndex}`;
                  const value = values[itemIndex]?.[controlIndex] ?? '';
                  const label = controlLabel(control.title, item.controls.length, control.kind);
                  const typed = control.kind === 'text' || typing.has(key) || control.options.length === 0;
                  const part = result?.controls[controlIndex];
                  return (
                    <div key={key} className="pbq-control">
                      <label className="stack" style={{ gap: '0.25rem' }}>
                        <span className="pbq-control-label">
                          {label}
                          <span className="sr-only"> for {item.prompt}</span>
                        </span>
                        {typed ? (
                          <input
                            className="field"
                            data-testid="pbq-text"
                            data-control={controlIndex}
                            value={value}
                            autoCapitalize="off"
                            autoComplete="off"
                            placeholder="Type your answer"
                            disabled={locked}
                            onChange={(event) => setValue(itemIndex, controlIndex, event.target.value)}
                          />
                        ) : (
                          <select
                            className="field"
                            data-testid="pbq-select"
                            data-control={controlIndex}
                            value={value}
                            disabled={locked}
                            onChange={(event) => setValue(itemIndex, controlIndex, event.target.value)}
                          >
                            <option value="">Choose…</option>
                            {control.options.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        )}
                      </label>
                      {control.kind === 'select' && control.options.length && !locked ? (
                        <button
                          className="link-button"
                          type="button"
                          data-testid="pbq-type-toggle"
                          onClick={() =>
                            setTyping((current) => {
                              const next = new Set(current);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                        >
                          {typed ? 'Pick from the list instead' : 'Type instead'}
                        </button>
                      ) : null}
                      {part ? (
                        <p className="pbq-part" data-testid="pbq-control-result" data-correct={part.correct ? 'yes' : 'no'}>
                          <span className={part.correct ? 'result-correct' : 'result-wrong'}>
                            {part.correct ? '✓' : '✗'}
                          </span>{' '}
                          <span>Your answer: {part.given || '(blank)'}</span>
                          <br />
                          <span data-testid="correct-answer">Correct: {part.expected || '(not found in your PDF)'}</span>
                        </p>
                      ) : null}
                    </div>
                  );
                })
              : null}
            {task.grade === 'order' && result ? (
              <p className="pbq-part" data-testid="pbq-control-result" data-correct={result.correct ? 'yes' : 'no'}>
                <span className={result.correct ? 'result-correct' : 'result-wrong'}>{result.correct ? '✓' : '✗'}</span>{' '}
                Your position: {result.controls[0]?.given} · <span data-testid="correct-answer">Correct: {result.controls[0]?.expected}</span>
              </p>
            ) : null}
            {note ? (
              <p className="pbq-note" data-testid="item-explanation">
                {note}
              </p>
            ) : null}
          </section>
        );
      })}
      {revealed && task.grade === 'order' ? (
        <div className="stack">
          <p style={{ margin: 0 }}>
            <strong>Correct order</strong>
          </p>
          <ol data-testid="correct-order">
            {correctOrder(task).map((item) => (
              <li key={item.id}>{item.prompt}</li>
            ))}
          </ol>
        </div>
      ) : null}
      {revealed && explanations && !explanations.perItem.size && explanations.shared ? (
        <div className="card stack">
          <p className="muted" style={{ margin: 0 }}>
            Explanation from your PDF
          </p>
          <p data-testid="explanation" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {explanations.shared}
          </p>
        </div>
      ) : null}
      {!revealed ? (
        <button
          className="btn btn-primary btn-block"
          data-testid={task.format === 'free' ? 'show-answer' : 'submit'}
          type="button"
          disabled={paused || pending}
          onClick={() => onSubmit(grade.correct, values.flat().filter(Boolean))}
        >
          {task.format === 'free' ? 'Show answer' : 'Submit'}
        </button>
      ) : null}
    </div>
  );
}

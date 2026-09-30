import { useState } from 'react';
import { correctOrder, gradePbq } from './lib/pbq';
import type { PbqTask } from './lib/types';

export function PbqForm({
  task,
  paused,
  pending,
  revealed,
  onSubmit,
}: {
  task: PbqTask;
  paused: boolean;
  pending: boolean;
  revealed: boolean;
  onSubmit: (correct: boolean, chosen: string[]) => void;
}) {
  const [values, setValues] = useState<string[][]>(() => task.items.map((item) => item.controls.map(() => '')));
  const [order, setOrder] = useState<string[]>(() => task.items.map((item) => item.id));
  const grade = gradePbq(task, values, order);
  const ordered = order
    .map((id) => task.items.find((item) => item.id === id))
    .filter((item): item is PbqTask['items'][number] => !!item);
  const rows = task.grade === 'order' ? ordered : task.items;

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

  return (
    <div className="stack" data-testid="pbq-form" data-format={task.format}>
      {rows.map((item, index) => {
        const result = revealed ? grade.items.find((entry) => entry.id === item.id) : null;
        return (
          <div key={item.id} className="stack" style={{ gap: '0.4rem' }}>
            <p style={{ margin: 0 }}>
              <strong>{item.prompt}</strong>
            </p>
            {task.grade === 'order' ? (
              <div className="pbq-row">
                <button
                  className="btn btn-ghost"
                  data-testid="pbq-up"
                  type="button"
                  disabled={revealed || paused || pending || index === 0}
                  onClick={() => move(index, -1)}
                >
                  Up
                </button>
                <button
                  className="btn btn-ghost"
                  data-testid="pbq-down"
                  type="button"
                  disabled={revealed || paused || pending || index === rows.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
              </div>
            ) : null}
            {item.controls.map((control, controlIndex) =>
              control.kind === 'select' ? (
                <label key={`${item.id}-${controlIndex}`} className="stack" style={{ gap: '0.25rem' }}>
                  {control.title ? <span className="muted">{control.title}</span> : null}
                  <select
                    className="field"
                    data-testid="pbq-select"
                    value={values[task.items.findIndex((entry) => entry.id === item.id)]?.[controlIndex] ?? ''}
                    disabled={revealed || paused || pending}
                    onChange={(event) => {
                      const itemIndex = task.items.findIndex((entry) => entry.id === item.id);
                      setValues((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === itemIndex
                            ? row.map((value, valueIndex) => (valueIndex === controlIndex ? event.target.value : value))
                            : row,
                        ),
                      );
                    }}
                  >
                    <option value="">Choose</option>
                    {control.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label key={`${item.id}-${controlIndex}`} className="stack" style={{ gap: '0.25rem' }}>
                  {control.title ? <span className="muted">{control.title}</span> : null}
                  <input
                    className="field"
                    data-testid="pbq-text"
                    value={values[task.items.findIndex((entry) => entry.id === item.id)]?.[controlIndex] ?? ''}
                    disabled={revealed || paused || pending}
                    onChange={(event) => {
                      const itemIndex = task.items.findIndex((entry) => entry.id === item.id);
                      setValues((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === itemIndex
                            ? row.map((value, valueIndex) => (valueIndex === controlIndex ? event.target.value : value))
                            : row,
                        ),
                      );
                    }}
                  />
                </label>
              ),
            )}
            {result ? (
              <p style={{ margin: 0 }}>
                <span data-testid="pbq-item-result" className={result.correct ? 'result-correct' : 'result-wrong'}>
                  {result.correct ? 'Correct' : 'Incorrect'}
                </span>
                {task.grade === 'order' ? null : <span data-testid="correct-answer"> {result.expected}</span>}
              </p>
            ) : null}
          </div>
        );
      })}
      {revealed && task.grade === 'order' ? (
        <div className="stack">
          <p style={{ margin: 0 }}>
            <strong>Correct order</strong>
          </p>
          <ol>
            {correctOrder(task).map((item) => (
              <li key={item.id} data-testid="correct-answer">
                {item.prompt}
              </li>
            ))}
          </ol>
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

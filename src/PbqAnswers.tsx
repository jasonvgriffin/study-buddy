import { itemExplanations, pbqAnswerLines } from './lib/pbq';
import type { PbqTask } from './lib/types';

/** Every sub-item's answer (and its explanation, when the PDF has one) for review screens. */
export function PbqAnswerList({
  task,
  explanation,
  itemFigures,
}: {
  task: PbqTask;
  explanation: string | null;
  itemFigures?: Map<string, string>;
}) {
  const lines = pbqAnswerLines(task);
  const notes = itemExplanations(task, explanation);
  return (
    <div className="stack" data-testid="review-answer" style={{ gap: '0.5rem' }}>
      <p style={{ margin: 0 }}>
        <strong>Answers from the PDF ({lines.length} parts)</strong>
      </p>
      {lines.map((line) => {
        const figure = itemFigures?.get(line.id);
        const note = notes.perItem.get(line.id);
        return (
          <div key={line.id} className="pbq-item" data-testid="pbq-answer-row">
            <div className="pbq-item-head">
              <h3 className="pbq-item-title">{line.prompt}</h3>
            </div>
            {figure ? (
              <span className="pbq-thumb">
                <img src={figure} alt={`${line.prompt} from your PDF`} />
              </span>
            ) : null}
            <p className="pbq-part" data-testid="correct-answer">
              {line.answer || '(not found in your PDF)'}
            </p>
            {note ? (
              <p className="pbq-note" data-testid="item-explanation">
                {note}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

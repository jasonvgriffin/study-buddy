import { useState } from 'react';
import type { Card, ParsedChoice } from './lib/types';

export function CardForm({
  card,
  onSave,
  onCancel,
}: {
  card: Card;
  onSave: (card: Card) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState(card.question);
  const [choices, setChoices] = useState<ParsedChoice[]>(card.choices.map((choice) => ({ ...choice })));
  const [correct, setCorrect] = useState<string[]>(card.correctLabels);
  const [answer, setAnswer] = useState(card.answer);
  const [explanation, setExplanation] = useState(card.explanation ?? '');

  const toggleCorrect = (label: string) => {
    setCorrect((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  };

  return (
    <form
      className="stack"
      data-testid="card-editor"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = question.trim();
        if (!trimmed) return;
        const nextChoices = choices.map((choice) => ({ ...choice, text: choice.text.trim() }));
        const labels = nextChoices.map((choice) => choice.label);
        const correctLabels = nextChoices.length
          ? correct.filter((label) => labels.includes(label))
          : correct;
        onSave({
          ...card,
          question: trimmed,
          choices: nextChoices,
          correctLabels,
          answer: nextChoices.length
            ? nextChoices
                .filter((choice) => correctLabels.includes(choice.label))
                .map((choice) => `${choice.label}. ${choice.text}`)
                .join('; ')
            : answer.trim(),
          explanation: explanation.trim() ? explanation.trim() : null,
        });
      }}
    >
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Question</span>
        <textarea
          className="field"
          data-testid="edit-question"
          rows={4}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
      </label>
      {choices.length ? (
        <div className="stack">
          <span>Options and correct answers</span>
          {choices.map((choice, index) => (
            <div key={choice.label} className="stack" style={{ gap: '0.35rem' }}>
              <label className="stack" style={{ gap: '0.35rem' }}>
                <span>
                  <input
                    type="checkbox"
                    data-testid="edit-correct"
                    checked={correct.includes(choice.label)}
                    onChange={() => toggleCorrect(choice.label)}
                  />{' '}
                  {choice.label} is correct
                </span>
                <input
                  className="field"
                  data-testid="edit-choice"
                  value={choice.text}
                  onChange={(event) =>
                    setChoices((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, text: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
        </div>
      ) : (
        <label className="stack" style={{ gap: '0.35rem' }}>
          <span>Correct answer</span>
          <textarea className="field" data-testid="edit-answer" rows={3} value={answer} onChange={(event) => setAnswer(event.target.value)} />
        </label>
      )}
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Explanation</span>
        <textarea
          className="field"
          data-testid="edit-explanation"
          rows={4}
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
        />
      </label>
      <button className="btn btn-primary btn-block" data-testid="save-card" type="submit">
        Save card
      </button>
      <button className="btn btn-ghost btn-block" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

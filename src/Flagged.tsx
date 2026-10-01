import { useState } from 'react';
import { CardForm } from './CardForm';
import type { Card } from './lib/types';
import { navigate } from './nav';
import { Screen } from './bits';
import { useStudy } from './store';

export function FlaggedScreen() {
  const study = useStudy();
  const snap = study.snap;
  const [editing, setEditing] = useState<string | null>(null);
  if (!snap) return null;
  const inFocus = (subjectId: string) => study.focus === 'all' || study.focus === subjectId;
  const cards = snap.cards.filter((card) => card.reported && inFocus(card.subjectId));
  const deckName = (card: Card) => snap.decks.find((deck) => deck.id === card.deckId)?.name ?? 'Test';

  return (
    <Screen title="Flagged cards" lede="Cards you marked as broken. Edit the text, unflag, or delete." onBack={() => navigate('/')}>
      {!cards.length ? (
        <p data-testid="flagged-empty">No flagged cards.</p>
      ) : (
        cards.map((card) => (
          <article key={card.id} className="card stack" data-testid="flagged-card" style={{ padding: '1rem' }}>
            <p className="muted" style={{ margin: 0 }}>
              {deckName(card)}
              {card.sourceLabel ? ` · ${card.sourceLabel}` : ''}
            </p>
            {editing === card.id ? (
              <CardForm
                card={card}
                onCancel={() => setEditing(null)}
                onSave={(next) => {
                  void study.writeCard(next).then(() => setEditing(null));
                }}
              />
            ) : (
              <>
                <p style={{ margin: 0 }}>{card.question}</p>
                <button className="btn btn-primary btn-block" data-testid="flagged-edit" type="button" onClick={() => setEditing(card.id)}>
                  Edit
                </button>
                <button className="btn btn-ghost btn-block" data-testid="unflag" type="button" onClick={() => void study.flagProblem(card)}>
                  Unflag
                </button>
                <button
                  className="btn btn-clay btn-block"
                  data-testid="delete-card"
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this card from the test?')) void study.removeCard(card.id);
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </article>
        ))
      )}
    </Screen>
  );
}

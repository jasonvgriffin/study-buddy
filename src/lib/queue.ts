import type { Card, CardMemory } from './types';
import { isDue } from './scoring';

export type QueueFilter = {
  subjectId?: string | null;
  deckId?: string | null;
  domainNumber?: number | null;
  objective?: string | null;
};

export function dueCardIds(
  cards: Card[],
  memories: CardMemory[],
  now: number,
  filter: QueueFilter = {},
): string[] {
  const byId = new Map(memories.map((memory) => [memory.cardId, memory]));
  return cards
    .filter((card) => {
      if (filter.subjectId && card.subjectId !== filter.subjectId) return false;
      if (filter.deckId && card.deckId !== filter.deckId) return false;
      if (filter.domainNumber != null && card.domainNumber !== filter.domainNumber) return false;
      if (filter.objective && card.objective !== filter.objective) return false;
      const memory = byId.get(card.id);
      return memory ? isDue(memory, now) : false;
    })
    .sort((a, b) => (byId.get(a.id)?.dueAt ?? 0) - (byId.get(b.id)?.dueAt ?? 0))
    .map((card) => card.id);
}

import { deckLabel, type DeckLabelSource } from './deckLabel';
import { domainBreakdown, type DomainScore } from './domains';
import { compareTestNames } from './format';
import { accuracyByDay, rollup, weakestMemories, type DayStat } from './scoring';
import { activeSessionForDeck, elapsedMs, inProgressLabel } from './session';
import type { CardMemory, LiveSession, Review } from './types';

/** One exam's page: its own accuracy, days, domains, and weakest cards. */
export const STATS_DECK_SECTIONS = ['accuracy', 'by-day', 'by-domain', 'weakest'] as const;

export type DeckStatCard = {
  id: string;
  deckId: string;
  domainNumber: number | null;
  domainName: string | null;
  objective: string | null;
  objectiveTitle: string | null;
};

export type ByTestRow = {
  id: string;
  label: string;
  attempts: number;
  accuracy: number | null;
  progress: string | null;
};

export type WeakestCardLabel = {
  cardId: string;
  deckId: string;
  label: string;
  correct: number;
  attempts: number;
};

export function byTestRows(input: {
  decks: readonly DeckLabelSource[];
  catalog: readonly DeckLabelSource[];
  memories: readonly CardMemory[];
  sessions: readonly LiveSession[];
}): ByTestRow[] {
  return [...input.decks]
    .map((deck) => ({ deck, label: deckLabel(deck, input.catalog) }))
    .sort((a, b) => compareTestNames(a.label, b.label))
    .map(({ deck, label }) => {
      const stats = rollup(input.memories.filter((memory) => memory.deckId === deck.id));
      const open = activeSessionForDeck([...input.sessions], deck.id);
      return {
        id: deck.id,
        label,
        attempts: stats.attempts,
        accuracy: stats.accuracy,
        progress: open ? inProgressLabel(open) : null,
      };
    });
}

export function weakestCardLabels(
  memories: readonly CardMemory[],
  decks: readonly DeckLabelSource[],
  limit = 5,
): WeakestCardLabel[] {
  return weakestMemories([...memories], limit).map((memory) => {
    const deck = decks.find((item) => item.id === memory.deckId);
    return {
      cardId: memory.cardId,
      deckId: memory.deckId,
      label: deck ? deckLabel(deck, decks) : '',
      correct: memory.correct,
      attempts: memory.attempts,
    };
  });
}

/** Rollup, days, domains, weakest cards, and study time for one deck. */
export function deckBreakdown(input: {
  deckId: string;
  reviews: readonly Review[];
  memories: readonly CardMemory[];
  sessions: readonly Pick<LiveSession, 'deckId' | 'accumulatedMs' | 'runningSince'>[];
  cards: readonly DeckStatCard[];
  now: number;
  offsetMinutes?: number;
}): {
  totals: ReturnType<typeof rollup>;
  days: DayStat[];
  domains: DomainScore[];
  weakest: CardMemory[];
  activeMs: number;
} {
  const reviews = input.reviews.filter((review) => review.deckId === input.deckId);
  const memories = input.memories.filter((memory) => memory.deckId === input.deckId);
  const sessions = input.sessions.filter((session) => session.deckId === input.deckId);
  const cards = input.cards.filter((card) => card.deckId === input.deckId);
  return {
    totals: rollup(memories),
    days: accuracyByDay(reviews, input.offsetMinutes ?? 0),
    domains: domainBreakdown(
      cards,
      reviews.map((review) => ({ cardId: review.cardId, correct: review.correct })),
    ),
    weakest: weakestMemories(memories, 5),
    activeMs: sessions.reduce((sum, session) => sum + elapsedMs(session, input.now), 0),
  };
}

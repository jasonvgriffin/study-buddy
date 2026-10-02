import { dueCardIds } from './queue';
import { studyStreak } from './scoring';
import type { Card, CardMemory, Review } from './types';

/** Shown under the checklist. Facts only. The learner decides when to book. */
export const CHECKLIST_NOTE = 'These are facts only. You decide when to book the exam.';

export const ACCURACY_MARK = 0.8;

export type DomainFact = {
  name: string;
  correct: number;
  answered: number;
};

export type ChecklistFacts = {
  above: DomainFact[];
  below: DomainFact[];
  due: number;
  streak: number;
};

type FactCard = Pick<Card, 'id' | 'subjectId' | 'domainNumber' | 'domainName'>;

function domainKey(card: Pick<FactCard, 'domainNumber' | 'domainName'>): { key: string; name: string } {
  if (card.domainNumber == null && !card.domainName?.trim()) return { key: 'none', name: 'No domain' };
  const name = card.domainName?.trim() || `Domain ${card.domainNumber}`;
  const key = card.domainNumber == null ? `n:${name}` : `d:${card.domainNumber}`;
  return { key, name };
}

/** Domain accuracy from card memories. 80% and up is listed apart from the rest. */
export function domainFacts(cards: readonly FactCard[], memories: readonly CardMemory[]): { above: DomainFact[]; below: DomainFact[] } {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const groups = new Map<string, DomainFact>();
  for (const memory of memories) {
    if (memory.attempts <= 0) continue;
    const card = byId.get(memory.cardId);
    if (!card) continue;
    const { key, name } = domainKey(card);
    const group = groups.get(key) ?? { name, correct: 0, answered: 0 };
    group.correct += memory.correct;
    group.answered += memory.attempts;
    groups.set(key, group);
  }
  const above: DomainFact[] = [];
  const below: DomainFact[] = [];
  for (const fact of groups.values()) {
    if (fact.answered <= 0) continue;
    if (fact.correct / fact.answered >= ACCURACY_MARK) above.push(fact);
    else below.push(fact);
  }
  const byName = (a: DomainFact, b: DomainFact) => a.name.localeCompare(b.name);
  above.sort(byName);
  below.sort(byName);
  return { above, below };
}

export function readinessFacts(input: {
  cards: readonly Card[];
  memories: readonly CardMemory[];
  reviews: readonly Pick<Review, 'at'>[];
  now: number;
  offsetMinutes?: number;
}): ChecklistFacts {
  const { above, below } = domainFacts(input.cards, input.memories);
  const due = dueCardIds([...input.cards], [...input.memories], input.now).length;
  const streak = studyStreak(
    input.reviews.map((review) => review.at),
    input.now,
    input.offsetMinutes ?? 0,
  ).current;
  return { above, below, due, streak };
}

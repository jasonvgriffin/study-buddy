import type { Card, CardMemory, Deck, Review, Subject } from './types';
import { isDue, rankStudyAreas, type AreaInput, type Recommendation } from './scoring';

export function studyRecommendations(
  subjects: Subject[],
  decks: Deck[],
  cards: Card[],
  reviews: Review[],
  memories: CardMemory[],
  subjectId: string | 'all',
  now: number,
): Recommendation[] {
  const subjectIds = new Set(
    subjectId === 'all' ? subjects.map((subject) => subject.id) : [subjectId],
  );
  const visibleCards = cards.filter((card) => subjectIds.has(card.subjectId));
  const memoryById = new Map(memories.map((memory) => [memory.cardId, memory]));
  const reviewsByCard = new Map<string, Review[]>();
  for (const review of reviews) {
    const list = reviewsByCard.get(review.cardId) ?? [];
    list.push(review);
    reviewsByCard.set(review.cardId, list);
  }
  const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const weightBySubjectDomain = new Map<string, number | null>();
  for (const deck of decks) {
    if (!subjectIds.has(deck.subjectId)) continue;
    for (const domain of deck.domains) {
      const key = `${deck.subjectId}:${domain.number}`;
      if (!weightBySubjectDomain.has(key)) weightBySubjectDomain.set(key, domain.weight);
    }
  }

  const areas: AreaInput[] = [];

  const add = (
    group: Card[],
    partial: Omit<AreaInput, 'reviews' | 'totalCards' | 'neverAttempted' | 'dueCards'>,
  ) => {
    if (!group.length) return;
    const groupReviews = group.flatMap((card) => reviewsByCard.get(card.id) ?? []);
    const neverAttempted = group.filter((card) => (memoryById.get(card.id)?.attempts ?? 0) === 0).length;
    const dueCards = group.filter((card) => {
      const memory = memoryById.get(card.id);
      return memory ? isDue(memory, now) : false;
    }).length;
    areas.push({
      ...partial,
      reviews: groupReviews,
      totalCards: group.length,
      neverAttempted,
      dueCards,
    });
  };

  for (const subject of subjects.filter((item) => subjectIds.has(item.id))) {
    const group = visibleCards.filter((card) => card.subjectId === subject.id);
    add(group, {
      id: `subject:${subject.id}`,
      label: subject.name,
      scope: 'subject',
      deckId: null,
      deckName: null,
      subjectId: subject.id,
      subjectName: subject.name,
      section: null,
    });
    const domainNumbers = [...new Set(group.map((card) => card.domainNumber).filter((n): n is number => n != null))];
    for (const number of domainNumbers) {
      const inDomain = group.filter((card) => card.domainNumber === number);
      const name = inDomain.find((card) => card.domainName)?.domainName ?? `Domain ${number}`;
      add(inDomain, {
        id: `domain:${subject.id}:${number}`,
        label: name,
        scope: 'domain',
        deckId: null,
        deckName: null,
        subjectId: subject.id,
        subjectName: subject.name,
        section: null,
        examWeight: weightBySubjectDomain.get(`${subject.id}:${number}`) ?? null,
      });
    }
  }

  const decksInView = decks.filter((deck) => subjectIds.has(deck.subjectId));
  for (const deck of decksInView) {
    const group = visibleCards.filter((card) => card.deckId === deck.id);
    add(group, {
      id: `deck:${deck.id}`,
      label: deck.name,
      scope: 'deck',
      deckId: deck.id,
      deckName: deck.name,
      subjectId: deck.subjectId,
      subjectName: subjectName.get(deck.subjectId) ?? '',
      section: null,
    });
    const objectives = [...new Set(group.map((card) => card.objective).filter((value): value is string => !!value))];
    for (const objective of objectives) {
      const inObjective = group.filter((card) => card.objective === objective);
      const title = inObjective.find((card) => card.objectiveTitle)?.objectiveTitle ?? `Objective ${objective}`;
      add(inObjective, {
        id: `objective:${deck.id}:${objective}`,
        label: title,
        scope: 'objective',
        deckId: deck.id,
        deckName: deck.name,
        subjectId: deck.subjectId,
        subjectName: subjectName.get(deck.subjectId) ?? '',
        section: objective,
      });
    }
  }

  return rankStudyAreas(areas, now).filter((item) => item.weak || item.sampleSize === 0 || item.priority >= 0.25);
}

export function deckNameOf(decks: Deck[], id: string | null): string {
  if (!id) return '';
  return decks.find((deck) => deck.id === id)?.name ?? deckNameFallback(id);
}

function deckNameFallback(id: string): string {
  return id;
}

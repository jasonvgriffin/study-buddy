import { compareTestNames } from './format';
import type { Card, Deck, ImportDraft, ParsedCard, ParsedTest } from './types';

export function renameTest(tests: ParsedTest[], index: number, name: string): ParsedTest[] {
  return tests.map((test, i) => (i === index ? { ...test, name: name.trim() || test.name } : test));
}

export function mergeWithPrevious(tests: ParsedTest[], index: number): ParsedTest[] {
  if (index <= 0 || index >= tests.length) return tests;
  const previous = tests[index - 1];
  const current = tests[index];
  const merged: ParsedTest = {
    ...previous,
    cards: [...previous.cards, ...current.cards],
  };
  return [...tests.slice(0, index - 1), merged, ...tests.slice(index + 1)];
}

export function splitAt(tests: ParsedTest[], testIndex: number, cardIndex: number): ParsedTest[] {
  const test = tests[testIndex];
  if (!test || cardIndex <= 0 || cardIndex >= test.cards.length) return tests;
  const head: ParsedTest = { ...test, cards: test.cards.slice(0, cardIndex) };
  const tail: ParsedTest = {
    name: `${test.name} part ${tests.length + 1}`,
    cards: test.cards.slice(cardIndex),
  };
  return [...tests.slice(0, testIndex), head, tail, ...tests.slice(testIndex + 1)];
}

export function renameSection(test: ParsedTest, from: string, to: string): ParsedTest {
  const next = to.trim();
  return {
    ...test,
    cards: test.cards.map((card) => (card.section === from ? { ...card, section: next || null } : card)),
  };
}

export function updateParsedCard(
  test: ParsedTest,
  index: number,
  patch: Partial<ParsedCard>,
): ParsedTest {
  return {
    ...test,
    cards: test.cards.map((card, i) => (i === index ? { ...card, ...patch } : card)),
  };
}

/** Deck title for one detected test. A lone unnamed import uses the file name. */
export function deckNameForImport(testName: string, fileName: string, testCount: number): string {
  const trimmed = testName.trim();
  const generic = trimmed === '' || trimmed === 'Imported test';
  if (generic && testCount === 1) {
    const stem = fileName.replace(/\.pdf$/i, '').trim();
    return stem || 'Test 1';
  }
  if (!trimmed) return 'Test 1';
  return trimmed;
}

/** Swap a test with its neighbor and keep video-start keys on the same cards. */
export function moveTest(
  tests: ParsedTest[],
  videoStarts: Record<string, number | null> | undefined,
  index: number,
  direction: -1 | 1,
): { tests: ParsedTest[]; videoStarts: Record<string, number | null> } {
  const target = index + direction;
  const starts = { ...(videoStarts ?? {}) };
  if (index < 0 || target < 0 || index >= tests.length || target >= tests.length) {
    return { tests, videoStarts: starts };
  }
  const next = [...tests];
  const current = next[index];
  const neighbor = next[target];
  if (!current || !neighbor) return { tests, videoStarts: starts };
  next[index] = neighbor;
  next[target] = current;
  const remapped: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(starts)) {
    const [rawTest, rawCard] = key.split(':');
    const testIndex = Number(rawTest);
    let moved = testIndex;
    if (testIndex === index) moved = target;
    else if (testIndex === target) moved = index;
    remapped[`${moved}:${rawCard ?? '0'}`] = value;
  }
  return { tests: next, videoStarts: remapped };
}

function cardToParsed(card: Card): ParsedCard {
  return {
    sourceLabel: card.sourceLabel,
    question: card.question,
    choices: card.choices,
    correctLabels: card.correctLabels,
    answer: card.answer,
    explanation: card.explanation,
    section: card.section,
    domainNumber: card.domainNumber,
    domainName: card.domainName,
    objective: card.objective,
    objectiveTitle: card.objectiveTitle,
    examCode: card.examCode,
    lessonUrl: card.lessonUrl,
    captureId: card.captureId,
    pbq: card.pbq ?? null,
  };
}

/** Rebuild an organize draft from tests that are already saved. Order follows import order. */
export function draftFromSavedTests(input: {
  id: string;
  decks: Deck[];
  cards: Card[];
  now: number;
}): ImportDraft | null {
  if (!input.decks.length) return null;
  const ordered = [...input.decks].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return compareTestNames(a.name, b.name);
  });
  const first = ordered[0];
  if (!first) return null;
  const videoStarts: Record<string, number | null> = {};
  const tests: ParsedTest[] = ordered.map((deck, testIndex) => {
    const mine = input.cards.filter((card) => card.deckId === deck.id).sort((a, b) => a.order - b.order);
    mine.forEach((card, cardIndex) => {
      if (card.videoStartSec != null && card.videoStartSec > 0) {
        videoStarts[`${testIndex}:${cardIndex}`] = card.videoStartSec;
      }
    });
    return { name: deck.name, cards: mine.map(cardToParsed) };
  });
  return {
    id: input.id,
    subjectId: first.subjectId,
    fileName: first.sourceFileName,
    tests,
    domains: first.domains,
    mentionsMesser: ordered.some((deck) => deck.mentionsMesser === true),
    videoStarts,
    updatedAt: input.now,
    fromSourceGroupId: first.sourceGroupId,
    replacesDeckIds: ordered.map((deck) => deck.id),
  };
}

import type { ParsedCard, ParsedTest } from './types';

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

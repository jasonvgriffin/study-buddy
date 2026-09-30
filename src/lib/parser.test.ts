import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeWithPrevious, splitAt } from './draft';
import { parsePlainDocument, parsePlainText } from './parser';

const three = readFileSync('fixtures/three-tests.txt', 'utf8');
const notes = readFileSync('fixtures/notes.txt', 'utf8');

function norm(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

describe('parsePlainText', () => {
  it('splits three tests when numbering restarts and keeps each answer key local', () => {
    const tests = parsePlainText(three);
    expect(tests.map((test) => test.name)).toEqual([
      'Practice Test 1',
      'Practice Test 2',
      'Practice Test 3',
    ]);
    expect(tests.map((test) => test.cards.length)).toEqual([3, 2, 2]);

    const [first, second, third] = tests;
    expect(first.cards[0].correctLabels).toEqual(['A']);
    expect(first.cards[0].section).toBe('Section: Rivers');
    expect(first.cards[0].explanation).toContain('Cairo sits on the Nile');
    expect(first.cards[0].lessonUrl).toBe('https://example.com/lessons/nile');
    expect(first.cards[0].choices.find((choice) => choice.label === 'B')?.explanation).toContain(
      'South America',
    );
    expect(first.cards[1].correctLabels).toEqual(['A', 'C']);
    expect(first.cards[1].explanation).toContain('both flow through Europe');
    expect(first.cards[1].section).toBe('Section: Rivers');
    expect(first.cards[2].section).toBe('Section: Capitals');
    expect(first.cards[2].explanation).toBeNull();

    expect(second.cards[0].question).toContain('barometer');
    expect(second.cards[0].explanation).toContain('pressure of the air');
    expect(second.cards[0].explanation).not.toContain('Cairo');
    expect(first.cards[0].explanation).not.toContain('barometer');

    expect(third.cards[0].section).toBe('Chapter 4');
    expect(third.cards[0].correctLabels).toEqual(['B']);
    expect(third.cards[1].choices).toEqual([]);
    expect(third.cards[1].answer).toContain('thermometer');
    expect(third.cards[1].explanation).toContain('measures temperature');
  });

  it('keeps extracted strings inside the source text', () => {
    const source = norm(three);
    for (const test of parsePlainText(three)) {
      for (const card of test.cards) {
        expect(source).toContain(norm(card.question));
        for (const choice of card.choices) expect(source).toContain(norm(choice.text));
        if (card.explanation) {
          for (const part of card.explanation.split('\n')) {
            const chunk = norm(part);
            if (chunk) expect(source).toContain(chunk);
          }
        }
      }
    }
  });

  it('reads Q/A pairs and leaves a missing explanation empty', () => {
    const tests = parsePlainText(notes);
    expect(tests).toHaveLength(1);
    expect(tests[0].cards).toHaveLength(3);
    expect(tests[0].cards[0].answer).toContain('flat step');
    expect(tests[0].cards[0].explanation).toBeNull();
    expect(tests[0].cards[1].explanation).toContain('without staying soggy');
    expect(tests[0].cards[2].answer).toContain('hold moisture');
  });

  it('returns no cards for prose that is not a question list', () => {
    expect(
      parsePlainText('Rivers are long. Exams are hard. None of this is a labeled question.'),
    ).toEqual([]);
  });

  it('parses a lettered exam, quick key, per-option notes, and a second exam', () => {
    const text = `
Practice Exam A
Performance-Based Questions
A1. Match the tool to the job.
Hammer
Saw

Multiple Choice Questions
A2. Which tool drives a nail? (Pick TWO)
❍ A. Hammer
❍ B. Saw
❍ C. Mallet
❍ D. Wrench
A3. What color is a ripe banana peel?
❍ A. Blue
❍ B. Yellow
❍ C. Purple
Practice Exam A - Questions 2

Multiple Choice Quick Answers
A2. A and C A3. B

Performance-Based Answers
A1. Match the tool to the job.
Hammer drives nails.
Saw cuts wood.
More information:
Objective 1.1 - Hand tools

Multiple Choice Detailed Answers
A2. Which tool drives a nail? (Pick TWO)
❍ A. Hammer
❍ B. Saw
❍ C. Mallet
❍ D. Wrench
The Answers: A. Hammer, and
C. Mallet
Both strike nails.
The incorrect answers:
B. Saw
A saw cuts.
D. Wrench
A wrench turns bolts.
More information:
Objective 1.2 - Fasteners

A3. What color is a ripe banana peel?
❍ A. Blue
❍ B. Yellow
❍ C. Purple
The Answer: B. Yellow
Ripe bananas are yellow.
The incorrect answers:
A. Blue
Peels are not blue.
C. Purple
Peels are not purple.

Practice Exam B
Multiple Choice Questions
B1. How many legs does a chair usually have?
❍ A. 1
❍ B. 4
Multiple Choice Quick Answers
B1. B
Multiple Choice Detailed Answers
B1. How many legs does a chair usually have?
❍ A. 1
❍ B. 4
The Answer: B. 4
Most chairs have four legs.
The incorrect answers:
A. 1
A one-legged seat is a stool.
`;
    const tests = parsePlainText(text);
    expect(tests.map((test) => test.name)).toEqual(['Practice Exam A', 'Practice Exam B']);
    expect(tests[0].cards.map((card) => card.sourceLabel)).toEqual(['A1', 'A2', 'A3']);
    expect(tests[1].cards.map((card) => card.sourceLabel)).toEqual(['B1']);
    const nail = tests[0].cards[1];
    expect(nail.correctLabels).toEqual(['A', 'C']);
    expect(nail.explanation).toContain('Both strike nails.');
    expect(nail.choices.find((choice) => choice.label === 'B')?.explanation).toContain('A saw cuts.');
    expect(nail.section).toBe('Objective 1.2 - Fasteners');
    expect(tests[0].cards[0].explanation).toContain('Hammer drives nails.');
    expect(tests[0].cards[0].section).toBe('Objective 1.1 - Hand tools');
    expect(tests[0].cards[2].explanation).toContain('Ripe bananas are yellow.');
    expect(tests[1].cards[0].explanation).toContain('four legs');
    expect(tests[1].cards[0].explanation).not.toContain('banana');
    const source = norm(text);
    expect(source).toContain(norm(nail.question));
  });
});

describe('domains, objectives, and lesson links', () => {
  const text = `
Domain 1.0 - Waterways - 40%
Domain 2.0 - Skies - 60%

Practice Test 1
1. Which river runs through Cairo?
a) Nile
b) Amazon

Answer Key
1. a

Detailed Answers
1. a) Nile
The Answer: a) Nile
Cairo sits on the Nile in Egypt.
The incorrect answers:
b) Amazon
The Amazon is in South America.
More information:
SAMPLE-100, Objective 1.2 - Rivers of Africa
https://example.com/lessons/rivers
`;

  it('tags the card from the objective major number and keeps the PDF url', () => {
    const doc = parsePlainDocument(text);
    expect(doc.domains.map((domain) => [domain.number, domain.name, domain.weight])).toEqual([
      [1, 'Waterways', 0.4],
      [2, 'Skies', 0.6],
    ]);
    const card = doc.tests[0].cards[0];
    expect(card.domainNumber).toBe(1);
    expect(card.domainName).toBe('Waterways');
    expect(card.objective).toBe('1.2');
    expect(card.objectiveTitle).toBe('Rivers of Africa');
    expect(card.examCode).toBe('SAMPLE-100');
    expect(card.lessonUrl).toBe('https://example.com/lessons/rivers');
    expect(card.section).toBe('Objective 1.2 - Rivers of Africa');
    expect(card.explanation).toContain('Cairo sits on the Nile');
    expect(card.explanation).not.toContain('example.com');
  });
});

describe('draft edits', () => {
  it('merges and splits tests without mixing their cards', () => {
    const tests = parsePlainText(three);
    const merged = mergeWithPrevious(tests, 1);
    expect(merged).toHaveLength(2);
    expect(merged[0].cards).toHaveLength(5);
    expect(merged[0].cards[3].question).toContain('barometer');
    const split = splitAt(merged, 0, 3);
    expect(split[0].cards).toHaveLength(3);
    expect(split[1].cards[0].question).toContain('barometer');
    expect(split[0].cards.some((card) => card.question.includes('barometer'))).toBe(false);
  });
});

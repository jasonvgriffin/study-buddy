import { describe, expect, it } from 'vitest';
import {
  answerMatches,
  buildPbq,
  explanationFrom,
  gradePbq,
  itemExplanations,
  pbqAnswerLines,
  pbqNeedsFigure,
  pbqPicturePerItem,
  previewLeaks,
  type Piece,
} from './pbq';
import type { ParsedCard } from './types';

function rows(lines: string[], page = 1): Piece[] {
  return lines.map((text, index) => ({ text, x: 40, y: 800 - index * 24, page }));
}

describe('pbq grading', () => {
  it('accepts raid levels, port pairs, and either slash order', () => {
    expect(answerMatches('5', 'RAID 5', 'raid')).toBe(true);
    expect(answerMatches('raid5', 'RAID 5', 'raid')).toBe(true);
    expect(answerMatches('RAID 10', '10', 'raid')).toBe(true);
    expect(answerMatches('raid 0', 'RAID 1', 'raid')).toBe(false);
    expect(answerMatches('21 / 20', '20, 21', 'ports')).toBe(true);
    expect(answerMatches('68 and 67', '67, 68', 'ports')).toBe(true);
    expect(answerMatches('445', '3389', 'ports')).toBe(false);
    expect(answerMatches('white / orange', 'Orange / White', 'exact')).toBe(true);
    expect(answerMatches('memory', 'Memory slots', 'loose')).toBe(true);
    expect(answerMatches('cpu', 'CPU', 'loose')).toBe(true);
  });

  it('builds a two-bank match, an order, and a fill-in from made-up lines', () => {
    const match = buildPbq(
      rows([
        'Match the tool name and most common use to the picture:',
        'Pick an interface:',
        'Hammer',
        'Saw',
        'Pick a common use:',
        'Drive a nail',
        'Cut a board',
      ]),
      rows([
        'Match the tool name and most common use to the picture:',
        'Saw',
        'Cut a board',
        'A saw cuts lumber in the shop and leaves a straight edge on the board.',
        'Hammer',
        'Drive a nail',
        'A hammer drives fasteners into wood until the head sits flush.',
      ]),
    );
    expect(match.format).toBe('match-two');
    expect(match.items).toHaveLength(2);
    expect(match.items[0]?.controls).toHaveLength(2);
    expect(match.items[0]?.controls[0]?.options).toEqual(['Hammer', 'Saw']);
    expect(gradePbq(match, [['Saw', 'Cut a board'], ['Hammer', 'Drive a nail']]).correct).toBe(true);
    expect(gradePbq(match, [['Hammer', 'Cut a board'], ['Saw', 'Drive a nail']]).correct).toBe(false);

    const order = buildPbq(
      rows(['Place these steps in the correct order.', 'Frost the cake', 'Heat the oven', 'Mix the batter']),
      rows([
        'Place these steps in the correct order.',
        'Heat the oven',
        'The oven has to be hot before the pan goes in.',
        'Mix the batter',
        'Combine the dry ingredients first.',
        'Frost the cake',
        'Wait until the layers are cool.',
      ]),
    );
    expect(order.format).toBe('order');
    expect(order.items).toHaveLength(3);
    const ids = [...order.items].sort((a, b) => a.place - b.place).map((item) => item.id);
    expect(gradePbq(order, [], ids).correct).toBe(true);
    expect(gradePbq(order, [], order.items.map((item) => item.id)).correct).toBe(false);

    const ports = buildPbq(
      rows(['Fill in the blank with the port number.', '______ Send a letter', '______ Share a folder (two ports)']),
      rows(['Fill in the blank with the port number.', '25 - Send a letter', '20, 21 - Share a folder (two ports)']),
    );
    expect(ports.grade).toBe('ports');
    expect(gradePbq(ports, [['25'], ['21/20']]).correct).toBe(true);
  });

  it('keeps the answer body out of the pre-submit text', () => {
    const task = buildPbq(
      rows(['Match the token to the picture:', 'Red', 'Blue']),
      rows(['Match the token to the picture:', 'Blue means the west door is open for guests.', 'Red']),
    );
    const card: ParsedCard = {
      sourceLabel: 'Q1',
      question: task.instruction,
      choices: [],
      correctLabels: [],
      answer: '',
      explanation: 'Blue means the west door is open for guests.',
      section: null,
      domainNumber: null,
      domainName: null,
      objective: null,
      objectiveTitle: null,
      examCode: null,
      lessonUrl: null,
      pbq: task,
    };
    expect(previewLeaks(card)).toEqual([]);
    expect(card.question.toLowerCase()).not.toContain('west door');
  });

  it('grades every control, lists every answer, and splits explanations per item', () => {
    const question = rows([
      'Match the tool name and most common use to the picture:',
      'Pick an interface:',
      'Hammer',
      'Saw',
      'Pick a common use:',
      'Drive a nail',
      'Cut a board',
    ]);
    const answer = rows([
      'Match the tool name and most common use to the picture:',
      'Saw',
      'Cut a board',
      'A saw cuts lumber in the shop and leaves a straight edge on the board.',
      'Hammer',
      'Drive a nail',
      'A hammer drives fasteners into wood until the head sits flush.',
    ]);
    const task = buildPbq(question, answer);
    const graded = gradePbq(task, [['Saw', 'Drive a nail'], ['', '']]);
    expect(graded.items).toHaveLength(2);
    expect(graded.items[0]?.controls.map((part) => part.correct)).toEqual([true, false]);
    expect(graded.items[0]?.controls[1]).toMatchObject({ given: 'Drive a nail', expected: 'Cut a board' });
    expect(graded.items[1]?.controls.map((part) => part.given)).toEqual(['', '']);
    const lines = pbqAnswerLines(task);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.answer).toContain('Saw');
    expect(lines[0]?.answer).toContain('Cut a board');
    const notes = itemExplanations(task, explanationFrom(answer, task.instruction));
    expect(notes.perItem.size).toBe(2);
    expect(notes.perItem.get(task.items[0]!.id)).toMatch(/saw cuts lumber/);
    expect(notes.perItem.get(task.items[1]!.id)).toMatch(/hammer drives/);
    expect(pbqNeedsFigure(task)).toBe(pbqPicturePerItem(task));
  });

  it('marks each step of an ordering task', () => {
    const order = buildPbq(
      rows(['Place these steps in the correct order.', 'Frost the cake', 'Heat the oven', 'Mix the batter']),
      rows(['Place these steps in the correct order.', 'Heat the oven', 'Mix the batter', 'Frost the cake']),
    );
    const byPlace = [...order.items].sort((a, b) => a.place - b.place).map((item) => item.id);
    const swapped = [byPlace[1]!, byPlace[0]!, byPlace[2]!];
    const graded = gradePbq(order, [], swapped);
    expect(graded.correct).toBe(false);
    expect(graded.items.filter((item) => item.correct)).toHaveLength(1);
    expect(pbqAnswerLines(order).map((line) => line.answer)).toEqual(['Heat the oven', 'Mix the batter', 'Frost the cake']);
  });
});


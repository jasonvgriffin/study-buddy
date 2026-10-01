import { describe, expect, it } from 'vitest';
import { answerText, correctAnswerText, domainBreakdown } from './domains';

describe('domain scores', () => {
  const cards = [
    {
      id: 'c1',
      domainNumber: 1,
      domainName: 'Mobile Devices',
      objective: '1.1',
      objectiveTitle: 'Laptop hardware',
    },
    {
      id: 'c2',
      domainNumber: 1,
      domainName: 'Mobile Devices',
      objective: '1.2',
      objectiveTitle: 'Mobile displays',
    },
    {
      id: 'c3',
      domainNumber: 2,
      domainName: 'Networking',
      objective: '2.1',
      objectiveTitle: null,
    },
    {
      id: 'c4',
      domainNumber: null,
      domainName: null,
      objective: null,
      objectiveTitle: null,
    },
  ];

  it('groups a sitting by the domain and objective already stored on each card', () => {
    const scores = domainBreakdown(cards, [
      { cardId: 'c1', correct: true },
      { cardId: 'c2', correct: false },
      { cardId: 'c3', correct: null },
      { cardId: 'c4', correct: true },
      { cardId: 'missing', correct: false },
    ]);
    expect(scores.map((score) => score.name)).toEqual(['Mobile Devices', 'Networking', 'No domain']);
    expect(scores[0]).toMatchObject({ correct: 1, incorrect: 1, unanswered: 0 });
    expect(scores[0].objectives.map((item) => item.label)).toEqual(['1.1 Laptop hardware', '1.2 Mobile displays']);
    expect(scores[0].objectives[0]).toMatchObject({ correct: 1, incorrect: 0 });
    expect(scores[0].objectives[1]).toMatchObject({ correct: 0, incorrect: 1 });
    expect(scores[1]).toMatchObject({ correct: 0, incorrect: 0, unanswered: 1 });
    expect(scores[1].objectives).toEqual([
      expect.objectContaining({ key: '2.1', label: '2.1', unanswered: 1 }),
    ]);
    expect(scores[2]).toMatchObject({ correct: 1, incorrect: 0, unanswered: 0, objectives: [] });
  });

  it('writes the choice text for the letter the learner picked', () => {
    const card = {
      choices: [
        { label: 'A', text: 'Nile' },
        { label: 'B', text: 'Amazon' },
      ],
      answer: 'A. Nile',
      correctLabels: ['A'],
    };
    expect(answerText(card, ['B'])).toBe('B. Amazon');
    expect(correctAnswerText(card)).toBe('A. Nile');
    expect(answerText(card, [])).toBe('');
    expect(correctAnswerText({ ...card, correctLabels: [], answer: 'Hammer' })).toBe('Hammer');
  });
});

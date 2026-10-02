/**
 * @vitest-environment jsdom
 */
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { StatsDeckDetail, StatsOverview, type WeakestRow } from './Stats';

function mount(node: ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return {
    host,
    unmount() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function follows(host: ParentNode, earlier: string, later: string) {
  const a = host.querySelector(`[data-testid="${earlier}"]`);
  const b = host.querySelector(`[data-testid="${later}"]`);
  expect(a, earlier).toBeTruthy();
  expect(b, later).toBeTruthy();
  expect(a!.compareDocumentPosition(b!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

const weakest: WeakestRow[] = [
  {
    cardId: 'cairo',
    question: 'Which river runs through Cairo?',
    correct: 0,
    attempts: 1,
    deckLabel: 'Practice Exam A, Messer',
  },
  {
    cardId: 'pressure',
    question: 'What does a barometer measure?',
    correct: 1,
    attempts: 1,
    deckLabel: 'Practice Exam A, Dion',
  },
];

describe('stats overview', () => {
  it('shows By test first, an in-progress label, and the exam on each weakest card', () => {
    let opened = '';
    const view = mount(
      createElement(StatsOverview, {
        lede: 'Every subject on this device.',
        totals: { accuracy: 0.5, correct: 1, incorrect: 1, attempts: 2 },
        activeMs: 65_000,
        streak: { current: 0, best: 2 },
        days: [{ day: '2026-01-02', correct: 1, incorrect: 1, accuracy: 0.5 }],
        domains: [],
        tests: [
          {
            id: 'messer',
            label: 'Practice Exam A, Messer',
            attempts: 1,
            accuracy: 0,
            progress: 'In progress, question 7 of 90',
          },
          {
            id: 'dion',
            label: 'Practice Exam A, Dion',
            attempts: 0,
            accuracy: null,
            progress: null,
          },
        ],
        weakest,
        onOpenTest: (id: string) => {
          opened = id;
        },
      }),
    );
    expect(view.host.querySelector('h2')?.textContent).toBe('By test');
    follows(view.host, 'by-test', 'overall-accuracy');
    follows(view.host, 'overall-accuracy', 'accuracy-by-day');
    follows(view.host, 'accuracy-by-day', 'domain-stats');
    follows(view.host, 'domain-stats', 'weakest-cards');
    const openRow = view.host.querySelector('[data-deck-id="messer"]');
    expect(openRow?.querySelector('[data-testid="in-progress"]')?.textContent).toBe(
      'In progress, question 7 of 90',
    );
    expect(view.host.querySelector('[data-deck-id="dion"] [data-testid="in-progress"]')).toBeNull();
    expect(
      [...view.host.querySelectorAll('[data-testid="weakest-deck"]')].map((node) => node.textContent),
    ).toEqual(['Practice Exam A, Messer', 'Practice Exam A, Dion']);
    act(() => {
      (openRow as HTMLButtonElement).click();
    });
    expect(opened).toBe('messer');
    expect(openRow?.tagName).toBe('BUTTON');
    view.unmount();
  });
});

describe('stats deck detail', () => {
  it('shows that exam only, in accuracy, day, domain, weakest order, with a way back', () => {
    let backed = false;
    const view = mount(
      createElement(StatsDeckDetail, {
        title: 'Practice Exam A, Messer',
        totals: { accuracy: 0.5, correct: 1, incorrect: 1, attempts: 2 },
        activeMs: 125_000,
        days: [
          { day: '2026-01-02', correct: 0, incorrect: 1, accuracy: 0 },
          { day: '2026-01-03', correct: 1, incorrect: 0, accuracy: 1 },
        ],
        domains: [
          {
            key: 'd:1',
            domainNumber: 1,
            name: 'Rivers',
            correct: 1,
            incorrect: 1,
            unanswered: 0,
            objectives: [{ key: '1.1', label: '1.1 Geography', correct: 1, incorrect: 1, unanswered: 0 }],
          },
        ],
        weakest: [{ ...weakest[0], deckLabel: null }],
        onBack: () => {
          backed = true;
        },
      }),
    );
    expect(view.host.querySelector('h1')?.textContent).toBe('Practice Exam A, Messer');
    expect(view.host.querySelector('[data-testid="by-test"]')).toBeNull();
    expect(view.host.querySelector('[data-testid="weakest-deck"]')).toBeNull();
    expect(view.host.textContent).toContain('1 right, 1 wrong, 2 answers.');
    expect(view.host.textContent).toContain('Active study time 2:05.');
    expect(view.host.textContent).toContain('Which river runs through Cairo?');
    expect(view.host.textContent).not.toContain('barometer');
    expect(view.host.textContent).not.toContain('Weather');
    expect(view.host.textContent).toContain('Rivers');
    expect(view.host.textContent).toContain('0/1');
    expect(view.host.textContent).toContain('1/1');
    follows(view.host, 'deck-accuracy', 'accuracy-by-day');
    follows(view.host, 'accuracy-by-day', 'domain-stats');
    follows(view.host, 'domain-stats', 'weakest-cards');
    act(() => {
      (view.host.querySelector('button') as HTMLButtonElement).click();
    });
    expect(backed).toBe(true);
    view.unmount();
  });
});

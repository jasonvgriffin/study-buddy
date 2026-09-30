import { describe, expect, it } from 'vitest';
import { findBlankBoxes } from './pdfExtract';
import { pbqFigureJobs, readingOrder } from './regions';
import type { PbqTask } from './types';

function task(prompts: string[], controls = 1): PbqTask {
  return {
    format: 'select',
    grade: 'exact',
    instruction: 'Match each item.',
    items: prompts.map((prompt, index) => ({
      id: `item-${index + 1}`,
      prompt,
      controls: Array.from({ length: controls }, () => ({ kind: 'select' as const, title: '', options: ['One', 'Two'] })),
      accept: Array.from({ length: controls }, () => ['One']),
      place: index,
    })),
  };
}

const page = { page: 3, width: 432, height: 648 };
const lines = [
  { page: 3, text: 'Performance-Based Questions', x: 40, y: 620 },
  { page: 3, text: 'A1. Match each picture to its name.', x: 40, y: 600 },
  { page: 3, text: 'A2. Type the service for each port.', x: 40, y: 250 },
];

describe('pbq figure planner', () => {
  it('orders pictures in rows, top to bottom then left to right', () => {
    const boxes = readingOrder([
      { x0: 200, y0: 400, x1: 300, y1: 480 },
      { x0: 40, y0: 400, x1: 140, y1: 480 },
      { x0: 40, y0: 300, x1: 140, y1: 380 },
      { x0: 45, y0: 305, x1: 135, y1: 375 },
    ]);
    expect(boxes.map((box) => [box.x0, box.y0])).toEqual([
      [40, 400],
      [200, 400],
      [40, 300],
    ]);
  });

  it('crops one picture per item and skips text-only questions', () => {
    const jobs = pbqFigureJobs({
      cards: [
        { label: 'A1', task: task(['Picture 1', 'Picture 2', 'Picture 3']) },
        { label: 'A2', task: task(['Send mail', 'Share files']) },
      ],
      lines,
      chrome: [{ page: 3, text: 'Answer Page: 9', y: 40 }],
      pages: [page],
      images: [
        { page: 3, x: 40, y: 500, w: 100, h: 60 },
        { page: 3, x: 200, y: 500, w: 100, h: 60 },
        { page: 3, x: 40, y: 400, w: 100, h: 60 },
      ],
    });
    expect(jobs.map((job) => job.id)).toEqual(['A1#item-1', 'A1#item-2', 'A1#item-3']);
    expect(jobs[1]?.boxes[0]).toMatchObject({ page: 3, left: 199, right: 301, top: 561, bottom: 499 });
  });

  it('uses a masked full-width crop for a drawing with no pictures', () => {
    const jobs = pbqFigureJobs({
      cards: [{ label: 'A1', task: task(['Diagram 1', 'Diagram 2']) }],
      lines,
      chrome: [],
      pages: [page],
      images: [],
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: 'A1', mask: true, labels: ['Diagram 1', 'Diagram 2'] });
  });

  it('finds empty outlined answer boxes but not filled ones', () => {
    const width = 200;
    const height = 120;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    const ink = (x: number, y: number) => {
      const at = (y * width + x) * 4;
      pixels[at] = 0;
      pixels[at + 1] = 0;
      pixels[at + 2] = 0;
    };
    const outline = (x0: number, y0: number, x1: number, y1: number) => {
      for (let x = x0; x <= x1; x += 1) {
        ink(x, y0);
        ink(x, y1);
      }
      for (let y = y0; y <= y1; y += 1) {
        ink(x0, y);
        ink(x1, y);
      }
    };
    outline(20, 10, 120, 40);
    outline(20, 70, 120, 100);
    for (let y = 80; y < 92; y += 1) for (let x = 40; x < 100; x += 1) ink(x, y);
    const found = findBlankBoxes(pixels, width, height, 1);
    expect(found).toHaveLength(1);
    expect(found[0]!.y0).toBeLessThan(12);
    expect(found[0]!.y1).toBeGreaterThan(38);
  });
});

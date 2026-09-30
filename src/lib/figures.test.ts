import { describe, expect, it } from 'vitest';
import { assignFigures, bindFiguresToCards, imageKept, type LayoutImage, type LayoutPage } from './figures';

const page = (n: number): LayoutPage => ({ page: n, width: 432, height: 648 });

describe('assignFigures', () => {
  it('gives question figures to the heading above them and continues an answer page', () => {
    const result = assignFigures({
      pageCount: 401,
      pages: [1, 12, 13, 14, 44, 45, 46, 400, 401].map(page),
      lines: [
        { page: 12, text: 'A1. Where is the diagram?', x: 40, y: 556 },
        { page: 13, text: 'A2. Next question', x: 40, y: 604 },
        { page: 13, text: 'A3. Another question', x: 40, y: 381 },
        { page: 14, text: 'A4. Diagram question', x: 40, y: 604 },
        { page: 44, text: 'A1. The answer explains the diagram.', x: 40, y: 539 },
        { page: 46, text: 'A2. The next answer.', x: 40, y: 500 },
      ],
      chrome: [
        { page: 12, text: 'Practice Exam A - Questions' },
        { page: 13, text: 'Practice Exam A - Questions' },
        { page: 14, text: 'Practice Exam A - Questions' },
        { page: 44, text: 'Practice Exam A - Answers' },
        { page: 45, text: 'Practice Exam A - Answers' },
        { page: 46, text: 'Practice Exam A - Answers' },
      ],
      images: [
        { page: 1, x: 0, y: 0, w: 430, h: 640 },
        { page: 12, x: 50, y: 300, w: 80, h: 70 },
        { page: 12, x: 50, y: 51, w: 80, h: 60 },
        { page: 13, x: 86, y: 422, w: 97, h: 155 },
        { page: 14, x: 503, y: 105, w: 436, h: 436 },
        { page: 14, x: 40, y: 180, w: 120, h: 90 },
        { page: 44, x: 40, y: 280, w: 90, h: 70 },
        { page: 45, x: 40, y: 200, w: 90, h: 70 },
        { page: 400, x: 20, y: 20, w: 40, h: 40 },
        { page: 401, x: 0, y: 0, w: 430, h: 640 },
      ],
    });

    const byIndex = (index: number) => result.assignments.find((item) => item.imageIndex === index);
    expect(byIndex(1)).toMatchObject({ sourceLabel: 'A1', role: 'question' });
    expect(byIndex(2)).toMatchObject({ sourceLabel: 'A1', role: 'question' });
    expect(byIndex(3)).toMatchObject({ sourceLabel: 'A2', role: 'question' });
    expect(byIndex(4)).toBeUndefined();
    expect(byIndex(5)).toMatchObject({ sourceLabel: 'A4', role: 'question' });
    expect(byIndex(6)).toMatchObject({ sourceLabel: 'A1', role: 'explanation' });
    expect(byIndex(7)).toMatchObject({ sourceLabel: 'A1', role: 'explanation' });
    expect(result.slots.map((slot) => slot.sourceLabel)).toEqual(['A1', 'A2', 'A3', 'A4']);
    expect(result.excludedPages).toEqual(expect.arrayContaining([1, 400, 401]));
    expect(result.unmappedPages).not.toContain(45);
    expect(result.assignments.some((item) => item.sourceLabel === 'A3')).toBe(false);
  });

  it('keeps a figure on a short sample and does not invent one for a text-only question', () => {
    const result = assignFigures({
      pageCount: 2,
      pages: [
        { page: 1, width: 612, height: 792 },
        { page: 2, width: 612, height: 792 },
      ],
      lines: [
        { page: 1, text: '1. What color is the square in the figure?', x: 54, y: 700 },
        { page: 2, text: 'Detailed Answers', x: 54, y: 740 },
        { page: 2, text: '1. a) Green', x: 54, y: 700 },
      ],
      images: [{ page: 1, x: 80, y: 480, w: 120, h: 100 }],
    });
    expect(result.excludedPages).toEqual([]);
    expect(result.assignments).toEqual([
      expect.objectContaining({ imageIndex: 0, sourceLabel: '1', role: 'question' }),
    ]);
  });

  it('zips repeated question numbers onto the test they belong to', () => {
    const mapped = assignFigures({
      pageCount: 4,
      pages: [1, 2, 3, 4].map((n) => ({ page: n, width: 612, height: 792 })),
      lines: [
        { page: 1, text: '1. First test question', x: 40, y: 700 },
        { page: 2, text: '1. Second test question', x: 40, y: 700 },
        { page: 3, text: '1. a) First answer', x: 40, y: 700 },
        { page: 4, text: '1. a) Second answer', x: 40, y: 700 },
      ],
      chrome: [
        { page: 3, text: 'Detailed Answers' },
        { page: 4, text: 'Detailed Answers' },
      ],
      images: [
        { page: 1, x: 40, y: 400, w: 80, h: 80 },
        { page: 2, x: 40, y: 400, w: 80, h: 80 },
        { page: 3, x: 40, y: 400, w: 80, h: 80 },
        { page: 4, x: 40, y: 400, w: 80, h: 80 },
      ],
    });
    const links = bindFiguresToCards(
      [{ cards: [{ sourceLabel: '1' }] }, { cards: [{ sourceLabel: '1' }] }],
      mapped.slots,
    );
    expect(links).toEqual([
      { testIndex: 0, cardIndex: 0, slotIndex: 0 },
      { testIndex: 1, cardIndex: 0, slotIndex: 1 },
    ]);
    expect(mapped.slots[0].questionImageIndexes).toEqual([0]);
    expect(mapped.slots[1].questionImageIndexes).toEqual([1]);
    expect(mapped.slots[0].explanationImageIndexes).toEqual([2]);
    expect(mapped.slots[1].explanationImageIndexes).toEqual([3]);
  });

  it('drops tiny, off-page, and full-bleed images', () => {
    const size: LayoutPage = { page: 3, width: 400, height: 600 };
    const tiny: LayoutImage = { page: 3, x: 10, y: 10, w: 10, h: 40 };
    const off: LayoutImage = { page: 3, x: 390, y: 10, w: 200, h: 80 };
    const bleed: LayoutImage = { page: 3, x: 0, y: 0, w: 400, h: 600 };
    const ok: LayoutImage = { page: 3, x: 40, y: 40, w: 80, h: 80 };
    expect(imageKept(tiny, size, 10)).toBe(false);
    expect(imageKept(off, size, 10)).toBe(false);
    expect(imageKept(bleed, size, 10)).toBe(false);
    expect(imageKept(ok, size, 10)).toBe(true);
    expect(imageKept({ page: 1, x: 40, y: 40, w: 80, h: 80 }, { page: 1, width: 400, height: 600 }, 40)).toBe(false);
    expect(imageKept({ page: 1, x: 40, y: 40, w: 80, h: 80 }, { page: 1, width: 400, height: 600 }, 4)).toBe(true);
  });
});

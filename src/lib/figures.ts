export type LayoutImage = {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type LayoutLine = {
  page: number;
  text: string;
  x: number;
  y: number;
};

export type LayoutPage = {
  page: number;
  width: number;
  height: number;
};

export type FigureSlot = {
  sourceLabel: string;
  questionImageIndexes: number[];
  explanationImageIndexes: number[];
};

export type FigureAssignment = {
  imageIndex: number;
  sourceLabel: string;
  role: 'question' | 'explanation';
  slot: number;
};

const MIN_SIDE = 28;
const MIN_INTERSECTION = 0.4;
const MAX_PAGE_COVER = 0.85;

export function normFigureLabel(label: string): string {
  const match = label.trim().match(/^([A-Za-z]?)(\d+)$/);
  if (!match) return label.trim().toUpperCase();
  return `${match[1].toUpperCase()}${match[2]}`;
}

/** A question or answer heading at the start of a line, such as "A1." or "12." */
export function questionAnchorLabel(text: string): string | null {
  const match = text.trim().match(/^([A-Za-z]?\d{1,3})\.\s+\S/);
  if (!match) return null;
  return normFigureLabel(match[1]);
}

function overlapBox(img: LayoutImage, page: LayoutPage): { iw: number; ih: number } {
  const x0 = Math.max(0, img.x);
  const y0 = Math.max(0, img.y);
  const x1 = Math.min(page.width, img.x + img.w);
  const y1 = Math.min(page.height, img.y + img.h);
  return { iw: Math.max(0, x1 - x0), ih: Math.max(0, y1 - y0) };
}

export function imageKept(img: LayoutImage, page: LayoutPage, pageCount: number): boolean {
  if (!Number.isFinite(img.w) || !Number.isFinite(img.h) || img.w <= 0 || img.h <= 0) return false;
  if (pageCount >= 30 && (img.page <= 2 || img.page > pageCount - 2)) return false;
  if (img.w < MIN_SIDE || img.h < MIN_SIDE) return false;
  const area = img.w * img.h;
  const { iw, ih } = overlapBox(img, page);
  if (area <= 0 || (iw * ih) / area < MIN_INTERSECTION) return false;
  const pageArea = page.width * page.height;
  if (pageArea > 0 && (iw * ih) / pageArea > MAX_PAGE_COVER) return false;
  return true;
}

function zoneFor(
  texts: string[],
  hasAnchor: boolean,
  previous: 'question' | 'explanation',
): 'question' | 'explanation' {
  const blob = texts.join('\n');
  if (/practice\s+exam\b[^\n]*-\s*answers/i.test(blob)) return 'explanation';
  if (/\b(detailed answers|performance-based answers|answer key)\b/i.test(blob)) return 'explanation';
  if (/practice\s+exam\b[^\n]*-\s*questions/i.test(blob)) return 'question';
  if (hasAnchor && !/\banswers\b/i.test(blob)) return 'question';
  return previous;
}

function ownerSlot(anchors: { y: number; slot: number }[], centerY: number): number | null {
  if (!anchors.length) return null;
  const above = anchors.filter((anchor) => anchor.y >= centerY - 0.5);
  if (!above.length) {
    return anchors.reduce((best, anchor) => (anchor.y > best.y ? anchor : best)).slot;
  }
  return above.reduce((best, anchor) => (anchor.y - centerY < best.y - centerY ? anchor : best)).slot;
}

/**
 * Map embedded image boxes onto question labels.
 * Question-zone headings each open a slot, even when that question has no image.
 * Explanation images join those slots by label order. A later page with pictures
 * and no label continues the explanation slot already open.
 * Cover pages are dropped only for long documents, so a two-page sample keeps its figure.
 */
export function assignFigures(input: {
  pageCount: number;
  pages: LayoutPage[];
  lines: LayoutLine[];
  chrome?: { page: number; text: string }[];
  images: LayoutImage[];
}): {
  assignments: FigureAssignment[];
  slots: FigureSlot[];
  excludedPages: number[];
  unmappedPages: number[];
} {
  const pageSize = new Map<number, LayoutPage>();
  for (const page of input.pages) pageSize.set(page.page, page);

  const linesByPage = new Map<number, LayoutLine[]>();
  for (const line of input.lines) {
    const list = linesByPage.get(line.page) ?? [];
    list.push(line);
    linesByPage.set(line.page, list);
  }
  const chromeByPage = new Map<number, string[]>();
  for (const item of input.chrome ?? []) {
    const list = chromeByPage.get(item.page) ?? [];
    list.push(item.text);
    chromeByPage.set(item.page, list);
  }
  const imagesByPage = new Map<number, { index: number; image: LayoutImage }[]>();
  input.images.forEach((image, index) => {
    const list = imagesByPage.get(image.page) ?? [];
    list.push({ index, image });
    imagesByPage.set(image.page, list);
  });

  const pageNumbers = new Set<number>([
    ...input.pages.map((page) => page.page),
    ...input.lines.map((line) => line.page),
    ...input.images.map((image) => image.page),
  ]);

  const slots: FigureSlot[] = [];
  const assignments: FigureAssignment[] = [];
  const excludedPages: number[] = [];
  const unmappedPages: number[] = [];
  let previousZone: 'question' | 'explanation' = 'question';
  let currentQuestion = -1;
  let currentExplanation = -1;
  let explainCursor = 0;

  for (const pageNo of [...pageNumbers].sort((a, b) => a - b)) {
    const size = pageSize.get(pageNo) ?? { page: pageNo, width: 612, height: 792 };
    const pageLines = linesByPage.get(pageNo) ?? [];
    const texts = [...(chromeByPage.get(pageNo) ?? []), ...pageLines.map((line) => line.text)];
    const anchors = pageLines
      .map((line) => {
        const label = questionAnchorLabel(line.text);
        return label ? { label, y: line.y } : null;
      })
      .filter((item): item is { label: string; y: number } => item != null)
      .sort((a, b) => b.y - a.y);
    const zone = zoneFor(texts, anchors.length > 0, previousZone);
    previousZone = zone;

    const raw = imagesByPage.get(pageNo) ?? [];
    const kept: { index: number; image: LayoutImage }[] = [];
    let dropped = 0;
    for (const item of raw) {
      if (imageKept(item.image, size, input.pageCount)) kept.push(item);
      else dropped += 1;
    }
    if (raw.length > 0 && dropped === raw.length) excludedPages.push(pageNo);

    const pageAnchors: { y: number; slot: number }[] = [];
    if (zone === 'question') {
      for (const anchor of anchors) {
        const slot = slots.length;
        slots.push({
          sourceLabel: anchor.label,
          questionImageIndexes: [],
          explanationImageIndexes: [],
        });
        pageAnchors.push({ y: anchor.y, slot });
        currentQuestion = slot;
      }
    } else if (kept.length > 0) {
      for (const anchor of anchors) {
        let found = -1;
        for (let i = explainCursor; i < slots.length; i += 1) {
          if (slots[i].sourceLabel === anchor.label) {
            found = i;
            break;
          }
        }
        if (found < 0) continue;
        explainCursor = found + 1;
        currentExplanation = found;
        pageAnchors.push({ y: anchor.y, slot: found });
      }
    }

    let assignedHere = 0;
    for (const item of kept) {
      const centerY = item.image.y + item.image.h / 2;
      let slot = ownerSlot(pageAnchors, centerY);
      if (slot == null) slot = zone === 'question' ? currentQuestion : currentExplanation;
      if (slot == null || slot < 0 || !slots[slot]) continue;
      const role = zone === 'question' ? 'question' : 'explanation';
      if (role === 'question') slots[slot].questionImageIndexes.push(item.index);
      else slots[slot].explanationImageIndexes.push(item.index);
      assignments.push({
        imageIndex: item.index,
        sourceLabel: slots[slot].sourceLabel,
        role,
        slot,
      });
      assignedHere += 1;
    }
    if (kept.length > 0 && assignedHere < kept.length) unmappedPages.push(pageNo);
  }

  return { assignments, slots, excludedPages, unmappedPages };
}

/** Zip slots onto cards in reading order so a repeated "1" stays with its own test. */
export function bindFiguresToCards(
  tests: { cards: { sourceLabel: string }[] }[],
  slots: { sourceLabel: string }[],
): { testIndex: number; cardIndex: number; slotIndex: number }[] {
  const pairs: { testIndex: number; cardIndex: number; slotIndex: number }[] = [];
  let cursor = 0;
  tests.forEach((test, testIndex) => {
    test.cards.forEach((card, cardIndex) => {
      const label = normFigureLabel(card.sourceLabel);
      let found = -1;
      for (let i = cursor; i < slots.length; i += 1) {
        if (normFigureLabel(slots[i].sourceLabel) === label) {
          found = i;
          break;
        }
      }
      if (found >= 0) {
        pairs.push({ testIndex, cardIndex, slotIndex: found });
        cursor = found + 1;
      }
    });
  });
  return pairs;
}

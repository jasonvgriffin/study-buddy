import { questionAnchorLabel } from './figures';
import type { LayoutImage, LayoutLine, LayoutPage } from './figures';
import { pbqNeedsFigure, pbqPicturePerItem } from './pbq';
import type { PbqTask } from './types';

export type RegionBox = {
  page: number;
  /** PDF user space. top is the higher y (up the page). */
  top: number;
  bottom: number;
  /** Optional horizontal limits in PDF user space. Full page width when absent. */
  left?: number;
  right?: number;
};

export type RegionJob = {
  id: string;
  boxes: RegionBox[];
  /** White out printed answer blanks (empty outlined boxes) in the rendered crop. */
  mask?: boolean;
  /** Written into the whited-out blanks in reading order when the counts match. */
  labels?: string[];
};

function explicitZone(texts: string[]): 'question' | 'answer' | null {
  const blob = texts.join('\n');
  if (/performance[-\s]?based\s+answers|practice\s+exam\b.*-\s*answers/i.test(blob)) return 'answer';
  if (/performance[-\s]?based\s+questions|practice\s+exam\b.*-\s*questions/i.test(blob)) return 'question';
  return null;
}

/**
 * Crop boxes for performance questions: from the question heading down to the
 * answer-page footer or the next question, on question pages only.
 */
export function questionRegions(input: {
  labels: string[];
  lines: LayoutLine[];
  chrome: { page: number; text: string; y?: number }[];
  pages: Pick<LayoutPage, 'page' | 'height'>[];
}): RegionJob[] {
  const height = new Map(input.pages.map((page) => [page.page, page.height]));
  const linesByPage = new Map<number, LayoutLine[]>();
  for (const line of input.lines) {
    const list = linesByPage.get(line.page) ?? [];
    list.push(line);
    linesByPage.set(line.page, list);
  }
  const chromeByPage = new Map<number, { text: string; y?: number }[]>();
  for (const item of input.chrome) {
    const list = chromeByPage.get(item.page) ?? [];
    list.push(item);
    chromeByPage.set(item.page, list);
  }
  const zone = new Map<number, boolean>();
  let inherited: 'question' | 'answer' | null = null;
  const pageNumbers = [...new Set([...linesByPage.keys(), ...chromeByPage.keys()])].sort((a, b) => a - b);
  for (const page of pageNumbers) {
    const texts = [
      ...(chromeByPage.get(page) ?? []).map((item) => item.text),
      ...(linesByPage.get(page) ?? []).map((line) => line.text),
    ];
    const explicit = explicitZone(texts);
    if (explicit) inherited = explicit;
    zone.set(page, (explicit ?? inherited) === 'question');
  }

  const jobs: RegionJob[] = [];
  for (const label of input.labels) {
    const hits = input.lines.filter(
      (line) => zone.get(line.page) && questionAnchorLabel(line.text) === label,
    );
    const heading = hits.sort((a, b) => a.page - b.page || b.y - a.y)[0];
    if (!heading) continue;
    const pageHeight = height.get(heading.page) ?? 792;
    const below = input.lines.filter(
      (line) =>
        line.page === heading.page &&
        line.y < heading.y - 8 &&
        questionAnchorLabel(line.text) &&
        zone.get(line.page),
    );
    const nextHeading = below.sort((a, b) => b.y - a.y)[0];
    const footers = (chromeByPage.get(heading.page) ?? []).filter((item) => {
      if (item.y == null || item.y >= heading.y - 8) return false;
      return /answer\s*page|^answer:?$|^page:\s*\d/i.test(item.text.trim());
    });
    const footer = footers.sort((a, b) => (b.y ?? 0) - (a.y ?? 0))[0];
    const stops = [nextHeading?.y, footer?.y].filter((value): value is number => value != null);
    const boundary = stops.length ? Math.max(...stops) : 28;
    const top = Math.min(pageHeight - 8, heading.y + 16);
    const bottom = Math.max(24, Math.min(top - 24, boundary + 12));
    jobs.push({ id: label, boxes: [{ page: heading.page, top, bottom }] });
  }
  return jobs;
}

type Box = { x0: number; y0: number; x1: number; y1: number };

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

function area(box: Box): number {
  return Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);
}

/** Visible pictures in reading order: rows from the top of the page, then left to right. */
export function readingOrder(boxes: Box[]): Box[] {
  const kept: Box[] = [];
  for (const box of [...boxes].sort((a, b) => area(b) - area(a))) {
    if (kept.some((other) => overlapArea(box, other) >= 0.6 * Math.min(area(box), area(other)))) continue;
    kept.push(box);
  }
  const minHeight = Math.min(...kept.map((box) => box.y1 - box.y0));
  const center = (box: Box) => (box.y0 + box.y1) / 2;
  return kept.sort((a, b) => {
    if (Math.abs(center(a) - center(b)) > minHeight / 2) return center(b) - center(a);
    return a.x0 - b.x0;
  });
}

/**
 * Display-only figure crops for performance questions. Questions whose items are plain text
 * (ports, symptoms, steps) get no figure. Picture-per-item questions get one crop per picture;
 * other diagram questions get the pictures and their short labels, or the vector drawing with
 * the printed answer blanks whited out.
 */
function chromeFloor(chrome: { page: number; y?: number }[], page: number, below: number): number {
  return Math.max(20, ...chrome.filter((entry) => entry.page === page && entry.y != null && entry.y < below).map((entry) => (entry.y ?? 0) + 1));
}

export function pbqFigureJobs(input: {
  cards: { label: string; task: PbqTask }[];
  lines: LayoutLine[];
  chrome: { page: number; text: string; y?: number }[];
  pages: Pick<LayoutPage, 'page' | 'height' | 'width'>[];
  images: LayoutImage[];
}): RegionJob[] {
  const wanted = input.cards.filter((card) => pbqNeedsFigure(card.task));
  if (!wanted.length) return [];
  const regions = questionRegions({
    labels: wanted.map((card) => card.label),
    lines: input.lines,
    chrome: input.chrome,
    pages: input.pages,
  });
  const width = new Map(input.pages.map((page) => [page.page, page.width]));
  const jobs: RegionJob[] = [];
  for (const card of wanted) {
    const region = regions.find((job) => job.id === card.label)?.boxes[0];
    if (!region) continue;
    const pageLines = input.lines.filter((line) => line.page === region.page);
    const heading = pageLines
      .filter((line) => questionAnchorLabel(line.text) === card.label && line.y <= region.top)
      .sort((a, b) => b.y - a.y)[0];
    let top = region.top;
    if (heading) {
      top = heading.y - 5;
      const wrapped = pageLines
        .filter((line) => line.y < heading.y && line.y > heading.y - 18 && line.x > heading.x + 4)
        .sort((a, b) => b.y - a.y)[0];
      if (wrapped) top = wrapped.y - 5;
    }
    const bottom = region.bottom;
    const inside = input.images
      .filter((image) => image.page === region.page && image.w >= 20 && image.h >= 20)
      .map((image) => ({ x0: image.x, y0: image.y, x1: image.x + image.w, y1: image.y + image.h }))
      .filter((box) => box.y1 <= top + 4 && box.y0 >= bottom - 4);
    const pictures = inside.length ? readingOrder(inside) : [];
    if (pbqPicturePerItem(card.task) && pictures.length === card.task.items.length) {
      card.task.items.forEach((item, index) => {
        const box = pictures[index];
        jobs.push({
          id: `${card.label}#${item.id}`,
          boxes: [{ page: region.page, top: box.y1 + 1, bottom: box.y0 - 1, left: box.x0 - 1, right: box.x1 + 1 }],
        });
      });
      continue;
    }
    if (pictures.length) {
      const union: Box = {
        x0: Math.min(...pictures.map((box) => box.x0)),
        y0: Math.min(...pictures.map((box) => box.y0)),
        x1: Math.max(...pictures.map((box) => box.x1)),
        y1: Math.max(...pictures.map((box) => box.y1)),
      };
      for (const line of pageLines) {
        const text = line.text.trim();
        if (text.length > 2 || line.y > top || line.y < bottom - 14) continue;
        const near =
          line.x > union.x0 - 40 && line.x < union.x1 + 40 && line.y > union.y0 - 40 && line.y < union.y1 + 40;
        if (!near) continue;
        union.x0 = Math.min(union.x0, line.x - 12);
        union.x1 = Math.max(union.x1, line.x + 20);
        union.y0 = Math.min(union.y0, line.y - 10);
        union.y1 = Math.max(union.y1, line.y + 20);
      }
      const pageWidth = width.get(region.page) ?? 432;
      jobs.push({
        id: card.label,
        mask: true,
        boxes: [
          {
            page: region.page,
            top: Math.min(top, union.y1 + 4),
            bottom: Math.max(40, Math.min(bottom, union.y0 - 4)),
            left: Math.max(0, union.x0 - 4),
            right: Math.min(pageWidth, union.x1 + 4),
          },
        ],
      });
      continue;
    }
    // Drawings may run a line or two below the usual boundary; take the lowest body line that
    // is still above the page furniture.
    const chromeTop = chromeFloor(input.chrome, region.page, bottom) + 6;
    const lowest = pageLines
      .filter((line) => line.y < top && line.y >= chromeTop + 2)
      .reduce((min, line) => Math.min(min, Math.max(chromeTop, line.y - 4)), bottom);
    jobs.push({
      id: card.label,
      mask: true,
      labels: card.task.items.map((item) => item.prompt),
      boxes: [{ page: region.page, top, bottom: Math.max(20, lowest) }],
    });
  }
  return jobs;
}

import { questionAnchorLabel } from './figures';
import type { LayoutLine, LayoutPage } from './figures';

export type RegionBox = {
  page: number;
  /** PDF user space. top is the higher y (up the page). */
  top: number;
  bottom: number;
};

export type RegionJob = {
  id: string;
  boxes: RegionBox[];
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

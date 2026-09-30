import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractPdfStudy } from '../src/lib/pdfExtract';
import { parseDocument } from '../src/lib/parser';
import { gradePbq, previewLeaks } from '../src/lib/pbq';
import { questionRegions } from '../src/lib/regions';
import type { ParsedCard, PbqGrade } from '../src/lib/types';

const pdfPath = 'uploads/messer-aplus-core1-practice-exams_5c83.pdf';

const expected: Record<string, { format: string; items: number; controls: number; grade: PbqGrade }> = {
  A1: { format: 'match-two', items: 6, controls: 2, grade: 'exact' },
  A2: { format: 'pins', items: 8, controls: 1, grade: 'exact' },
  A3: { format: 'select', items: 7, controls: 1, grade: 'exact' },
  A4: { format: 'text', items: 6, controls: 1, grade: 'loose' },
  A5: { format: 'select', items: 7, controls: 1, grade: 'exact' },
  B1: { format: 'select', items: 6, controls: 1, grade: 'exact' },
  B2: { format: 'match-two', items: 6, controls: 2, grade: 'exact' },
  B3: { format: 'select', items: 5, controls: 1, grade: 'exact' },
  B4: { format: 'text', items: 4, controls: 1, grade: 'raid' },
  B5: { format: 'select', items: 7, controls: 1, grade: 'exact' },
  C1: { format: 'select', items: 8, controls: 1, grade: 'exact' },
  C2: { format: 'select', items: 6, controls: 1, grade: 'exact' },
  C3: { format: 'select', items: 6, controls: 1, grade: 'exact' },
  C4: { format: 'order', items: 5, controls: 0, grade: 'order' },
  C5: { format: 'text', items: 6, controls: 1, grade: 'ports' },
};

function questionSectionPages(extracted: {
  lines: { page: number; text: string }[];
  chrome: { page: number; text: string }[];
}): Map<number, 'question' | 'answer' | null> {
  const texts = new Map<number, string[]>();
  for (const item of [...extracted.chrome, ...extracted.lines]) {
    const list = texts.get(item.page) ?? [];
    list.push(item.text);
    texts.set(item.page, list);
  }
  const pages = [...texts.keys()].sort((a, b) => a - b);
  const section = new Map<number, 'question' | 'answer' | null>();
  let inherited: 'question' | 'answer' | null = null;
  for (const page of pages) {
    const blob = (texts.get(page) ?? []).join('\n');
    if (/performance[-\s]?based\s+answers|practice\s+exam\b.*-\s*answers/i.test(blob)) inherited = 'answer';
    else if (/performance[-\s]?based\s+questions|practice\s+exam\b.*-\s*questions/i.test(blob)) inherited = 'question';
    section.set(page, inherited);
  }
  return section;
}

function shape(card: ParsedCard | undefined): string {
  const task = card?.pbq;
  if (!task) return 'missing';
  const controls = task.items[0]?.controls.length ?? 0;
  const options = task.items[0]?.controls[0]?.options.length ?? 0;
  return `${task.format}/${task.grade}/${task.items.length}/${controls}/opts${options}`;
}

describe('real pdf performance questions', () => {
  it.skipIf(!existsSync(pdfPath))('parses all 15 PBQs with figures and no answer text before submit', async () => {
    const data = new Uint8Array(readFileSync(pdfPath));
    const extracted = await extractPdfStudy(data);
    const doc = parseDocument(extracted.textPages);
    const cards = new Map<string, ParsedCard>();
    let covered = 0;
    const leaks: string[] = [];
    for (const test of doc.tests) {
      for (const card of test.cards) {
        covered += 1;
        cards.set(card.sourceLabel, card);
        const found = previewLeaks(card);
        if (found.length) leaks.push(`${card.sourceLabel}:${found.length}`);
        expect(card.question.toLowerCase()).not.toContain('answer page');
        for (const choice of card.choices) {
          expect(choice.text).not.toMatch(/\bAnswer:\s*\d/i);
          expect(choice.text).not.toMatch(/The Details:/i);
        }
      }
    }
    expect(covered).toBe(270);
    expect(leaks).toEqual([]);

    const summary = Object.keys(expected).map((label) => `${label}:${shape(cards.get(label))}`);
    expect(summary).toEqual(
      Object.entries(expected).map(
        ([label, spec]) => `${label}:${spec.format}/${spec.grade}/${spec.items}/${spec.controls}/opts${cards.get(label)?.pbq?.items[0]?.controls[0]?.options.length ?? 0}`,
      ),
    );

    for (const [label, spec] of Object.entries(expected)) {
      const task = cards.get(label)?.pbq;
      expect(task, label).toBeTruthy();
      if (!task) continue;
      const values = task.items.map((item) => item.accept.map((entry) => entry[0] ?? ''));
      const order = [...task.items].sort((a, b) => a.place - b.place).map((item) => item.id);
      expect(gradePbq(task, values, order).correct, label).toBe(true);
      if (task.format === 'pins') {
        const key = task.items.map((item) => item.accept[0]?.[0] ?? '').join('|');
        const options = task.items[0]?.controls[0]?.options.join('|') ?? '';
        expect(options).not.toBe(key);
      }
      if (task.grade === 'raid') {
        const aliased = task.items.map((item) => [String((item.accept[0]?.[0] ?? '').match(/\d+/)?.[0] ?? '')]);
        expect(gradePbq(task, aliased).correct, label).toBe(true);
      }
      if (task.grade === 'ports') {
        const swapped = task.items.map((item) => {
          const nums = (item.accept[0]?.[0] ?? '').match(/\d+/g) ?? [];
          return [nums.slice().reverse().join('/')];
        });
        expect(gradePbq(task, swapped).correct, label).toBe(true);
      }
      if (spec.format === 'select' || spec.format === 'match-two' || spec.format === 'pins') {
        for (const item of task.items) {
          for (const control of item.controls) expect(control.options.length).toBeGreaterThan(1);
          for (const accepted of item.accept) expect(accepted[0]?.length ?? 0).toBeGreaterThan(0);
        }
      }
    }

    const jobs = questionRegions({
      labels: Object.keys(expected),
      lines: extracted.lines,
      chrome: extracted.chrome,
      pages: extracted.pageSizes,
    });
    const gotJobs = jobs.map((job) => job.id).sort();
    const wantJobs = Object.keys(expected).sort();
    expect(gotJobs.join(','), wantJobs.filter((id) => !gotJobs.includes(id)).join(',') || 'none missing').toEqual(
      wantJobs.join(','),
    );
    const section = questionSectionPages(extracted);
    for (const job of jobs) {
      expect(job.boxes.length).toBeGreaterThan(0);
      for (const box of job.boxes) {
        const chrome = extracted.chrome
          .filter((item) => item.page === box.page)
          .map((item) => item.text)
          .join('\n');
        expect(section.get(box.page), job.id).toBe('question');
        expect(chrome, job.id).not.toMatch(/practice\s+exam\b.*-\s*answers/i);
        expect(box.top).toBeGreaterThan(box.bottom);
      }
    }
    const rendered = await extracted.renderRegions(jobs);
    for (const label of Object.keys(expected)) {
      const blob = rendered.get(label);
      expect(blob, label).toBeTruthy();
      const bytes = new Uint8Array(await blob!.arrayBuffer());
      expect(bytes[0], label).toBe(0x89);
      expect(bytes[1], label).toBe(0x50);
      expect(bytes.byteLength, label).toBeGreaterThan(2000);
    }
  }, 180_000);
});

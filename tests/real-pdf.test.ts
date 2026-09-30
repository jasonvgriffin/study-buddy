import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractPdfPages } from '../src/lib/pdfExtract';
import { parseDocument } from '../src/lib/parser';

const pdfPath = 'uploads/messer-aplus-core1-practice-exams_5c83.pdf';

describe('real practice-exam PDF', () => {
  const present = existsSync(pdfPath);

  it.skipIf(!present)('splits into three 90-question tests without dropping the source text', async () => {
    const data = new Uint8Array(readFileSync(pdfPath));
    const pages = await extractPdfPages(data);
    const doc = parseDocument(pages);
    const normalized = pages
      .map((page) => page.lines.join('\n'))
      .join('\n')
      .replace(/\s+/g, ' ');
    const tests = doc.tests.map((test) => {
      let explained = 0;
      let linked = 0;
      let choices = 0;
      let keyed = 0;
      let missing = 0;
      const domains = new Map<string, number>();
      for (const card of test.cards) {
        if (card.explanation) explained += 1;
        if (card.lessonUrl) linked += 1;
        if (card.choices.length >= 2) choices += 1;
        if (card.correctLabels.length) keyed += 1;
        const snippet = card.question.replace(/\s+/g, ' ').slice(0, 48);
        if (snippet && !normalized.includes(snippet)) missing += 1;
        const domainKey = card.domainNumber == null ? 'none' : String(card.domainNumber);
        domains.set(domainKey, (domains.get(domainKey) ?? 0) + 1);
      }
      return {
        name: test.name,
        cards: test.cards.length,
        explained,
        linked,
        choices,
        keyed,
        missingFromSource: missing,
        domains: Object.fromEntries(domains),
      };
    });
    const summary = {
      pages: pages.length,
      domains: doc.domains.map((domain) => ({
        number: domain.number,
        weight: domain.weight,
        name: domain.name,
      })),
      tests,
    };
    writeFileSync('/tmp/study-buddy-parse.json', `${JSON.stringify(summary, null, 2)}\n`);
    expect(doc.tests.map((test) => test.name)).toEqual([
      'Practice Exam A',
      'Practice Exam B',
      'Practice Exam C',
    ]);
    doc.tests.forEach((test, index) => {
      const prefix = ['A', 'B', 'C'][index];
      expect(test.cards.map((card) => card.sourceLabel)).toEqual(
        Array.from({ length: 90 }, (_, number) => `${prefix}${number + 1}`),
      );
      expect(test.cards.filter((card) => card.explanation).length).toBe(90);
    });
    expect(tests.reduce((sum, test) => sum + test.missingFromSource, 0)).toBe(0);
    expect(doc.domains.map((domain) => domain.number)).toEqual([1, 2, 3, 4, 5]);
  });
});

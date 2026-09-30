import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assignFigures } from '../src/lib/figures';
import { extractPdfStudy } from '../src/lib/pdfExtract';

const pdfPath = 'uploads/messer-aplus-core1-practice-exams_5c83.pdf';

describe('real practice-exam figures', () => {
  const present = existsSync(pdfPath);

  it.skipIf(!present)(
    'maps embedded figures onto question labels without inventing any',
    async () => {
      const data = new Uint8Array(readFileSync(pdfPath));
      const extracted = await extractPdfStudy(data);
      const mapped = assignFigures({
        pageCount: extracted.pageCount,
        pages: extracted.pageSizes,
        lines: extracted.lines,
        chrome: extracted.chrome,
        images: extracted.images,
      });
      const labels = new Map<string, { question: number; explanation: number }>();
      for (const slot of mapped.slots) {
        if (!slot.questionImageIndexes.length && !slot.explanationImageIndexes.length) continue;
        labels.set(slot.sourceLabel, {
          question: slot.questionImageIndexes.length,
          explanation: slot.explanationImageIndexes.length,
        });
      }
      const report = {
        totalImages: extracted.images.length,
        captured: mapped.assignments.length,
        questionIds: [...labels.keys()],
        byLabel: [...labels.entries()].map(([label, counts]) => ({ label, ...counts })),
        excludedPages: mapped.excludedPages,
        unmappedPages: mapped.unmappedPages,
        imagePages: [...new Set(extracted.images.map((image) => image.page))].sort((a, b) => a - b),
      };
      writeFileSync('/tmp/study-buddy-figures.json', JSON.stringify(report, null, 2));
      expect(report.captured).toBeGreaterThan(0);
      expect(report.questionIds).toEqual(expect.arrayContaining(['A1', 'A2', 'A4', 'B2', 'C3']));
      expect(report.excludedPages).toEqual(expect.arrayContaining([1, 2, 400, 401]));
      expect(labels.get('A1')?.question).toBeGreaterThan(0);
      expect(labels.get('A1')?.explanation).toBeGreaterThan(0);
      expect(labels.get('C3')?.question).toBeGreaterThan(0);
    },
    180_000,
  );
});

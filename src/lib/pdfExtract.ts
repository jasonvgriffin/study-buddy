import { linesFromGlyphs, type Glyph } from './pdfLayout';
import type { TextPage } from './types';

type PdfItem = {
  str?: string;
  transform?: number[];
  width?: number;
};

type PdfPage = {
  getTextContent: () => Promise<{ items: PdfItem[] }>;
};

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
};

type PdfModule = {
  getDocument: (src: {
    data: Uint8Array;
    disableWorker?: boolean;
    useSystemFonts?: boolean;
  }) => { promise: Promise<PdfDoc> };
  GlobalWorkerOptions: { workerSrc: string };
};

async function openDocument(data: Uint8Array): Promise<PdfDoc> {
  if (typeof window === 'undefined') {
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfModule;
    return pdfjs.getDocument({ data, disableWorker: true, useSystemFonts: true }).promise;
  }
  const pdfjs = (await import('pdfjs-dist')) as unknown as PdfModule;
  const { workerUrl } = await import('./pdfWorker');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs.getDocument({ data }).promise;
}

export async function extractPdfPages(
  data: Uint8Array,
  onProgress?: (page: number, total: number) => void,
): Promise<TextPage[]> {
  const doc = await openDocument(data);
  const pages: TextPage[] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    onProgress?.(number, doc.numPages);
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const glyphs: Glyph[] = [];
    for (const item of content.items) {
      if (!item.str || !item.transform) continue;
      glyphs.push({
        str: item.str,
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        w: item.width ?? 0,
      });
    }
    pages.push({ lines: linesFromGlyphs(glyphs) });
    if (number % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return pages;
}

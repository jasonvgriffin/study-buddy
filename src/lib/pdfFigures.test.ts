import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { assignFigures } from './figures';
import { extractPdfStudy } from './pdfExtract';

function crc32(bytes: Buffer): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function greenPng(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 4;
      raw[i] = 20;
      raw[i + 1] = 160;
      raw[i + 2] = 70;
      raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('pdf figure extract', () => {
  it('keeps an embedded figure with the question and can store it as a PNG', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([612, 792]);
    page.drawText('Practice Test 1', { x: 54, y: 740, size: 16, font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText('1. What color is the square in the figure?', {
      x: 54,
      y: 700,
      size: 12,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText('a) Green', { x: 54, y: 670, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
    page.drawText('b) Red', { x: 54, y: 648, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
    const image = await doc.embedPng(greenPng(40, 40));
    page.drawImage(image, { x: 80, y: 480, width: 120, height: 100 });
    const answers = doc.addPage([612, 792]);
    answers.drawText('Answer Key', { x: 54, y: 740, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
    answers.drawText('1. a', { x: 54, y: 710, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
    answers.drawText('Detailed Answers', { x: 54, y: 670, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
    answers.drawText('1. a) Green', { x: 54, y: 640, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
    answers.drawText('The square in the figure is green.', { x: 54, y: 620, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
    const data = new Uint8Array(await doc.save());
    const extracted = await extractPdfStudy(data);
    const mapped = assignFigures({
      pageCount: extracted.pageCount,
      pages: extracted.pageSizes,
      lines: extracted.lines,
      chrome: extracted.chrome,
      images: extracted.images,
    });
    expect(mapped.assignments).toEqual([
      expect.objectContaining({ sourceLabel: '1', role: 'question' }),
    ]);
    const pngs = await extracted.rasterize(mapped.assignments.map((item) => item.imageIndex));
    const blob = pngs.get(mapped.assignments[0].imageIndex);
    expect(blob).toBeTruthy();
    const bytes = new Uint8Array(await blob!.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const check = await PDFDocument.create();
    await check.embedPng(bytes);
  });
});

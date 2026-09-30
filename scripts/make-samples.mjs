import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

async function textToPdf(text, outPath) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 12;
  const leading = 16;
  const margin = 54;
  let page = doc.addPage([612, 792]);
  let y = 740;
  const width = 612 - margin * 2;

  const drawLine = (line) => {
    if (y < margin + leading) {
      page = doc.addPage([612, 792]);
      y = 740;
    }
    const words = line.split(/\s+/).filter(Boolean);
    if (!words.length) {
      y -= leading;
      return;
    }
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && current) {
        page.drawText(current, { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
        y -= leading;
        if (y < margin + leading) {
          page = doc.addPage([612, 792]);
          y = 740;
        }
        current = word;
      } else {
        current = next;
      }
    }
    if (current) {
      page.drawText(current, { x: margin, y, size, font, color: rgb(0.1, 0.1, 0.1) });
      y -= leading;
    }
  };

  for (const line of text.split(/\r?\n/)) drawLine(line);
  const bytes = await doc.save();
  writeFileSync(outPath, bytes);
}

function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function solidPng(width, height, r, g, b) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
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
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function figurePdf(outPath) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.12, 0.16, 0.2);
  const page = doc.addPage([612, 792]);
  page.drawText('SAMPLE PDF - not part of any saved deck until you choose to save it.', {
    x: 54,
    y: 760,
    size: 10,
    font,
    color: ink,
  });
  page.drawText('Practice Test 1', { x: 54, y: 730, size: 16, font, color: ink });
  page.drawText('1. What color is the square in the figure?', { x: 54, y: 690, size: 12, font, color: ink });
  page.drawText('a) Green', { x: 54, y: 660, size: 12, font, color: ink });
  page.drawText('b) Red', { x: 54, y: 638, size: 12, font, color: ink });
  const image = await doc.embedPng(solidPng(48, 48, 20, 140, 70));
  page.drawImage(image, { x: 80, y: 460, width: 140, height: 110 });
  const answers = doc.addPage([612, 792]);
  answers.drawText('Answer Key', { x: 54, y: 740, size: 14, font, color: ink });
  answers.drawText('1. a', { x: 54, y: 710, size: 12, font, color: ink });
  answers.drawText('Detailed Answers', { x: 54, y: 670, size: 14, font, color: ink });
  answers.drawText('1. a) Green', { x: 54, y: 640, size: 12, font, color: ink });
  answers.drawText('The Answer: a) Green', { x: 54, y: 618, size: 12, font, color: ink });
  answers.drawText('The square in the figure is green.', { x: 54, y: 596, size: 12, font, color: ink });
  writeFileSync(outPath, await doc.save());
}

mkdirSync('public/samples', { recursive: true });
const three = readFileSync('fixtures/three-tests.txt', 'utf8');
const notes = readFileSync('fixtures/notes.txt', 'utf8');
await textToPdf(
  `SAMPLE PDF - not part of any saved deck until you choose to save it.\n\n${three}`,
  'public/samples/sample-three-tests.pdf',
);
await textToPdf(
  `SAMPLE PDF - not part of any saved deck until you choose to save it.\n\n${notes}`,
  'public/samples/sample-notes.pdf',
);
await figurePdf('public/samples/sample-figure.pdf');
console.log('wrote sample PDFs');

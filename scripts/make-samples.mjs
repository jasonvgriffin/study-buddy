import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
console.log('wrote sample PDFs');

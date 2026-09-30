/**
 * Build-time only. Resolves professormesser.link URLs from a local PDF
 * to YouTube video IDs by reading the lesson page embed, then confirms the
 * title with YouTube oEmbed. Writes link metadata only — no book text.
 *
 * Usage: node scripts/resolve-lessons.mjs [path-to-pdf]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = process.argv[2] ?? 'uploads/messer-aplus-core1-practice-exams_5c83.pdf';
const outPath = 'src/data/lesson-links.json';

if (!existsSync(pdfPath)) {
  console.log(`No PDF at ${pdfPath}; leaving ${outPath} unchanged.`);
  process.exit(0);
}

const data = new Uint8Array(readFileSync(pdfPath));
const doc = await getDocument({ data, disableWorker: true, useSystemFonts: true }).promise;
const urls = new Set();
for (let i = 1; i <= doc.numPages; i += 1) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
  for (const match of text.matchAll(/https?:\/\/professormesser\.link\/[A-Za-z0-9]+/g)) {
    urls.add(match[0]);
  }
}

const ua = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0.0.0 Mobile Safari/537.36';

async function resolveOne(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': ua } });
  if (!response.ok) throw new Error(`lesson page ${response.status}`);
  const html = await response.text();
  if (/Just a moment|One moment, please|cf-browser-verification/i.test(html.slice(0, 2000))) {
    throw new Error('bot interstitial');
  }
  const embed = html.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{11})/);
  if (!embed) throw new Error('no embed');
  const youtubeId = embed[1];
  const oembed = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`,
  );
  if (!oembed.ok) throw new Error(`oembed ${oembed.status}`);
  const meta = await oembed.json();
  if (meta.author_name !== 'Professor Messer') throw new Error(`unexpected author ${meta.author_name}`);
  return { youtubeId, title: meta.title };
}

mkdirSync('src/data', { recursive: true });
const map = {};
const failures = [];
const list = [...urls];
console.log(`unique lesson links: ${list.length}`);
for (const url of list) {
  try {
    map[url] = await resolveOne(url);
    console.log('ok', url, map[url].youtubeId);
  } catch (error) {
    failures.push(`${url} ${error.message}`);
    console.log('fail', url, error.message);
  }
}
writeFileSync(outPath, `${JSON.stringify(map, null, 2)}\n`);
console.log(`wrote ${Object.keys(map).length} verified ids, ${failures.length} failed`);

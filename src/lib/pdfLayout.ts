export type Glyph = {
  str: string;
  x: number;
  y: number;
  w: number;
};

/** Margin link column in exam PDFs: "Quick", "Answer: 31", "The Details: 44". */
export function isMarginChrome(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^(quick|the details:?|answer:?|page:?)$/i.test(t)) return true;
  if (/^quick\s+answer:?/i.test(t)) return true;
  if (/^the details:?/i.test(t)) return true;
  if (/^answer\s*page:?/i.test(t)) return true;
  if (/^answer:\s*\d{1,4}$/i.test(t)) return true;
  if (/^page:\s*\d{1,4}$/i.test(t)) return true;
  return false;
}

/** Running footers and bare page numbers. */
export function isFooterChrome(text: string): boolean {
  const t = text.trim();
  if (/practice\s+exam\s+[a-z0-9]+\s*-\s*(questions|answers)/i.test(t)) return true;
  if (/^[ivx]{2,6}$/i.test(t)) return true;
  return false;
}

function joinGlyphs(glyphs: Glyph[]): string {
  let text = '';
  let prev: Glyph | null = null;
  for (const g of glyphs) {
    if (prev) {
      const gap = g.x - (prev.x + prev.w);
      if (gap > 1.4 && text && !text.endsWith(' ') && !g.str.startsWith(' ')) text += ' ';
    }
    text += g.str;
    prev = g;
  }
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Rebuild reading order from PDF text glyphs.
 * A wide horizontal gap starts a new column so margin links are not glued
 * onto answer choices. Large vertical gaps become blank lines (paragraphs).
 */
export function linesFromGlyphs(glyphs: Glyph[]): string[] {
  const rows: { y: number; glyphs: Glyph[] }[] = [];
  for (const g of glyphs) {
    if (!g.str) continue;
    let row = rows.find((r) => Math.abs(r.y - g.y) < 2.4);
    if (!row) {
      row = { y: g.y, glyphs: [] };
      rows.push(row);
    }
    row.glyphs.push(g);
  }
  rows.sort((a, b) => b.y - a.y);

  const lines: string[] = [];
  let prevY: number | null = null;
  for (const row of rows) {
    if (prevY != null && prevY - row.y > 16) lines.push('');
    prevY = row.y;
    const sorted = [...row.glyphs].sort((a, b) => a.x - b.x);
    const clusters: Glyph[][] = [];
    let current: Glyph[] = [];
    let prev: Glyph | null = null;
    for (const g of sorted) {
      if (prev && g.x - (prev.x + prev.w) > 32 && current.length) {
        clusters.push(current);
        current = [];
      }
      current.push(g);
      prev = g;
    }
    if (current.length) clusters.push(current);

    for (const cluster of clusters) {
      const text = joinGlyphs(cluster);
      if (!text) continue;
      if (isMarginChrome(text) || isFooterChrome(text)) continue;
      lines.push(text);
    }
  }
  return lines;
}

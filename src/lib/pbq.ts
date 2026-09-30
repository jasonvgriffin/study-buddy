import type { ParsedCard, PbqGrade, PbqItem, PbqTask, PlacedLine } from './types';

export type Piece = PlacedLine & { page: number };

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normSpace(text: string): string {
  return clean(text).toLowerCase();
}

export function normToken(text: string): string {
  const lowered = text.toLowerCase().replace(/\b(tcp|udp)\s*\/\s*/g, '');
  const stripped = lowered.replace(/[^a-z0-9/]+/g, '');
  if (!stripped.includes('/')) return stripped;
  return stripped
    .split('/')
    .filter(Boolean)
    .sort()
    .join('/');
}

export function normRaid(text: string): string {
  const flat = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const match = flat.match(/^(?:raid)?(\d{1,2})$/);
  return match ? match[1] : flat.replace(/^raid/, '');
}

export function normPorts(text: string): string {
  const nums = text.match(/\d+/g) ?? [];
  return [...new Set(nums)].sort((a, b) => Number(a) - Number(b)).join(',');
}

function sameToken(guess: string, expected: string): boolean {
  const left = normToken(guess);
  const right = normToken(expected);
  return left.length > 0 && left === right;
}

function looseToken(guess: string, expected: string): boolean {
  if (sameToken(guess, expected)) return true;
  const left = normToken(guess);
  const right = normToken(expected);
  if (left.length < 3 || right.length < 3) return false;
  return left.includes(right) || right.includes(left);
}

export function answerMatches(guess: string, expected: string, grade: PbqGrade): boolean {
  if (grade === 'raid') return normRaid(guess).length > 0 && normRaid(guess) === normRaid(expected);
  if (grade === 'ports') return normPorts(guess).length > 0 && normPorts(guess) === normPorts(expected);
  if (grade === 'loose') return looseToken(guess, expected);
  return sameToken(guess, expected);
}

function controlMatches(guess: string, accept: string[], grade: PbqGrade): boolean {
  return accept.some((expected) => answerMatches(guess, expected, grade));
}

export type PbqControlResult = { correct: boolean; expected: string; given: string };
export type PbqItemResult = { id: string; correct: boolean; expected: string; controls: PbqControlResult[] };

export function gradePbq(
  task: PbqTask,
  values: string[][],
  orderIds?: string[],
): { correct: boolean; items: PbqItemResult[] } {
  if (task.grade === 'order') {
    const correctIds = [...task.items].sort((a, b) => a.place - b.place).map((item) => item.id);
    const given = orderIds ?? task.items.map((item) => item.id);
    const items = task.items.map((item) => {
      const at = given.indexOf(item.id);
      const correct = at === item.place;
      return {
        id: item.id,
        correct,
        expected: item.prompt,
        controls: [{ correct, expected: `Step ${item.place + 1}`, given: at >= 0 ? `Step ${at + 1}` : '' }],
      };
    });
    const correct = correctIds.length > 0 && correctIds.every((id, index) => given[index] === id);
    return { correct, items };
  }
  const items = task.items.map((item, index) => {
    const row = values[index] ?? [];
    const controls = item.controls.map((_, controlIndex) => {
      const accepted = item.accept[controlIndex] ?? [];
      const given = row[controlIndex] ?? '';
      return { correct: controlMatches(given, accepted, task.grade), expected: accepted[0] ?? '', given };
    });
    const correct =
      item.controls.length > 0 && item.accept.length === item.controls.length && controls.every((entry) => entry.correct);
    return {
      id: item.id,
      correct,
      expected: item.accept.map((list) => list[0] ?? '').filter(Boolean).join(' — '),
      controls,
    };
  });
  return { correct: items.length > 0 && items.every((item) => item.correct), items };
}

/** One line per sub-item with its correct answer, for review screens. */
export function pbqAnswerLines(task: PbqTask): { id: string; prompt: string; answer: string }[] {
  if (task.grade === 'order') {
    return correctOrder(task).map((item, index) => ({ id: item.id, prompt: `Step ${index + 1}`, answer: item.prompt }));
  }
  return task.items.map((item) => ({
    id: item.id,
    prompt: item.prompt,
    answer: item.controls
      .map((control, index) => {
        const value = item.accept[index]?.[0] ?? '';
        return item.controls.length > 1 && control.title ? `${control.title}: ${value}` : value;
      })
      .join(' · '),
  }));
}

const GENERIC_PROMPT = /^(?:(?:picture|diagram|pin|image|figure|interface|item)\s*\d{1,2}|[A-Z])$/i;

/** True when the items only make sense next to a picture (Picture 1, Pin 3, A–F). */
export function pbqNeedsFigure(task: PbqTask): boolean {
  return task.items.length > 0 && task.items.every((item) => GENERIC_PROMPT.test(item.prompt.trim()));
}

/** True when each item is one separate picture on the page (Picture N, or a lettered photo). */
export function pbqPicturePerItem(task: PbqTask): boolean {
  return (
    pbqNeedsFigure(task) &&
    task.items.every((item) => /^(?:picture\s*\d{1,2}|[A-Z])$/i.test(item.prompt.trim()))
  );
}

function hasSentence(text: string): boolean {
  return /[A-Za-z]{3,}[^.!?]*\b[a-z]{2,}\b[^.!?]*[.!?]/.test(text) && text.split(/\s+/).length >= 6;
}

function findWord(haystack: string, needle: string, from = 0): number {
  if (!needle) return -1;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const pattern = new RegExp(`(^|[^a-z0-9])${escaped}(?=[^a-z0-9]|$)`, 'g');
  pattern.lastIndex = from;
  const hit = pattern.exec(haystack);
  return hit ? hit.index + hit[1].length : -1;
}

export function itemExplanations(task: PbqTask, explanation: string | null): {
  perItem: Map<string, string>;
  shared: string | null;
} {
  const text = (explanation ?? '').replace(/\s+/g, ' ').trim();
  const shared = text && hasSentence(text) ? text : null;
  const empty = { perItem: new Map<string, string>(), shared };
  if (!text) return empty;
  const lower = text.toLowerCase();
  const ordered = task.grade === 'order' ? correctOrder(task) : task.items;
  type Anchor = { id: string; start: number; end: number };
  const anchors: Anchor[] = [];
  for (const item of ordered) {
    const prompt = item.prompt.trim();
    const words = prompt.split(/\s+/);
    const values = item.accept.map((list) => list[0] ?? '').filter(Boolean);
    const literalPrompt = !GENERIC_PROMPT.test(prompt);
    const promptNeedles = /^[A-Z]$/.test(prompt)
      ? [prompt]
      : literalPrompt && words.length > 3
        ? [words.slice(-3).join(' ')]
        : [];
    const heads = task.grade === 'order' || literalPrompt
      ? [prompt, words.slice(0, 5).join(' '), words.slice(0, 3).join(' ')]
      : [values[0] ?? (/^[A-Z]$/.test(prompt) ? prompt : '')];
    let anchorNeedle = '';
    let at = -1;
    for (const head of heads) {
      const low = head.toLowerCase();
      const hit = findWord(lower, low);
      if (hit >= 0) {
        anchorNeedle = low;
        at = hit;
        break;
      }
    }
    if (at < 0) return empty;
    let start = at;
    let end = at + anchorNeedle.length;
    for (const needle of [...values, ...promptNeedles]) {
      const low = needle.toLowerCase();
      if (!low || low === anchorNeedle) continue;
      let best = -1;
      for (let hit = findWord(lower, low); hit >= 0; hit = findWord(lower, low, hit + 1)) {
        if (Math.abs(hit - at) <= 240 && (best < 0 || Math.abs(hit - at) < Math.abs(best - at))) best = hit;
      }
      if (best < 0) continue;
      start = Math.min(start, best);
      end = Math.max(end, best + low.length);
    }
    anchors.push({ id: item.id, start, end });
  }
  anchors.sort((left, right) => left.start - right.start);
  for (let index = 1; index < anchors.length; index += 1) {
    if (anchors[index].start < anchors[index - 1].end) return empty;
  }
  const perItem = new Map<string, string>();
  anchors.forEach((anchor, index) => {
    const next = anchors[index + 1];
    let passage = text.slice(anchor.end, next ? next.start : text.length).replace(/^[\s:–—-]+/, '').trim();
    const item = ordered.find((entry) => entry.id === anchor.id);
    const values = (item?.accept ?? []).map((list) => list[0] ?? '').filter(Boolean);
    for (let guard = 0; guard < 6; guard += 1) {
      const before = passage;
      passage = passage.replace(/^[A-Z][a-z]+:\s*/, '');
      for (const value of values) {
        const rest = passage.slice(value.length);
        // Drop a repeated answer label, but keep it when it is the subject of the next sentence.
        if (!passage.toLowerCase().startsWith(value.toLowerCase())) continue;
        const doubled = rest.toLowerCase().startsWith(value.toLowerCase());
        if (doubled || (!/^[A-Za-z0-9]/.test(rest) && !/^\s*[a-z(]/.test(rest))) passage = rest.trim();
      }
      if (passage === before) break;
    }
    passage = passage.replace(/\s+[A-Z][a-z]+:$/, '').trim();
    // A leftover lowercase tail of the prompt ("for visitors An access point ...").
    passage = passage.replace(/^(?:[a-z][\w'-]*\s){1,3}(?=[A-Z][a-z]*\s+[a-z])/, '');
    if (hasSentence(passage)) perItem.set(anchor.id, passage);
  });
  if (perItem.size * 2 < anchors.length) return empty;
  return { perItem, shared };
}

export function preSubmitText(card: Pick<ParsedCard, 'question' | 'choices' | 'pbq'>): string {
  if (!card.pbq) {
    return [card.question, ...card.choices.map((choice) => choice.text)].join('\n');
  }
  const parts = [card.pbq.instruction];
  for (const item of card.pbq.items) {
    parts.push(item.prompt);
    for (const control of item.controls) parts.push(control.title, ...control.options);
  }
  return parts.join('\n');
}

/** Explanation lines that would be visible before submit. Prompts and choice lists are allowed. */
export function previewLeaks(card: ParsedCard): string[] {
  const visible = normSpace(preSubmitText(card));
  const allowed = allowedChunks(card);
  const leaks: string[] = [];
  const source = `${card.explanation ?? ''}\n${card.answer ?? ''}`;
  for (const raw of source.split(/\n+/)) {
    const chunk = normSpace(raw);
    if (chunk.length < 40) continue;
    if (
      allowed.some(
        (entry) =>
          entry.length > 12 &&
          (chunk === entry || entry.includes(chunk) || (chunk.includes(entry) && chunk.length < entry.length + 12)),
      )
    ) {
      continue;
    }
    if (visible.includes(chunk)) leaks.push(chunk);
  }
  if (/answer\s*page/i.test(card.question)) leaks.push('answer page');
  if (/answer\s*page/i.test(preSubmitText(card))) leaks.push('answer page in preview');
  return leaks;
}

function allowedChunks(card: ParsedCard): string[] {
  const chunks = [normSpace(card.question)];
  for (const choice of card.choices) chunks.push(normSpace(choice.text));
  if (!card.pbq) return chunks;
  chunks.push(normSpace(card.pbq.instruction));
  for (const item of card.pbq.items) {
    chunks.push(normSpace(item.prompt));
    for (const control of item.controls) {
      chunks.push(normSpace(control.title));
      for (const option of control.options) chunks.push(normSpace(option));
    }
  }
  return chunks.filter(Boolean);
}

export function correctOrder(task: PbqTask): PbqItem[] {
  return [...task.items].sort((a, b) => a.place - b.place);
}

function isDash(text: string): boolean {
  const dashes = (text.match(/-/g) ?? []).length;
  return dashes >= 6 && dashes > text.replace(/[-\s]/g, '').length;
}

function isMeta(text: string): boolean {
  return /^(more information:?|https?:\/\/)/i.test(text.trim()) || /^\d{3}-\d{4}\b/.test(text.trim());
}

function isHeader(text: string): boolean {
  return /^(pick an |pick a |symptoms|resolutions|interfaces:?|common uses:?|printer issues:?|troubleshooting options:?|possible causes:?|interface name|common use)$/i.test(
    text.trim(),
  );
}

function isInstructionNote(text: string): boolean {
  return /^(not all|some possible)\b/i.test(text.trim());
}

function isProse(text: string): boolean {
  const t = text.trim();
  if (isHeader(t) || isDash(t) || isMeta(t)) return false;
  const words = t.split(/\s+/).length;
  if (words >= 8 && t.length >= 55) return true;
  if (t.length > 42 && /[.!?]/.test(t)) return true;
  // The tail of a wrapped sentence, such as a line carried onto the next page.
  if (/^[a-z]/.test(t) && /[.!?]$/.test(t) && t.split(/\s+/).length >= 3) return true;
  return false;
}

function sortOptions(options: string[]): string[] {
  return [...new Set(options.map((option) => clean(option)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

function item(id: string, prompt: string, controls: PbqItem['controls'], accept: string[][], place = 0): PbqItem {
  return { id, prompt, controls, accept, place };
}

function selectControl(title: string, options: string[]): PbqItem['controls'][number] {
  return { kind: 'select', title, options: sortOptions(options) };
}

function textControl(title = 'Answer'): PbqItem['controls'][number] {
  return { kind: 'text', title, options: [] };
}

function takeInstruction(rows: Piece[]): { instruction: string; rest: Piece[] } {
  if (!rows.length) return { instruction: '', rest: [] };
  const buf: Piece[] = [rows[0]];
  let cursor = 1;
  for (; cursor < rows.length; cursor += 1) {
    const prev = buf[buf.length - 1]?.text ?? '';
    const row = rows[cursor];
    if (isHeader(row.text)) break;
    if (isInstructionNote(row.text)) {
      buf.push(row);
      continue;
    }
    const ended = /[.?:]\s*$/.test(prev);
    if (!ended) {
      buf.push(row);
      continue;
    }
    break;
  }
  return { instruction: clean(buf.map((row) => row.text).join(' ')), rest: rows.slice(cursor) };
}

function skipIntro(rows: Piece[], instruction: string): Piece[] {
  const intro = normSpace(instruction);
  let consumed = '';
  let index = 0;
  for (; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) break;
    const text = normSpace(row.text);
    if (!text || isDash(row.text)) continue;
    if (isMeta(row.text)) break;
    const folded = text.replace(/[^a-z0-9]+/g, ' ').trim();
    const foldedIntro = intro.replace(/[^a-z0-9]+/g, ' ').trim();
    if (folded.length > 24 && foldedIntro.includes(folded)) continue;
    const next = normSpace(clean(`${consumed} ${text}`));
    if (intro && (intro === next || intro.startsWith(next))) {
      consumed = next;
      if (intro === next) {
        index += 1;
        break;
      }
      continue;
    }
    break;
  }
  return rows.slice(index).filter((row) => clean(row.text) && !isMeta(row.text));
}

function splitGroups(rows: Piece[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) groups.push(current);
    current = [];
  };
  for (const row of rows) {
    if (isMeta(row.text)) break;
    if (isDash(row.text) || isProse(row.text) || isHeader(row.text)) {
      flush();
      continue;
    }
    current.push(clean(row.text));
  }
  flush();
  return groups.filter((group) => group.length > 0);
}

function buildPins(instruction: string, answer: Piece[]): PbqTask | null {
  if (!/\bpin\b/i.test(instruction)) return null;
  const shorts: string[] = [];
  for (const row of skipIntro(answer, instruction)) {
    if (isProse(row.text) || isDash(row.text)) break;
    const text = clean(row.text);
    if (!text || /^[^a-z0-9]+$/i.test(text)) continue;
    shorts.push(text);
  }
  if (shorts.length < 4) return null;
  const options = sortOptions(shorts);
  return {
    format: 'pins',
    grade: 'exact',
    instruction,
    items: shorts.map((color, index) =>
      item(`pin-${index + 1}`, `Pin ${index + 1}`, [selectControl('Color', options)], [[color]]),
    ),
  };
}

function buildOrder(instruction: string, rest: Piece[], answer: Piece[]): PbqTask | null {
  if (!/correct order|place these|in order/i.test(instruction)) return null;
  const steps = rest.map((row) => clean(row.text)).filter((text) => text && !isHeader(text) && !isInstructionNote(text));
  if (steps.length < 2) return null;
  const ranked: string[] = [];
  for (const row of skipIntro(answer, instruction)) {
    if (isProse(row.text)) continue;
    const hit = steps.find((step) => normSpace(step) === normSpace(row.text));
    if (hit && !ranked.includes(hit)) ranked.push(hit);
  }
  if (ranked.length !== steps.length) return null;
  return {
    format: 'order',
    grade: 'order',
    instruction,
    items: steps.map((step, index) => item(`step-${index + 1}`, step, [], [], ranked.indexOf(step))),
  };
}

function undupe(text: string): string {
  const value = clean(text);
  if (value.length >= 8 && value.length % 2 === 0) {
    const half = value.length / 2;
    if (value.slice(0, half) === value.slice(half)) return value.slice(0, half);
  }
  return value;
}

function buildPorts(instruction: string, rest: Piece[], answer: Piece[]): PbqTask | null {
  let blanks = rest.filter((row) => /[_＿]{2,}/.test(row.text));
  if (blanks.length < 2 && /fill in the blank/i.test(instruction) && /port/i.test(instruction)) {
    blanks = rest.filter((row) => clean(row.text).length > 12 && !isHeader(row.text));
  }
  if (blanks.length < 2) return null;
  const prompts = blanks.map((row) => clean(row.text.replace(/^[\s_＿.\-–—:]+/, '').replace(/_+/g, ' ')));
  const keys: { ports: string; prompt: string }[] = [];
  const answerRows = skipIntro(answer, instruction).filter((row) => !isDash(row.text) && !isHeader(row.text));
  for (let index = 0; index < answerRows.length; index += 1) {
    const row = answerRows[index];
    if (!row) continue;
    const combined = clean(row.text).match(/^(\d[\d\s,/+-]*)\s+-\s+(.+)$/);
    if (combined) {
      keys.push({ ports: clean(combined[1]), prompt: clean(combined[2]) });
      continue;
    }
    if (/^\d[\d\s,/+-]*$/.test(clean(row.text))) {
      const next = answerRows[index + 1];
      const prompt = next ? clean(next.text.replace(/^[\s\-–—:]+/, '')) : '';
      if (prompt && !/^\d/.test(prompt)) {
        keys.push({ ports: clean(row.text), prompt });
        index += 1;
      }
    }
  }
  if (keys.length < blanks.length) return null;
  const items = prompts.map((prompt, index) => {
    const key =
      keys.find((entry) => normSpace(entry.prompt) === normSpace(prompt)) ??
      keys.find((entry) => normSpace(prompt).includes(normSpace(entry.prompt)) || normSpace(entry.prompt).includes(normSpace(prompt))) ??
      keys[index];
    return item(`blank-${index + 1}`, prompt, [textControl('Port')], [[key?.ports ?? '']]);
  });
  if (items.some((entry) => !entry.accept[0]?.[0])) return null;
  return { format: 'text', grade: 'ports', instruction, items };
}

function buildRaid(instruction: string, answer: Piece[]): PbqTask | null {
  if (!/fill in the blank|raid/i.test(instruction)) return null;
  const levels = skipIntro(answer, instruction)
    .map((row) => clean(row.text))
    .filter((text) => /^raid\s*\d+/i.test(text));
  if (levels.length < 2) return null;
  return {
    format: 'text',
    grade: 'raid',
    instruction,
    items: levels.map((level, index) => item(`raid-${index + 1}`, `Diagram ${index + 1}`, [textControl('RAID level')], [[level]])),
  };
}

function buildMatchTwo(instruction: string, answer: Piece[]): PbqTask | null {
  if (!/picture|common use|name and|pick an interface|pick a common/i.test(instruction)) return null;
  const groups = splitGroups(skipIntro(answer, instruction)).filter((group) => group.length >= 2 && group.length <= 6);
  if (groups.length < 2) return null;
  const names = groups.map((group) => group[0] ?? '');
  const uses = groups.map((group) => clean(group.slice(1).join(' ')));
  if (uses.some((use) => !use || isProse(use))) return null;
  return {
    format: 'match-two',
    grade: 'exact',
    instruction,
    items: names.map((name, index) =>
      item(
        `pic-${index + 1}`,
        `Picture ${index + 1}`,
        [selectControl('Name', names), selectControl('Use', uses)],
        [[name], [uses[index] ?? '']],
      ),
    ),
  };
}

function letterOptions(rest: Piece[]): { label: string; text: string }[] {
  const found: { label: string; text: string }[] = [];
  const used = new Set<Piece>();
  const bands = new Map<string, Piece[]>();
  for (const row of rest) {
    const key = `${row.page}:${Math.round(row.y)}`;
    const band = bands.get(key) ?? [];
    band.push(row);
    bands.set(key, band);
  }
  for (const band of bands.values()) {
    const sorted = [...band].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i += 1) {
      const row = sorted[i];
      if (!row || used.has(row)) continue;
      const match = row.text.match(/^([A-H])(?:\s+(.+))?$/);
      if (!match) continue;
      let text = match[2]?.trim() ?? '';
      const next = sorted[i + 1];
      if (!text && next && !/^[A-H](?:\s|$)/.test(next.text)) {
        text = next.text.trim();
        used.add(next);
      }
      if (!text) continue;
      used.add(row);
      found.push({ label: match[1].toUpperCase(), text: clean(`${match[1].toUpperCase()} ${text}`) });
    }
  }
  return found;
}

function wrappedPrompts(rows: Piece[]): string[] {
  const groups: Piece[][] = [];
  for (const row of rows) {
    const prev = groups[groups.length - 1];
    const last = prev?.[prev.length - 1];
    const close =
      last &&
      last.page === row.page &&
      Math.abs(last.y - row.y) < 22 &&
      Math.abs(last.x - row.x) < 90;
    if (prev && close) prev.push(row);
    else groups.push([row]);
  }
  return groups.map((group) => clean(group.map((row) => row.text).join(' '))).filter((text) => text.length > 8);
}

function promptsUntil(rest: Piece[], stop: RegExp): string[] {
  const rows: Piece[] = [];
  for (const row of rest) {
    if (stop.test(row.text)) break;
    if (isHeader(row.text) || isInstructionNote(row.text)) continue;
    if (/^[A-H](?:\s|$)/.test(row.text)) continue;
    rows.push(row);
  }
  return wrappedPrompts(rows);
}

function buildLettered(instruction: string, rest: Piece[], answer: Piece[]): PbqTask | null {
  const options = letterOptions(rest);
  if (options.length < 4) return null;
  const stop = /resolutions|troubleshooting options/i;
  const prompts = promptsUntil(rest, stop);
  if (prompts.length < 2) return null;
  const assigned = new Map<number, string>();
  const seenLetters: string[] = [];
  for (const row of skipIntro(answer, instruction)) {
    const solo = row.text.trim().match(/^([A-H])$/);
    const known = options.find((entry) => normSpace(entry.text) === normSpace(row.text));
    if (known) seenLetters.push(known.label);
    else if (solo) seenLetters.push(solo[1].toUpperCase());
  }
  if (seenLetters.length === prompts.length) {
    prompts.forEach((_, index) => {
      const option = options.find((entry) => entry.label === seenLetters[index]);
      if (option) assigned.set(index, option.text);
    });
  }
  let buf: string[] = [];
  let current = -1;
  const matchPrompt = (text: string) =>
    prompts.findIndex((prompt) => {
      const left = normSpace(prompt);
      const right = normSpace(text);
      if (!left || !right) return false;
      if (right === left || left.endsWith(right) || right.endsWith(left)) return true;
      const words = (value: string) => value.split(' ').filter((word) => word.length > 2);
      const promptWords = words(left);
      const seen = words(right);
      if (promptWords.length < 3 || seen.length < 3) return false;
      const hits = promptWords.filter((word) => seen.includes(word)).length;
      return hits / promptWords.length >= 0.75 && seen.length <= promptWords.length + 4;
    });
  for (const row of skipIntro(answer, instruction)) {
    const letter = row.text.match(/^([A-H])(?:\s+(\S.*))?$/);
    if (letter && (letter[2] || row.text.trim().length === 1)) {
      const idx = matchPrompt(buf.join(' '));
      if (idx >= 0) current = idx;
      buf = [];
      const option = options.find((entry) => entry.label === letter[1].toUpperCase());
      if (option && current >= 0 && !assigned.has(current)) assigned.set(current, option.text);
      continue;
    }
    if (isDash(row.text)) {
      buf = [];
      continue;
    }
    buf.push(row.text);
    const idx = matchPrompt(buf.join(' '));
    if (idx >= 0) {
      current = idx;
      buf = [];
      continue;
    }
    if (isProse(row.text)) buf = [];
  }
  if (assigned.size < prompts.length) return null;
  const choices = options.map((option) => option.text);
  return {
    format: 'select',
    grade: 'exact',
    instruction,
    items: prompts.map((prompt, index) =>
      item(`row-${index + 1}`, prompt, [selectControl('Choice', choices)], [[assigned.get(index) ?? '']]),
    ),
  };
}

function buildProtocolPorts(instruction: string, rest: Piece[], answer: Piece[]): PbqTask | null {
  const ports = rest.map((row) => clean(row.text)).filter((text) => /^(tcp|udp)\/\d+$/i.test(text));
  const protocols = rest.map((row) => clean(row.text)).filter((text) => /^[A-Z][A-Z0-9]{1,7}$/.test(text));
  if (ports.length < 4 || protocols.length < 2) return null;
  const keys = new Map<string, string>();
  const answerRows = skipIntro(answer, instruction);
  for (let index = 0; index < answerRows.length; index += 1) {
    const row = answerRows[index];
    if (!row) continue;
    const match = row.text.match(/^((?:tcp|udp)\/\d+)\s+([A-Za-z][A-Za-z0-9]+)\b/i);
    if (match) {
      keys.set(match[2].toUpperCase(), clean(match[1]));
      continue;
    }
    const portOnly = row.text.match(/^((?:tcp|udp)\/\d+)$/i);
    const next = answerRows[index + 1]?.text ?? '';
    const protocol = next.match(/^([A-Za-z][A-Za-z0-9]+)\b/);
    if (portOnly && protocol) keys.set(protocol[1].toUpperCase(), clean(portOnly[1]));
  }
  if ([...keys.keys()].length < protocols.length) return null;
  return {
    format: 'select',
    grade: 'exact',
    instruction,
    items: protocols.map((protocol, index) =>
      item(`proto-${index + 1}`, protocol, [selectControl('Port', ports)], [[keys.get(protocol.toUpperCase()) ?? '']]),
    ),
  };
}

function buildSymptoms(instruction: string, rest: Piece[], answer: Piece[]): PbqTask | null {
  const prompts = rest
    .filter((row) => /^symptom:/i.test(row.text))
    .map((row) => clean(row.text.replace(/^symptom:\s*/i, '')));
  if (prompts.length < 2) return null;
  const causeAt = rest.findIndex((row) => /^possible causes:?/i.test(row.text));
  const causeRows = causeAt >= 0 ? rest.slice(causeAt + 1) : [];
  const options = causeRows
    .map((row) => undupe(row.text))
    .filter((text) => text && !isHeader(text) && !/^cause:?$/i.test(text) && !/^symptom:/i.test(text));
  if (options.length < prompts.length) return null;
  const assigned: string[] = [];
  let pending = '';
  const answerRows = skipIntro(answer, instruction);
  for (let index = 0; index < answerRows.length; index += 1) {
    const row = answerRows[index];
    if (!row || isDash(row.text)) continue;
    const symptom = row.text.match(/^symptom:\s*(.+)$/i);
    if (symptom) {
      pending = clean(symptom[1]);
      continue;
    }
    const asPrompt = prompts.find((prompt) => {
      const left = normSpace(prompt);
      const right = normSpace(row.text);
      return left === right || (right.length > 24 && (left.startsWith(right) || right.startsWith(left)));
    });
    if (asPrompt && !/^cause:/i.test(row.text)) {
      pending = asPrompt;
      continue;
    }
    const cause = row.text.match(/^cause:\s*(.*)$/i);
    const rawValue = cause ? undupe(cause[1] ?? '') || undupe(answerRows[index + 1]?.text ?? '') : undupe(row.text);
    if (pending && (cause || options.some((entry) => normSpace(entry) === normSpace(rawValue) || normSpace(entry).startsWith(normSpace(rawValue))))) {
      const idx = prompts.findIndex((prompt) => {
        const left = normSpace(prompt);
        const right = normSpace(pending);
        return left === right || left.startsWith(right) || right.startsWith(left);
      });
      const option = options.find(
        (entry) =>
          normSpace(entry) === normSpace(rawValue) ||
          normSpace(rawValue).startsWith(normSpace(entry)) ||
          normSpace(entry).startsWith(normSpace(rawValue)),
      );
      if (idx >= 0 && option) assigned[idx] = option;
      if (cause || option) pending = '';
    }
  }
  if (assigned.filter(Boolean).length < prompts.length) return null;
  return {
    format: 'select',
    grade: 'exact',
    instruction,
    items: prompts.map((prompt, index) =>
      item(`sym-${index + 1}`, prompt, [selectControl('Cause', options)], [[assigned[index] ?? '']]),
    ),
  };
}

function buildLabeledPictures(instruction: string, rest: Piece[], answer: Piece[]): PbqTask | null {
  const letters = rest.filter((row) => /^[A-F]$/.test(row.text.trim()));
  const phrases = rest
    .filter((row) => !/^[A-F]$/.test(row.text.trim()) && !isHeader(row.text) && !isInstructionNote(row.text))
    .map((row) => clean(row.text))
    .filter((text) => text.length > 3);
  if (letters.length < 4 || phrases.length < 2 || phrases.length > 12) return null;
  const order = [...letters].sort((a, b) => b.y - a.y || a.x - b.x).map((row) => row.text.trim());
  const uniqueLetters = [...new Set(order)];
  if (uniqueLetters.length < 6) return null;
  const assigned = new Map<string, string>();
  let pendingPhrase = '';
  let pendingLetter = '';
  const remember = (letter: string, phrase: string) => {
    assigned.set(letter, phrase);
    pendingPhrase = '';
    pendingLetter = '';
  };
  for (const row of skipIntro(answer, instruction)) {
    if (isProse(row.text) || isDash(row.text)) continue;
    const combined = row.text.match(/^([A-F])\s+(.+)$/);
    const combinedPhrase = combined
      ? phrases.find((phrase) => {
          const left = normSpace(phrase);
          const right = normSpace(combined[2] ?? '');
          return left === right || left.includes(right) || right.includes(left);
        })
      : undefined;
    if (combined && combinedPhrase) {
      remember(combined[1], combinedPhrase);
      continue;
    }
    if (/^[A-F]$/.test(row.text.trim())) {
      const letter = row.text.trim();
      if (pendingPhrase) remember(letter, pendingPhrase);
      else pendingLetter = letter;
      continue;
    }
    const phrase = phrases.find((entry) => normSpace(entry) === normSpace(row.text));
    if (!phrase) continue;
    if (pendingLetter) remember(pendingLetter, phrase);
    else pendingPhrase = phrase;
  }
  if (uniqueLetters.some((letter) => !assigned.get(letter))) return null;
  return {
    format: 'select',
    grade: 'exact',
    instruction,
    items: uniqueLetters.map((letter, index) =>
      item(`label-${letter}`, letter, [selectControl('Device', phrases)], [[assigned.get(letter) ?? '']], index),
    ),
  };
}

function buildPlainLabels(instruction: string, rest: Piece[], answer: Piece[]): PbqTask | null {
  const letters = rest.filter((row) => /^[A-F]$/.test(clean(row.text)));
  const others = rest.filter(
    (row) => !/^[A-F]$/.test(clean(row.text)) && !isHeader(row.text) && !isInstructionNote(row.text) && clean(row.text),
  );
  if (letters.length < 4 || others.length > 0) return null;
  const ordered = [...letters].sort((a, b) => b.y - a.y || a.x - b.x);
  const unique: string[] = [];
  for (const row of ordered) {
    const label = clean(row.text);
    if (!unique.includes(label)) unique.push(label);
  }
  const names: string[] = [];
  for (const row of skipIntro(answer, instruction)) {
    if (isProse(row.text) || isMeta(row.text)) break;
    const text = clean(row.text);
    if (!text || names[names.length - 1] === text) continue;
    const parts = text
      .split(/(?<=[a-z])\s+(?=[A-Z]{2,})/)
      .map((part) => clean(part))
      .filter(Boolean);
    names.push(...parts);
  }
  if (names.length !== unique.length) return null;
  return {
    format: 'text',
    grade: 'loose',
    instruction,
    items: unique.map((label, index) => item(`part-${label}`, label, [textControl('Name')], [[names[index] ?? '']])),
  };
}

function optionTokens(rest: Piece[]): string[] {
  return rest
    .map((row) => clean(row.text))
    .filter((text) => {
      if (!text || isHeader(text) || isInstructionNote(text)) return false;
      if (text.length > 32 || text.split(/\s+/).length > 3) return false;
      if (/[.!?]$/.test(text)) return false;
      if (/^(symptom|cause):/i.test(text)) return false;
      return true;
    });
}

function buildBankSelect(instruction: string, rest: Piece[], answer: Piece[]): PbqTask | null {
  const firstLong = rest.findIndex((row) => {
    const text = clean(row.text);
    return text.length > 36 || text.split(/\s+/).length > 4;
  });
  if (firstLong < 1) return null;
  const options = [...new Set(optionTokens(rest.slice(0, firstLong)))];
  const promptRows = rest.slice(firstLong).filter((row) => {
    const text = clean(row.text);
    return text.length > 12 && !options.includes(text) && !isHeader(text) && !isInstructionNote(text);
  });
  const prompts = wrappedPrompts(promptRows);
  if (options.length < 3 || prompts.length < 2 || options.length < prompts.length) return null;
  const assigned = pairOptions(prompts, options, skipIntro(answer, instruction));
  if (assigned.some((value) => !value)) return null;
  return {
    format: 'select',
    grade: 'exact',
    instruction,
    items: prompts.map((prompt, index) =>
      item(`item-${index + 1}`, prompt, [selectControl('Choice', options)], [[assigned[index] ?? '']]),
    ),
  };
}

function pairOptions(prompts: string[], options: string[], answer: Piece[]): (string | null)[] {
  const result: (string | null)[] = prompts.map(() => null);
  let collecting: string[] = [];
  let seen: string[] = [];
  const match = (text: string) => {
    const right = normSpace(text);
    if (right.length < 12) return -1;
    return prompts.findIndex((prompt, index) => {
      if (result[index]) return false;
      const left = normSpace(prompt);
      return right === left || (left.length > 18 && (right.includes(left) || left.includes(right)));
    });
  };
  const commit = () => {
    const idx = match(collecting.join(' '));
    if (idx >= 0 && seen.length) {
      result[idx] = seen[seen.length - 1] ?? null;
      collecting = [];
      seen = [];
    }
  };
  for (const row of answer) {
    if (isMeta(row.text)) break;
    if (isDash(row.text) || isProse(row.text)) {
      commit();
      collecting = [];
      seen = [];
      continue;
    }
    const exact = options.find((option) => normSpace(option) === normSpace(row.text));
    if (exact) {
      if (!collecting.length) seen = [exact];
      else seen.push(exact);
      commit();
      continue;
    }
    const lead = options.find((option) => {
      const prefix = `${normSpace(option)} `;
      return normSpace(row.text).startsWith(prefix) && normSpace(row.text).length > prefix.length + 8;
    });
    if (lead) {
      seen.push(lead);
      const rest = row.text.slice(lead.length).trim();
      if (rest) collecting.push(rest);
      commit();
      continue;
    }
    collecting.push(row.text);
    commit();
  }
  commit();
  return result;
}

function buildFree(instruction: string, answer: Piece[]): PbqTask {
  const bodyRows = skipIntro(answer, instruction);
  const body = bodyRows
    .map((row) => clean(row.text))
    .filter(Boolean)
    .join('\n');
  return {
    format: 'free',
    grade: 'loose',
    instruction: instruction || 'Answer this question.',
    items: [item('free-1', 'Your answer', [textControl()], [[body || instruction]])],
  };
}

export function buildPbq(question: Piece[], answer: Piece[]): PbqTask {
  const { instruction, rest } = takeInstruction(question);
  const text = instruction || clean(question.map((row) => row.text).join(' '));
  return (
    buildOrder(text, rest, answer) ??
    buildPorts(text, rest, answer) ??
    buildRaid(text, answer) ??
    buildPins(text, answer) ??
    buildProtocolPorts(text, rest, answer) ??
    buildSymptoms(text, rest, answer) ??
    buildLettered(text, rest, answer) ??
    buildMatchTwo(text, answer) ??
    buildLabeledPictures(text, rest, answer) ??
    buildPlainLabels(text, rest, answer) ??
    buildBankSelect(text, rest, answer) ??
    buildFree(text, answer)
  );
}

export function explanationFrom(answer: Piece[], instruction: string): string {
  const lines = skipIntro(answer, instruction)
    .map((row) => clean(row.text))
    .filter((text) => text && !isDash(text) && !isHeader(text));
  return lines.join('\n');
}

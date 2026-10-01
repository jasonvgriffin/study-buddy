import { buildPbq, explanationFrom, type Piece } from './pbq';
import type { ParsedCard, ParsedChoice, ParsedDocument, ParsedDomain, ParsedTest, TextPage } from './types';

type Mode = 'seek' | 'questions' | 'key' | 'details';

type WorkCard = ParsedCard & {
  answerLines: string[];
  explanationLines: string[];
  optionNotes: Map<string, string[]>;
};

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function normLabel(label: string): string {
  const match = label.match(/^([A-Za-z]?)(\d+)$/);
  if (!match) return label.trim();
  return `${match[1].toUpperCase()}${match[2]}`;
}

function splitLabel(label: string): { prefix: string; n: number } | null {
  const match = normLabel(label).match(/^([A-Z]?)(\d+)$/);
  if (!match) return null;
  return { prefix: match[1], n: Number(match[2]) };
}

export function isChromeLine(line: string): boolean {
  const t = clean(line);
  if (!t) return false;
  if (/practice\s+exam\s+[a-z0-9]+\s*-\s*(questions|answers)/i.test(t)) return true;
  if (/^(quick|the details:?|page:?)$/i.test(t)) return true;
  if (/^quick\s+answer:?/i.test(t)) return true;
  if (/^the details:?/i.test(t)) return true;
  if (/^answer\s*page:?/i.test(t)) return true;
  if (/^answer:\s*\d{1,4}$/i.test(t)) return true;
  if (/^page:\s*\d{1,4}$/i.test(t)) return true;
  if (/^page\s+\d{1,4}(\s+of\s+\d{1,4})?$/i.test(t)) return true;
  if (/^\d{1,4}\s+of\s+\d{1,4}$/i.test(t)) return true;
  if (/^[-–—]\s*\d{1,4}\s*[-–—]$/.test(t)) return true;
  return false;
}

export function parseDomainLine(line: string): ParsedDomain | null {
  const match = clean(line).match(/^domain\s+(\d+)\.0\s*[-–—:]\s*(.+)$/i);
  if (!match) return null;
  let name = match[2].trim();
  let weight: number | null = null;
  const weightMatch = name.match(/^(.*?)(?:\s*[-–—]\s*(\d+(?:\.\d+)?)\s*%)\s*$/);
  if (weightMatch) {
    name = weightMatch[1].trim();
    weight = Number(weightMatch[2]) / 100;
  }
  if (!name) return null;
  return { number: Number(match[1]), name, weight };
}

export function parseObjectiveLine(line: string): {
  examCode: string | null;
  major: number;
  minor: number;
  title: string;
} | null {
  const match = clean(line).match(
    /^(?:([A-Za-z0-9.+-]+)\s*,\s*)?objective\s+(\d+)\.(\d+)\s*[-–—:]\s*(.+)$/i,
  );
  if (!match) return null;
  return {
    examCode: match[1] ?? null,
    major: Number(match[2]),
    minor: Number(match[3]),
    title: match[4].trim(),
  };
}

function testHeading(line: string): string | null {
  const t = clean(line);
  if (t.length < 4 || t.length > 80) return null;
  if (
    /^(?:practice\s+)?(?:exam|test|quiz)\s+([A-Z]|\d+)\b(?:\s*[-–—:].*)?$/i.test(t)
  ) {
    return t;
  }
  if (/^part\s+\d+\b/i.test(t)) return t;
  return null;
}

function modeHeading(line: string): Mode | null {
  const t = clean(line);
  if (/multiple[-\s]?choice\s+quick\s+answers|^quick\s+answers$|^answer\s+key$|^answers$|^answer\s+sheet$/i.test(t)) {
    return 'key';
  }
  if (/detailed\s+answers|^explanations$|performance[-\s]?based\s+answers/i.test(t)) return 'details';
  if (/multiple[-\s]?choice\s+questions|performance[-\s]?based\s+questions|^questions$/i.test(t)) {
    return 'questions';
  }
  return null;
}

/** Section headings found in the question portion of a PDF. */
export function sectionHeading(line: string): string | null {
  const t = clean(line);
  if (!t || t.length > 80 || t.endsWith('?')) return null;
  if (/^(?:section|chapter|domain|unit|module|objective)\b/i.test(t)) return t;
  if (/objective\s+[\d.]+\s*[-–—]\s+\S+/i.test(t)) return t;
  const words = t.split(/\s+/);
  const caps =
    t.length >= 5 &&
    t.length <= 48 &&
    words.length >= 2 &&
    words.length <= 6 &&
    !/[a-z]/.test(t) &&
    /[A-Z]/.test(t);
  if (caps) return t;
  return null;
}

function questionStart(line: string): { label: string; rest: string } | null {
  const match = clean(line).match(/^([A-Za-z]?\d{1,3})\.\s+(.+)$/);
  if (!match) return null;
  return { label: normLabel(match[1]), rest: match[2].trim() };
}

function promptStart(line: string): { label: string; rest: string } | null {
  const match = clean(line).match(/^(?:Q|Question|Prompt)\s*(\d+)?\s*[:.)-]\s*(.*)$/i);
  if (!match) return null;
  const label = match[1] ? normLabel(match[1]) : '';
  return { label, rest: (match[2] ?? '').trim() };
}

function choiceStart(line: string): { label: string; text: string } | null {
  const match = clean(line).match(/^(?:[❍●○◦•☐]\s*)?([A-Ha-h])[.)]\s+(.+)$/);
  if (!match) return null;
  return { label: match[1].toUpperCase(), text: match[2].trim() };
}

function answerLetters(text: string): string[] {
  const letters: string[] = [];
  const re = /\b([A-Ha-h])(?=\.|\s+and\b|\s*,|\s*$|\))/gi;
  let match: RegExpExecArray | null;
  const source = text.trim();
  while ((match = re.exec(source))) {
    const letter = match[1].toUpperCase();
    if (!letters.includes(letter)) letters.push(letter);
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }
  return letters;
}

function parseKeyEntries(line: string): { label: string; letters: string[] }[] {
  const re = /([A-Za-z]?\d{1,3})[.)]\s+/g;
  const marks: { label: string; end: number; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) {
    marks.push({
      label: normLabel(match[1]),
      index: match.index,
      end: match.index + match[0].length,
    });
  }
  const found: { label: string; letters: string[] }[] = [];
  for (let i = 0; i < marks.length; i += 1) {
    const stop = i + 1 < marks.length ? marks[i + 1].index : line.length;
    const letters = answerLetters(line.slice(marks[i].end, stop));
    if (letters.length) found.push({ label: marks[i].label, letters });
  }
  return found;
}

function blankCard(label: string, section: string | null): WorkCard {
  return {
    sourceLabel: label,
    question: '',
    choices: [],
    correctLabels: [],
    answer: '',
    explanation: null,
    section,
    domainNumber: null,
    domainName: null,
    objective: null,
    objectiveTitle: null,
    examCode: null,
    lessonUrl: null,
    answerLines: [],
    explanationLines: [],
    optionNotes: new Map(),
  };
}

function stripChromeNoise(text: string): string {
  return clean(
    text
      .replace(/\bAnswer\s*Page:\s*\d{1,4}\b/gi, ' ')
      .replace(/\bThe Details:\s*\d{1,4}\b/gi, ' ')
      .replace(/\bAnswer:\s*\d{1,4}\b/gi, ' ')
      .replace(/\bPage\s+\d{1,4}(?:\s+of\s+\d{1,4})?\b/gi, ' ')
      .replace(/\s+Quick\s*$/gi, ' '),
  );
}

/** A line that is only a page number or a "Page N" marker. */
export function isPageNumberLine(line: string): boolean {
  const t = clean(line);
  if (!t) return false;
  if (/^\d{1,4}$/.test(t)) return true;
  if (/^page\s+\d{1,4}(\s+of\s+\d{1,4})?$/i.test(t)) return true;
  if (/^\d{1,4}\s+of\s+\d{1,4}$/i.test(t)) return true;
  if (/^[-–—]\s*\d{1,4}\s*[-–—]$/.test(t)) return true;
  return false;
}

/** Join a wrapped line. A hyphen at the end of a word is a line-break, not a dash. */
export function joinWrap(left: string, right: string): string {
  const base = left.replace(/\s+$/, '');
  const next = right.replace(/^\s+/, '');
  if (/[A-Za-z]-$/.test(base) && /^[a-z(]/.test(next)) {
    return clean(`${base.slice(0, -1)}${next}`);
  }
  return clean(`${base} ${next}`);
}

function joinLines(lines: string[]): string {
  let text = '';
  for (const line of lines) {
    const piece = clean(line);
    if (!piece) continue;
    text = text ? joinWrap(text, piece) : piece;
  }
  return text;
}

/** Two questions glued into one string: "...? 2. Next question ..." */
export function peelEmbeddedQuestion(text: string): { head: string; label: string; rest: string } | null {
  const match = clean(text).match(/^(.*\?)\s+([A-Za-z]?\d{1,3})\.\s+(\S[\s\S]{8,})$/);
  if (!match) return null;
  const head = match[1].trim();
  const rest = match[3].trim();
  if (head.length < 8 || !rest.includes('?')) return null;
  return { head, label: normLabel(match[2]), rest };
}

function paragraphs(lines: string[]): string {
  const parts: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    const text = joinLines(buf);
    if (text) parts.push(text);
    buf = [];
  };
  for (const line of lines) {
    if (!clean(line)) {
      flush();
      continue;
    }
    buf.push(line);
  }
  flush();
  return parts.join('\n\n');
}

function finalize(card: WorkCard): ParsedCard {
  const explanationText = paragraphs(card.explanationLines);
  const answerText = paragraphs(card.answerLines);
  const choices: ParsedChoice[] = card.choices.map((choice) => {
    const notes = card.optionNotes.get(choice.label) ?? [];
    const note = paragraphs(notes);
    return { ...choice, explanation: note || null };
  });
  let answer = answerText;
  if (!answer && card.correctLabels.length && choices.length) {
    answer = choices
      .filter((choice) => card.correctLabels.includes(choice.label))
      .map((choice) => `${choice.label}. ${choice.text}`)
      .join('; ');
  }
  const prose = card.explanationLines.filter((line) => {
    const text = clean(line);
    if (!text) return false;
    if (/^the answers?:/i.test(text)) return false;
    if (/^the incorrect answers?:?$/i.test(text)) return false;
    if (/^more information:?$/i.test(text)) return false;
    if (/^https?:\/\//i.test(text)) return false;
    return true;
  });
  return {
    sourceLabel: card.sourceLabel,
    question: stripChromeNoise(card.question),
    choices: choices.map((choice) => ({ ...choice, text: stripChromeNoise(choice.text) })),
    correctLabels: card.correctLabels,
    answer: answer || '',
    explanation: prose.length ? explanationText : null,
    pbq: card.pbq ?? null,
    section: card.section,
    domainNumber: card.domainNumber,
    domainName: card.domainName,
    objective: card.objective,
    objectiveTitle: card.objectiveTitle,
    examCode: card.examCode,
    lessonUrl: card.lessonUrl,
  };
}

function applyObjective(card: WorkCard, line: string, domains: Map<number, ParsedDomain>) {
  const objective = parseObjectiveLine(line);
  if (!objective) return false;
  card.examCode = objective.examCode;
  card.domainNumber = objective.major;
  card.objective = `${objective.major}.${objective.minor}`;
  card.objectiveTitle = objective.title;
  card.section = `Objective ${objective.major}.${objective.minor} - ${objective.title}`;
  const domain = domains.get(objective.major);
  if (domain) card.domainName = domain.name;
  return true;
}

function findCard(cards: WorkCard[], label: string): WorkCard | undefined {
  const key = normLabel(label);
  return cards.find((card) => card.sourceLabel === key);
}

type DetailZone = 'skip' | 'answer' | 'incorrect' | 'explain' | 'meta';

function edgeTexts(page: TextPage): string[] {
  const lines = page.lines.map((line) => clean(line)).filter(Boolean);
  return [...lines.slice(0, 2), ...lines.slice(-2)];
}

/** Drop running headers, footers, and page numbers that sit on the edge of a page. */
export function scrubPages(pages: TextPage[]): TextPage[] {
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const line of new Set(edgeTexts(page))) {
      if (line.length < 6 || line.length > 90) continue;
      if (questionStart(line) || choiceStart(line) || promptStart(line) || testHeading(line)) continue;
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  const repeated = new Set([...counts.entries()].filter(([, count]) => count >= 2).map(([line]) => line));
  return pages.map((page) => {
    const nonempty: number[] = [];
    page.lines.forEach((raw, index) => {
      if (clean(raw)) nonempty.push(index);
    });
    const drop = new Set<number>();
    const consider = (index: number | undefined) => {
      if (index == null) return;
      const text = clean(page.lines[index] ?? '');
      if (!text) return;
      if (isPageNumberLine(text) || isChromeLine(text) || repeated.has(text)) drop.add(index);
    };
    consider(nonempty[0]);
    consider(nonempty[1]);
    if (nonempty.length > 2) consider(nonempty[nonempty.length - 1]);
    if (nonempty.length > 3) consider(nonempty[nonempty.length - 2]);
    if (!drop.size) return page;
    return { ...page, lines: page.lines.filter((_, index) => !drop.has(index)), pieces: page.pieces };
  });
}

function richness(card: ParsedCard): number {
  return (
    (card.explanation ? 4 : 0) +
    card.correctLabels.length * 2 +
    card.choices.length +
    (card.answer ? 1 : 0) +
    (card.pbq ? 3 : 0)
  );
}

/** Keep one copy of the same question text. Prefer the copy that has an answer or explanation. */
export function dedupeQuestions(cards: ParsedCard[]): ParsedCard[] {
  const indexByKey = new Map<string, number>();
  const out: ParsedCard[] = [];
  for (const card of cards) {
    const key = clean(card.question).toLowerCase();
    if (!key) continue;
    const previous = indexByKey.get(key);
    if (previous == null) {
      indexByKey.set(key, out.length);
      out.push(card);
      continue;
    }
    if (richness(card) > richness(out[previous])) {
      out[previous] = { ...card, sourceLabel: out[previous].sourceLabel };
    }
  }
  return out;
}

function spawnQuestion(from: ParsedCard, label: string, question: string): ParsedCard {
  return {
    sourceLabel: label,
    question,
    choices: [],
    correctLabels: [],
    answer: '',
    explanation: null,
    section: from.section,
    domainNumber: from.domainNumber,
    domainName: from.domainName,
    objective: from.objective,
    objectiveTitle: from.objectiveTitle,
    examCode: from.examCode,
    lessonUrl: null,
    pbq: null,
  };
}

/** Split a card whose stem contains a second question, then drop duplicate wording. */
export function tidyQuestions(cards: ParsedCard[]): ParsedCard[] {
  const split: ParsedCard[] = [];
  for (const card of cards) {
    const peeled = peelEmbeddedQuestion(card.question);
    if (!peeled) {
      const last = card.choices[card.choices.length - 1];
      const fromChoice = last ? peelEmbeddedQuestion(last.text) : null;
      if (fromChoice && card.choices.length) {
        const choices = card.choices.map((choice, index) =>
          index === card.choices.length - 1 ? { ...choice, text: fromChoice.head } : choice,
        );
        split.push({ ...card, choices });
        split.push(spawnQuestion(card, fromChoice.label, fromChoice.rest));
        continue;
      }
      split.push(card);
      continue;
    }
    split.push({ ...card, question: peeled.head });
    split.push(spawnQuestion(card, peeled.label, peeled.rest));
  }
  return dedupeQuestions(split);
}

export function parseDocument(pages: TextPage[]): ParsedDocument {
  pages = scrubPages(pages);
  const tests: { name: string; cards: WorkCard[] }[] = [];
  const domains = new Map<number, ParsedDomain>();
  let mode: Mode = 'seek';
  let test: { name: string; cards: WorkCard[] } | null = null;
  const readTest = (): { name: string; cards: WorkCard[] } | null => test;
  let card: WorkCard | null = null;
  let stickySection: string | null = null;
  let lastNumber: { prefix: string; n: number } | null = null;
  const readLast = (): { prefix: string; n: number } | null => lastNumber;
  let capture: 'stem' | 'choice' | 'inline-answer' | 'inline-explanation' = 'stem';
  let detail: WorkCard | null = null;
  let zone: DetailZone = 'skip';
  let detailOption: string | null = null;
  let implicitN = 0;
  let pendingLabel: string | null = null;

  const ensureTest = (name: string) => {
    const existing = tests.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (test !== existing) {
        card = null;
        lastNumber = null;
        stickySection = null;
      }
      test = existing;
      return;
    }
    test = { name, cards: [] };
    tests.push(test);
    card = null;
    lastNumber = null;
    stickySection = null;
  };

  const startCard = (label: string, rest: string) => {
    if (!test) ensureTest('Imported test');
    const parts = splitLabel(label);
    if (mode === 'questions' && parts && parts.n === 1 && lastNumber && lastNumber.n > 1 && lastNumber.prefix === parts.prefix) {
      const nextIndex = tests.length + 1;
      ensureTest(`Test ${nextIndex}`);
    }
    if (parts && mode === 'questions') {
      if (lastNumber && parts.prefix && lastNumber.prefix && parts.prefix !== lastNumber.prefix && parts.n === 1 && !testHeadingOpen) {
        ensureTest(parts.prefix ? `Exam ${parts.prefix}` : `Test ${tests.length + 1}`);
      }
      lastNumber = parts;
    }
    const resolved = label || String(++implicitN);
    const existing = findCard(test!.cards, resolved);
    if (existing && mode !== 'questions') {
      card = existing;
      return;
    }
    card = blankCard(normLabel(resolved) || resolved, stickySection);
    card.question = rest;
    test!.cards.push(card);
    capture = 'stem';
  };

  let testHeadingOpen = false;

  const appendStem = (text: string) => {
    if (!card) return;
    card.question = card.question ? joinWrap(card.question, text) : clean(text);
  };

  const appendChoice = (text: string) => {
    if (!card || !card.choices.length) {
      appendStem(text);
      return;
    }
    const last = card.choices[card.choices.length - 1];
    last.text = last.text ? joinWrap(last.text, text) : clean(text);
  };

  for (const page of pages) {
    for (const raw of page.lines) {
      const line = clean(raw);
      if (!line) {
        if (capture === 'inline-explanation') capture = 'stem';
        continue;
      }
      if (isChromeLine(line)) continue;

      const domain = parseDomainLine(line);
      if (domain) {
        domains.set(domain.number, domain);
        continue;
      }

      const asMode = modeHeading(line);
      if (asMode) {
        mode = asMode;
        capture = 'stem';
        zone = 'skip';
        testHeadingOpen = false;
        continue;
      }

      const heading = testHeading(line);
      if (heading) {
        const current = readTest();
        const switching = !current || current.name.toLowerCase() !== heading.toLowerCase();
        ensureTest(heading);
        testHeadingOpen = true;
        if (mode === 'seek' || switching) mode = 'questions';
        if (switching) {
          zone = 'skip';
          detail = null;
          capture = 'stem';
        }
        continue;
      }
      testHeadingOpen = false;

      if (mode === 'seek') {
        const prompt = promptStart(line);
        const q = questionStart(line);
        if (prompt || q) mode = 'questions';
        else continue;
      }

      if (mode === 'key') {
        const entries = parseKeyEntries(line);
        const keyed = readTest();
        if (entries.length && keyed) {
          for (const entry of entries) {
            const target = findCard(keyed.cards, entry.label);
            if (!target) continue;
            target.correctLabels = entry.letters;
            card = target;
          }
          continue;
        }
        const explanation = line.match(/^explanation\s*:\s*(.*)$/i);
        if (explanation && card) {
          if (explanation[1]) card.explanationLines.push(explanation[1]);
          continue;
        }
        continue;
      }

      if (mode === 'details') {
        const started = questionStart(line);
        const detailed = readTest();
        if (started && detailed) {
          detail = findCard(detailed.cards, started.label) ?? null;
          zone = 'skip';
          detailOption = null;
          continue;
        }
        if (!detail) continue;
        if (/^more information:?$/i.test(line)) {
          zone = 'meta';
          detailOption = null;
          continue;
        }
        if (zone === 'meta') {
          if (applyObjective(detail, line, domains)) continue;
          const url = line.match(/^(https?:\/\/\S+)$/i);
          if (url) {
            detail.lessonUrl = url[1];
            continue;
          }
          zone = 'skip';
        }
        if (applyObjective(detail, line, domains)) continue;
        if (/^the answers?:/i.test(line)) {
          zone = 'answer';
          detailOption = null;
          detail.answerLines.push(line);
          if (!detail.correctLabels.length) detail.correctLabels = answerLetters(line);
          const rest = line.replace(/^the answers?:\s*/i, '');
          if (rest) detail.explanationLines.push(line);
          continue;
        }
        if (/^the incorrect answers?:?$/i.test(line)) {
          zone = 'incorrect';
          detailOption = null;
          detail.explanationLines.push(line);
          continue;
        }
        if (/^explanation\s*:/i.test(line)) {
          zone = 'explain';
          const rest = line.replace(/^explanation\s*:\s*/i, '');
          if (rest) detail.explanationLines.push(rest);
          continue;
        }
        if (zone === 'skip') {
          // Performance-style items have no lettered choices. Everything after
          // the repeated question id is the answer text from the PDF.
          if (detail.choices.length === 0) {
            zone = 'explain';
            detail.explanationLines.push(line);
            detail.answerLines.push(line);
          }
          continue;
        }
        if (zone === 'answer') {
          const choice = choiceStart(line);
          const shortLabel = choice && line.length < 90 && !/[.!?]$/.test(choice.text);
          if (choice && (shortLabel || detail.answerLines.length === 1)) {
            detail.answerLines.push(line);
            if (!parseKeyEntries(detail.answerLines.join(' ')).length) {
              const letters = answerLetters(detail.answerLines.join(' '));
              if (letters.length && !detail.correctLabels.length) detail.correctLabels = letters;
            } else if (!detail.correctLabels.length) {
              detail.correctLabels = answerLetters(detail.answerLines.join(' '));
            }
            const letters = answerLetters(line);
            for (const letter of letters) {
              const notes = detail.optionNotes.get(letter) ?? [];
              notes.push(line);
              detail.optionNotes.set(letter, notes);
            }
            continue;
          }
          detail.explanationLines.push(line);
          const letters = detail.correctLabels.length
            ? detail.correctLabels
            : answerLetters(detail.answerLines.join(' '));
          for (const letter of letters) {
            const notes = detail.optionNotes.get(letter) ?? [];
            notes.push(line);
            detail.optionNotes.set(letter, notes);
          }
          continue;
        }
        if (zone === 'incorrect' || zone === 'explain') {
          const choice = choiceStart(line);
          if (choice) {
            detailOption = choice.label;
            const notes = detail.optionNotes.get(choice.label) ?? [];
            notes.push(line);
            detail.optionNotes.set(choice.label, notes);
            detail.explanationLines.push(line);
            continue;
          }
          if (detailOption) {
            const notes = detail.optionNotes.get(detailOption) ?? [];
            notes.push(line);
            detail.optionNotes.set(detailOption, notes);
          }
          detail.explanationLines.push(line);
        }
        continue;
      }

      // questions mode
      const prompt = promptStart(line);
      if (prompt && /^(?:Q|Question|Prompt)\b/i.test(line)) {
        if (readLast()?.prefix && card) {
          if (capture === 'choice') appendChoice(line);
          else appendStem(line);
          continue;
        }
        startCard(prompt.label, prompt.rest);
        continue;
      }
      const inlineAnswer = line.match(/^(?:A|Answer)\s*[:.)-]\s+(.+)$/i);
      if (inlineAnswer && card && !choiceStart(line)) {
        card.answer = clean(inlineAnswer[1]);
        card.answerLines = [card.answer];
        capture = 'inline-answer';
        continue;
      }
      const loneNumber = line.match(/^([A-Za-z]?\d{1,3})[.)]$/);
      if (loneNumber) {
        pendingLabel = normLabel(loneNumber[1]);
        continue;
      }
      if (pendingLabel) {
        const label = pendingLabel;
        pendingLabel = null;
        const asQuestion = questionStart(line);
        if (asQuestion) {
          startCard(asQuestion.label, asQuestion.rest);
          continue;
        }
        const asChoice = choiceStart(line);
        if (asChoice) {
          startCard(label, '');
          card?.choices.push({ label: asChoice.label, text: asChoice.text, explanation: null });
          capture = 'choice';
          continue;
        }
        startCard(label, line);
        continue;
      }
      const loneChoice = line.match(/^([A-Ha-h])[.)]$/);
      if (loneChoice && card) {
        card.choices.push({ label: loneChoice[1].toUpperCase(), text: '', explanation: null });
        capture = 'choice';
        continue;
      }
      const inlineExplanation = line.match(/^explanation\s*:\s*(.*)$/i);
      if (inlineExplanation && card) {
        if (inlineExplanation[1]) card.explanationLines.push(inlineExplanation[1]);
        capture = 'inline-explanation';
        continue;
      }
      const started = questionStart(line);
      if (started) {
        const parts = splitLabel(started.label);
        const previous = readLast();
        const strayNumber =
          mode === 'questions' &&
          !!parts &&
          !!previous &&
          parts.prefix !== previous.prefix &&
          !(parts.prefix && previous.prefix && parts.n === 1);
        if (strayNumber) {
          if (capture === 'choice') appendChoice(line);
          else appendStem(line);
          continue;
        }
        startCard(started.label, started.rest);
        continue;
      }
      const choice = choiceStart(line);
      if (choice && card) {
        card.choices.push({ label: choice.label, text: choice.text, explanation: null });
        capture = 'choice';
        continue;
      }
      const section = sectionHeading(line);
      if (section) {
        stickySection = section;
        continue;
      }
      if (/^https?:\/\/\S+$/i.test(line)) continue;
      if (!card) continue;
      if (capture === 'inline-explanation') {
        card.explanationLines.push(line);
        continue;
      }
      if (capture === 'inline-answer') {
        card.answer = joinWrap(card.answer, line);
        card.answerLines = [card.answer];
        continue;
      }
      if (capture === 'choice') appendChoice(line);
      else appendStem(line);
    }
  }

  attachPbq(tests, pages);

  const parsedTests: ParsedTest[] = tests
    .map((item) => ({
      name: item.name,
      cards: tidyQuestions(
        item.cards.map((card) => {
          if (card.domainNumber != null && !card.domainName) {
            const domain = domains.get(card.domainNumber);
            if (domain) card.domainName = domain.name;
          }
          return finalize(card);
        }).filter((entry) => entry.question),
      ),
    }))
    .filter((item) => item.cards.length > 0);

  return {
    domains: [...domains.values()].sort((a, b) => a.number - b.number),
    tests: parsedTests,
  };
}

function attachPbq(tests: { name: string; cards: WorkCard[] }[], pages: TextPage[]) {
  type Bucket = { test: string; label: string; q: Piece[]; a: Piece[] };
  const buckets: Bucket[] = [];
  let testName = 'Imported test';
  let pbqQuestions = false;
  let pbqAnswers = false;
  let current: Bucket | null = null;
  let skippingMeta = false;

  const piecesOf = (page: TextPage, pageNumber: number): Piece[] => {
    const source = page.pieces?.length
      ? page.pieces
      : page.lines.map((text, index) => ({ text, x: 0, y: (page.lines.length - index) * 40 }));
    return source
      .map((piece) => ({ ...piece, page: pageNumber }))
      .filter((piece) => clean(piece.text) && !isChromeLine(piece.text));
  };

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    if (!page) continue;
    for (const piece of piecesOf(page, pageIndex + 1)) {
      const line = clean(piece.text);
      if (/performance[-\s]?based\s+questions/i.test(line)) {
        pbqQuestions = true;
        pbqAnswers = false;
        current = null;
        skippingMeta = false;
        continue;
      }
      if (/performance[-\s]?based\s+answers/i.test(line)) {
        pbqQuestions = false;
        pbqAnswers = true;
        current = null;
        skippingMeta = false;
        continue;
      }
      if (/multiple[-\s]?choice\s+questions/i.test(line)) {
        pbqQuestions = false;
        current = null;
        continue;
      }
      if (/detailed\s+answers/i.test(line) && !/performance/i.test(line)) {
        pbqAnswers = false;
        current = null;
        skippingMeta = false;
        continue;
      }
      if (modeHeading(line)) continue;
      const heading = testHeading(line);
      if (heading) {
        testName = heading;
        continue;
      }
      const started = questionStart(line);
      if (pbqQuestions && started) {
        current = { test: testName, label: started.label, q: [{ ...piece, text: started.rest }], a: [] };
        buckets.push(current);
        skippingMeta = false;
        continue;
      }
      if (pbqAnswers && started) {
        current =
          buckets.find(
            (bucket) => bucket.label === started.label && bucket.test.toLowerCase() === testName.toLowerCase(),
          ) ?? null;
        skippingMeta = false;
        continue;
      }
      if (pbqQuestions && current) {
        current.q.push(piece);
        continue;
      }
      if (pbqAnswers && current && !skippingMeta) {
        if (/^more information:?$/i.test(line)) {
          skippingMeta = true;
          continue;
        }
        current.a.push(piece);
      }
    }
  }

  for (const bucket of buckets) {
    const test = tests.find((item) => item.name.toLowerCase() === bucket.test.toLowerCase());
    const card = test?.cards.find((entry) => entry.sourceLabel === bucket.label);
    if (!card || !bucket.q.length) continue;
    const task = buildPbq(bucket.q, bucket.a);
    const explanation = explanationFrom(bucket.a, task.instruction);
    card.question = task.instruction || card.question;
    card.pbq = task;
    card.choices = [];
    card.correctLabels = [];
    card.answer = '';
    if (explanation) card.explanationLines = explanation.split('\n');
  }
}

export function parsePages(pages: TextPage[]): ParsedTest[] {
  return parseDocument(pages).tests;
}

export function parsePlainText(text: string): ParsedTest[] {
  return parsePlainDocument(text).tests;
}

export function parsePlainDocument(text: string): ParsedDocument {
  const pages = text.split(/\f/).map((page) => ({
    lines: page.split(/\r?\n/),
  }));
  return parseDocument(pages);
}

export function choiceGraded(card: Pick<ParsedCard, 'choices' | 'correctLabels'>): boolean {
  return card.choices.length >= 2 && card.correctLabels.length >= 1;
}

export function gradeLabels(correct: string[], chosen: string[]): boolean {
  const norm = (values: string[]) =>
    [...new Set(values.map((value) => value.toUpperCase()))].sort().join(',');
  const left = norm(correct);
  const right = norm(chosen);
  return left.length > 0 && left === right;
}

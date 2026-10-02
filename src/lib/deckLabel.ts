/** Display name for a deck. Stored names stay as saved. */

export type DeckLabelSource = {
  id: string;
  subjectId: string;
  name: string;
  sourceFileName: string;
  createdAt: number;
};

/**
 * Filename words that do not tell two sources apart.
 * "a" and "plus" cover "a-plus" after the name is split.
 */
const GENERIC = new Set([
  'professor',
  'the',
  'comptia',
  'a',
  'an',
  'plus',
  'aplus',
  'practice',
  'exam',
  'exams',
  'test',
  'tests',
  'quiz',
  'quizzes',
  'core',
  'version',
  'ver',
  'pdf',
  'and',
  'of',
  'for',
  'question',
  'questions',
  'answer',
  'answers',
]);

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function fileStem(sourceFileName: string): string {
  const base = sourceFileName.split(/[/\\]/).pop() ?? sourceFileName;
  return base.replace(/\.pdf$/i, '').trim();
}

function tokenKey(token: string): string {
  return token.toLowerCase().replace(/\+/g, '').replace(/[^a-z0-9]/g, '');
}

/** Pure numbers, v111-style versions, and short exam codes such as 220 or sy0. */
function isVersionToken(key: string): boolean {
  if (!key) return true;
  if (/^\d+(?:\.\d+)*$/.test(key)) return true;
  if (/^v\d/.test(key)) return true;
  if (/^[a-z]{1,3}\d+$/.test(key)) return true;
  return false;
}

function capitalizeWord(token: string): string {
  const cleaned = token.replace(/\+/g, '').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

/** First meaningful word of a PDF name, or "" when the name is only generic words. */
function shortSource(sourceFileName: string): string {
  const tokens = fileStem(sourceFileName).split(/[-_\s]+/).filter(Boolean);
  for (const token of tokens) {
    const key = tokenKey(token);
    if (!key || GENERIC.has(key) || isVersionToken(key)) continue;
    const word = capitalizeWord(token);
    if (word) return word;
  }
  return '';
}

function collisionGroup(deck: DeckLabelSource, decks: readonly DeckLabelSource[]): DeckLabelSource[] {
  const key = nameKey(deck.name);
  const seen = new Set<string>();
  const group: DeckLabelSource[] = [];
  const consider = (item: DeckLabelSource) => {
    if (seen.has(item.id)) return;
    if (item.subjectId !== deck.subjectId || nameKey(item.name) !== key) return;
    seen.add(item.id);
    group.push(item);
  };
  consider(deck);
  for (const item of decks) consider(item);
  return group;
}

/**
 * Deck title as shown in the app.
 * A name used once in its subject is unchanged.
 * A repeated name gains ", Messer" (or another short source).
 * When that short source still collides, the full file stem is used.
 * When the stem is the same too, " (1)" and " (2)" follow createdAt.
 */
export function deckLabel(deck: DeckLabelSource, decks: readonly DeckLabelSource[]): string {
  const group = collisionGroup(deck, decks);
  if (group.length < 2) return deck.name;

  const shortOf = new Map(group.map((item) => [item.id, shortSource(item.sourceFileName)]));
  const mineShort = shortOf.get(deck.id) ?? '';
  const sameShort = group.filter((item) => (shortOf.get(item.id) ?? '') === mineShort);
  if (mineShort && sameShort.length === 1) return `${deck.name}, ${mineShort}`;

  const stem = fileStem(deck.sourceFileName);
  const sameStem = sameShort.filter((item) => fileStem(item.sourceFileName) === stem);
  if (stem && sameStem.length === 1) return `${deck.name}, ${stem}`;

  const tied = [...sameStem].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (tied.length < 2) return deck.name;
  const index = tied.findIndex((item) => item.id === deck.id);
  const n = (index < 0 ? 0 : index) + 1;
  return stem ? `${deck.name}, ${stem} (${n})` : `${deck.name} (${n})`;
}

/**
 * Name to show for a sitting.
 * Exam and drill sittings use the deck's display label.
 * A review keeps its own label ("Due for review", a domain) unless that label is the test name.
 */
export function sessionDeckLabel(
  session: { deckId: string; deckName: string; kind: string },
  decks: readonly DeckLabelSource[],
): string {
  const deck = decks.find((item) => item.id === session.deckId);
  if (!deck) return session.deckName;
  if (session.kind === 'review' && session.deckName !== deck.name) return session.deckName;
  return deckLabel(deck, decks);
}

import { certById, type CertId } from './comptia';
import { normDomainName } from './messer';

export type SimCard = {
  id: string;
  domainNumber: number | null;
  domainName: string | null;
};

export type WeightRow = {
  key: string;
  number: number | null;
  name: string;
  /** Editable percent of the sitting. */
  percent: number;
};

export type DomainDeck = {
  domains: readonly { number: number; name: string; weight: number | null }[];
};

export type Shortage = {
  name: string;
  have: number;
  wanted: number;
};

export type SampleResult = {
  ids: string[];
  shortages: Shortage[];
  totalHave: number;
  requested: number;
  /** True when the questions have no domain to split on. */
  undivided: boolean;
  filledFromOthers: boolean;
};

export function officialRows(certId: CertId): WeightRow[] {
  return certById(certId).domains.map((domain) => ({
    key: `d:${domain.number}`,
    number: domain.number,
    name: domain.name,
    percent: domain.percent,
  }));
}

/** PDF domain percents, when any saved test in the subject recorded a weight. */
export function pdfWeightRows(decks: readonly DomainDeck[]): WeightRow[] | null {
  const map = new Map<number, WeightRow>();
  let any = false;
  for (const deck of decks) {
    for (const domain of deck.domains) {
      if (domain.weight != null) any = true;
      const percent = domain.weight == null ? 0 : Math.round(domain.weight * 100);
      const existing = map.get(domain.number);
      if (!existing) {
        map.set(domain.number, {
          key: `d:${domain.number}`,
          number: domain.number,
          name: domain.name,
          percent,
        });
      } else if (existing.percent === 0 && domain.weight != null) {
        existing.percent = percent;
        if (domain.name.trim()) existing.name = domain.name;
      }
    }
  }
  if (!any) return null;
  return [...map.values()].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
}

export function rowsFromCards(cards: readonly SimCard[]): WeightRow[] {
  const map = new Map<string, WeightRow>();
  for (const card of cards) {
    const named = card.domainName?.trim() ?? '';
    if (card.domainNumber == null && !named) continue;
    const name = named || `Domain ${card.domainNumber}`;
    const key = card.domainNumber == null ? `n:${normDomainName(name)}` : `d:${card.domainNumber}`;
    if (!map.has(key)) map.set(key, { key, number: card.domainNumber, name, percent: 0 });
  }
  const rows = [...map.values()].sort(
    (a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name),
  );
  if (!rows.length) return [];
  const base = Math.floor(100 / rows.length);
  let extra = 100 - base * rows.length;
  return rows.map((row) => {
    const percent = base + (extra > 0 ? 1 : 0);
    if (extra > 0) extra -= 1;
    return { ...row, percent };
  });
}

/**
 * Starting weights. A PDF that recorded percents wins.
 * Otherwise the detected cert's official weights are used.
 */
export function initialWeightRows(
  certId: CertId | null,
  decks: readonly DomainDeck[],
  cards: readonly SimCard[],
): WeightRow[] {
  const pdf = pdfWeightRows(decks);
  if (pdf?.length) return pdf;
  if (certId) return officialRows(certId);
  return rowsFromCards(cards);
}

/** Largest-remainder split so the counts add up to total. */
export function allocateCounts(weights: readonly number[], total: number): number[] {
  const count = Math.max(0, Math.floor(total));
  if (!weights.length || count === 0) return weights.map(() => 0);
  const safe = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const sum = safe.reduce((totalWeight, weight) => totalWeight + weight, 0);
  if (sum <= 0) {
    const base = Math.floor(count / safe.length);
    let extra = count - base * safe.length;
    return safe.map(() => {
      const next = base + (extra > 0 ? 1 : 0);
      if (extra > 0) extra -= 1;
      return next;
    });
  }
  const exact = safe.map((weight) => (weight / sum) * count);
  const floors = exact.map((value) => Math.floor(value));
  let left = count - floors.reduce((totalCount, value) => totalCount + value, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  const out = floors.slice();
  for (let step = 0; step < left; step += 1) {
    const slot = order[step % order.length];
    if (!slot) break;
    out[slot.index] = (out[slot.index] ?? 0) + 1;
  }
  return out;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = swap as T;
  }
  return copy;
}

function matchScore(card: SimCard, row: WeightRow): number {
  const cardName = normDomainName(card.domainName);
  const rowName = normDomainName(row.name);
  if (cardName && rowName) {
    if (cardName === rowName) return 3;
    if (cardName.includes(rowName)) return 2;
    if (rowName.includes(cardName)) return 1;
    return 0;
  }
  if (!cardName && row.number != null && card.domainNumber === row.number) return 1;
  return 0;
}

function assignCards(cards: readonly SimCard[], rows: readonly WeightRow[]): { buckets: Map<string, SimCard[]>; unmatched: SimCard[] } {
  const buckets = new Map<string, SimCard[]>(rows.map((row) => [row.key, []]));
  const unmatched: SimCard[] = [];
  for (const card of cards) {
    let best: { key: string; score: number; length: number } | null = null;
    for (const row of rows) {
      const score = matchScore(card, row);
      if (!score) continue;
      const length = normDomainName(row.name).length;
      if (!best || score > best.score || (score === best.score && length > best.length)) {
        best = { key: row.key, score, length };
      }
    }
    if (!best) unmatched.push(card);
    else buckets.get(best.key)?.push(card);
  }
  return { buckets, unmatched };
}

export function sampleExam(input: {
  cards: readonly SimCard[];
  rows: readonly WeightRow[];
  count: number;
  random?: () => number;
}): SampleResult {
  const random = input.random ?? Math.random;
  const requested = Math.max(0, Math.floor(input.count));
  const cards = input.cards;
  if (!input.rows.length) {
    const ids = shuffle(cards, random)
      .slice(0, requested)
      .map((card) => card.id);
    return {
      ids,
      shortages: [],
      totalHave: cards.length,
      requested,
      undivided: true,
      filledFromOthers: false,
    };
  }
  const targets = allocateCounts(
    input.rows.map((row) => row.percent),
    requested,
  );
  const { buckets, unmatched } = assignCards(cards, input.rows);
  const picked: SimCard[] = [];
  const pool: SimCard[] = [...unmatched];
  const shortages: Shortage[] = [];
  input.rows.forEach((row, index) => {
    const wanted = targets[index] ?? 0;
    const available = shuffle(buckets.get(row.key) ?? [], random);
    const take = Math.min(available.length, wanted);
    picked.push(...available.slice(0, take));
    pool.push(...available.slice(take));
    if (available.length < wanted) shortages.push({ name: row.name, have: available.length, wanted });
  });
  const need = Math.max(0, requested - picked.length);
  const filler = shuffle(pool, random).slice(0, need);
  const ids = shuffle([...picked, ...filler], random).map((card) => card.id);
  return {
    ids,
    shortages,
    totalHave: cards.length,
    requested,
    undivided: false,
    filledFromOthers: filler.length > 0,
  };
}

export function sampleNotes(result: SampleResult): string[] {
  const lines: string[] = [];
  if (result.undivided) lines.push('These questions have no domain, so this sitting draws from all of them.');
  for (const item of result.shortages) {
    const noun = item.have === 1 ? 'question' : 'questions';
    lines.push(`${item.name} has ${item.have} ${noun}, so this sitting uses ${item.have} instead of ${item.wanted}.`);
  }
  if (result.filledFromOthers) lines.push('The rest are filled from the other questions.');
  if (result.ids.length < result.requested) {
    const noun = result.totalHave === 1 ? 'question' : 'questions';
    lines.push(
      `This subject has ${result.totalHave} ${noun}, so the sitting uses ${result.ids.length} instead of ${result.requested}.`,
    );
  }
  return lines;
}

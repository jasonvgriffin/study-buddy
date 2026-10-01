export type DomainCard = {
  id: string;
  domainNumber: number | null;
  domainName: string | null;
  objective: string | null;
  objectiveTitle: string | null;
};

export type ScoreRow = {
  cardId: string;
  /** Null when the card was in the sitting and never answered. */
  correct: boolean | null;
};

export type ObjectiveScore = {
  key: string;
  label: string;
  correct: number;
  incorrect: number;
  unanswered: number;
};

export type DomainScore = {
  key: string;
  domainNumber: number | null;
  name: string;
  correct: number;
  incorrect: number;
  unanswered: number;
  objectives: ObjectiveScore[];
};

function add(bucket: { correct: number; incorrect: number; unanswered: number }, correct: boolean | null) {
  if (correct == null) bucket.unanswered += 1;
  else if (correct) bucket.correct += 1;
  else bucket.incorrect += 1;
}

export function domainBreakdown(cards: DomainCard[], rows: ScoreRow[]): DomainScore[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const domains = new Map<string, DomainScore>();
  for (const row of rows) {
    const card = byId.get(row.cardId);
    if (!card) continue;
    const key = card.domainNumber == null ? 'none' : `d:${card.domainNumber}`;
    let domain = domains.get(key);
    if (!domain) {
      domain = {
        key,
        domainNumber: card.domainNumber,
        name: card.domainName?.trim() || (card.domainNumber == null ? 'No domain' : `Domain ${card.domainNumber}`),
        correct: 0,
        incorrect: 0,
        unanswered: 0,
        objectives: [],
      };
      domains.set(key, domain);
    }
    add(domain, row.correct);
    const objectiveKey = card.objective?.trim() || '';
    const objectiveLabel = [card.objective?.trim(), card.objectiveTitle?.trim()].filter(Boolean).join(' ');
    let objective = domain.objectives.find((item) => item.key === objectiveKey);
    if (!objective) {
      objective = { key: objectiveKey, label: objectiveLabel, correct: 0, incorrect: 0, unanswered: 0 };
      domain.objectives.push(objective);
    }
    add(objective, row.correct);
  }
  return [...domains.values()]
    .map((domain) => ({
      ...domain,
      objectives: domain.objectives
        .filter((item) => item.key)
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => {
      if (a.domainNumber == null) return 1;
      if (b.domainNumber == null) return -1;
      return a.domainNumber - b.domainNumber;
    });
}

export function answerText(
  card: { choices: { label: string; text: string }[]; answer: string; correctLabels: string[] },
  labels: string[],
): string {
  if (labels.length) {
    return labels
      .map((label) => {
        const choice = card.choices.find((item) => item.label === label);
        return choice ? `${choice.label}. ${choice.text}` : label;
      })
      .join('; ');
  }
  return '';
}

export function correctAnswerText(card: {
  choices: { label: string; text: string }[];
  answer: string;
  correctLabels: string[];
}): string {
  const fromLabels = answerText(card, card.correctLabels);
  if (fromLabels) return fromLabels;
  const written = card.answer.trim();
  return written || 'No answer recorded';
}

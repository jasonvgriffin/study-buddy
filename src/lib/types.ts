export type ParsedChoice = {
  label: string;
  text: string;
  explanation: string | null;
};

export type ParsedDomain = {
  number: number;
  name: string;
  /** Fraction of the exam, such as 0.13 for 13%. Null when the PDF omits a percent. */
  weight: number | null;
};

export type ParsedCard = {
  sourceLabel: string;
  question: string;
  choices: ParsedChoice[];
  correctLabels: string[];
  answer: string;
  explanation: string | null;
  section: string | null;
  domainNumber: number | null;
  domainName: string | null;
  /** Major.minor objective, such as "5.2". */
  objective: string | null;
  objectiveTitle: string | null;
  examCode: string | null;
  /** Verbatim URL from the PDF. Null when the PDF has no link. */
  lessonUrl: string | null;
};

export type ParsedTest = {
  name: string;
  cards: ParsedCard[];
};

export type ParsedDocument = {
  domains: ParsedDomain[];
  tests: ParsedTest[];
};

export type TextPage = {
  lines: string[];
};

export type Subject = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Deck = {
  id: string;
  subjectId: string;
  name: string;
  sourceFileName: string;
  sourceGroupId: string;
  domains: ParsedDomain[];
  createdAt: number;
  updatedAt: number;
};

export type Card = ParsedCard & {
  id: string;
  deckId: string;
  subjectId: string;
  order: number;
  /** User-set start, or null to open at the beginning. Never inferred. */
  videoStartSec: number | null;
};

export type Review = {
  id: string;
  cardId: string;
  deckId: string;
  subjectId: string;
  sessionId: string;
  correct: boolean;
  chosenLabels: string[];
  at: number;
};

export type SessionAnswer = {
  cardId: string;
  correct: boolean;
  chosenLabels: string[];
  at: number;
};

export type SessionStatus = 'active' | 'paused' | 'finished';
export type SessionKind = 'exam' | 'drill' | 'review';
export type TimerMode = 'untimed' | 'timed';

export type LiveSession = {
  id: string;
  deckId: string;
  subjectId: string;
  deckName: string;
  kind: SessionKind;
  section: string | null;
  domainNumber: number | null;
  /** Stable identity for "one in-progress session per test" and per review filter. */
  scopeKey: string;
  timerMode: TimerMode;
  timeLimitMs: number | null;
  cardIds: string[];
  originalCount: number;
  index: number;
  answers: SessionAnswer[];
  flagged: string[];
  accumulatedMs: number;
  runningSince: number | null;
  status: SessionStatus;
  startedAt: number;
  updatedAt: number;
  finishedReason: 'complete' | 'time' | null;
};

export type CardMemory = {
  cardId: string;
  deckId: string;
  subjectId: string;
  attempts: number;
  correct: number;
  incorrect: number;
  streak: number;
  bestStreak: number;
  lastResult: 'correct' | 'incorrect' | null;
  lastReviewedAt: number | null;
  ease: number;
  intervalDays: number;
  dueAt: number;
  lapses: number;
};

export type ImportDraft = {
  id: string;
  subjectId: string | null;
  fileName: string;
  tests: ParsedTest[];
  domains: ParsedDomain[];
  /** Optional start times entered during review, keyed by "testIndex:cardIndex". */
  videoStarts?: Record<string, number | null>;
  updatedAt: number;
};

export type PersistMeta = {
  key: 'persist';
  granted: boolean | null;
  at: number;
};

export type BackupFile = {
  version: 1;
  exportedAt: string;
  subjects: Subject[];
  decks: Deck[];
  cards: Card[];
  reviews: Review[];
  sessions: LiveSession[];
  memories: CardMemory[];
};

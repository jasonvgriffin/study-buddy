import type { Card, LiveSession, SessionAnswer } from './types';
import { formatDuration, newId } from './format';

export const TIMED_EXAM_MS = 90 * 60 * 1000;

export function elapsedMs(session: Pick<LiveSession, 'accumulatedMs' | 'runningSince'>, now: number): number {
  if (session.runningSince == null) return session.accumulatedMs;
  return session.accumulatedMs + Math.max(0, now - session.runningSince);
}

type ProgressSession = Pick<
  LiveSession,
  'kind' | 'index' | 'originalCount' | 'cardIds' | 'skipReview' | 'skipped' | 'answers'
>;

/**
 * Question position the Home resume line uses.
 * An exam counts the original sitting. A drill counts the cards still in the queue.
 * Skip review reports how many skipped questions are left.
 */
export function sessionProgress(session: ProgressSession): { question: number; total: number } | { skipped: number } {
  if (session.skipReview) return { skipped: skippedUnanswered(session).length };
  const total = session.kind === 'exam' ? session.originalCount : session.cardIds.length;
  const question = Math.min(session.index + 1, Math.max(total, 1));
  return { question, total };
}

/** Stats row label. Same question and total as the Home resume line, without the test name or clock. */
export function inProgressLabel(session: ProgressSession): string {
  const progress = sessionProgress(session);
  if ('skipped' in progress) {
    const noun = progress.skipped === 1 ? 'question' : 'questions';
    return `In progress, ${progress.skipped} skipped ${noun} to review`;
  }
  return `In progress, question ${progress.question} of ${progress.total}`;
}

/** Pieces of the resume line so the test name can be emphasized without changing the words. */
export function resumeLabelParts(session: LiveSession, now: number): { lead: string; name: string; rest: string } {
  const elapsed = formatDuration(elapsedMs(session, now));
  const name = session.deckName;
  const progress = sessionProgress(session);
  if ('skipped' in progress) {
    const noun = progress.skipped === 1 ? 'question' : 'questions';
    return { lead: 'Resume ', name, rest: `: ${progress.skipped} skipped ${noun} to review, ${elapsed} elapsed` };
  }
  return { lead: 'Resume ', name, rest: `: Question ${progress.question} of ${progress.total}, ${elapsed} elapsed` };
}

export function resumeLabel(session: LiveSession, now: number): string {
  const { lead, name, rest } = resumeLabelParts(session, now);
  return `${lead}${name}${rest}`;
}

function baseSession(input: {
  deckId: string;
  subjectId: string;
  deckName: string;
  kind: LiveSession['kind'];
  section: string | null;
  domainNumber?: number | null;
  scopeKey: string;
  timerMode: LiveSession['timerMode'];
  cardIds: string[];
  now: number;
}): LiveSession {
  return {
    id: newId(),
    deckId: input.deckId,
    subjectId: input.subjectId,
    deckName: input.deckName,
    kind: input.kind,
    section: input.section,
    domainNumber: input.domainNumber ?? null,
    scopeKey: input.scopeKey,
    timerMode: input.timerMode,
    timeLimitMs: input.timerMode === 'timed' ? TIMED_EXAM_MS : null,
    cardIds: input.cardIds,
    originalCount: input.cardIds.length,
    index: 0,
    answers: [],
    flagged: [],
    skipped: [],
    skipReview: false,
    returnToReview: false,
    bookmarkIndex: null,
    accumulatedMs: 0,
    runningSince: input.now,
    status: 'active',
    startedAt: input.now,
    updatedAt: input.now,
    finishedReason: null,
  };
}

export function createExamSession(
  deck: { id: string; subjectId: string; name: string },
  cards: Card[],
  timerMode: LiveSession['timerMode'],
  now: number,
): LiveSession {
  const mine = cards
    .filter((card) => card.deckId === deck.id)
    .sort((a, b) => a.order - b.order);
  if (mine.some((card) => card.deckId !== deck.id)) {
    throw new Error('A test session cannot mix cards from another test.');
  }
  return baseSession({
    deckId: deck.id,
    subjectId: deck.subjectId,
    deckName: deck.name,
    kind: 'exam',
    section: null,
    scopeKey: `exam:${deck.id}`,
    timerMode,
    cardIds: mine.map((card) => card.id),
    now,
  });
}

export function createDrillSession(
  deck: { id: string; subjectId: string; name: string },
  cards: Card[],
  cardIds: string[],
  section: string | null,
  now: number,
): LiveSession {
  const allowed = new Set(cards.filter((card) => card.deckId === deck.id).map((card) => card.id));
  const ids = cardIds.filter((id) => allowed.has(id));
  if (ids.some((id) => !allowed.has(id))) {
    throw new Error('A drill cannot include cards from another test.');
  }
  return baseSession({
    deckId: deck.id,
    subjectId: deck.subjectId,
    deckName: deck.name,
    kind: 'drill',
    section,
    scopeKey: `drill:${deck.id}:${section ?? ''}`,
    timerMode: 'untimed',
    cardIds: ids,
    now,
  });
}

/** Due-card review. May include several tests when the filter is a subject or domain. */
export function createReviewSession(
  label: string,
  subjectId: string,
  deckId: string,
  cards: Card[],
  cardIds: string[],
  domainNumber: number | null,
  scopeKey: string,
  now: number,
): LiveSession {
  const allowed = new Set(cards.map((card) => card.id));
  const ids = cardIds.filter((id) => allowed.has(id));
  return baseSession({
    deckId,
    subjectId,
    deckName: label,
    kind: 'review',
    section: null,
    domainNumber,
    scopeKey,
    timerMode: 'untimed',
    cardIds: ids,
    now,
  });
}

export function activeSessionForDeck(sessions: LiveSession[], deckId: string): LiveSession | null {
  return (
    sessions.find(
      (session) =>
        session.deckId === deckId && session.kind !== 'review' && session.status !== 'finished',
    ) ?? null
  );
}

/** No missed cards wins. An open sitting blocks a drill until the caller replaces it. */
export function missedDrillChoice(input: {
  missedCount: number;
  openSession: boolean;
  replaceOpen?: boolean;
}): 'none' | 'busy' | 'start' {
  if (input.missedCount <= 0) return 'none';
  if (input.openSession && !input.replaceOpen) return 'busy';
  return 'start';
}

export function drillStillOpenPrompt(deckName: string): string {
  return `${deckName} is still open. End it and start the drill?`;
}

export function pauseSession(session: LiveSession, now: number): LiveSession {
  if (session.status === 'finished') return session;
  if (session.runningSince == null) {
    return { ...session, status: 'paused', updatedAt: now };
  }
  return {
    ...session,
    accumulatedMs: elapsedMs(session, now),
    runningSince: null,
    status: 'paused',
    updatedAt: now,
  };
}

/** Hide, lock, or pagehide: stop the clock and do not count time while away. */
export function noteHidden(session: LiveSession, now: number): LiveSession {
  return pauseSession(session, now);
}

export function resumeSession(session: LiveSession, now: number): LiveSession {
  if (session.status === 'finished') return session;
  const next: LiveSession = {
    ...session,
    runningSince: session.runningSince ?? now,
    status: 'active',
    updatedAt: now,
  };
  return expireIfNeeded(next, now);
}

export function rehydrateSession(session: LiveSession, now: number): LiveSession {
  const normalized = normalizeSession(session);
  if (normalized.status === 'finished') return normalized;
  session = normalized;
  let accumulatedMs = session.accumulatedMs;
  if (session.runningSince != null) {
    const until = Math.min(now, session.updatedAt);
    accumulatedMs += Math.max(0, until - session.runningSince);
  }
  return {
    ...session,
    accumulatedMs,
    runningSince: null,
    status: 'paused',
    updatedAt: now,
  };
}

export function moveIndex(session: LiveSession, index: number, now: number): LiveSession {
  const bounded = Math.max(0, Math.min(index, Math.max(session.cardIds.length - 1, 0)));
  return touch({ ...session, index: bounded }, now);
}

/** Older saves may omit flagged or store something else. Keep string ids and ignore the rest. */
export function storedFlagged(session: { flagged?: unknown }): string[] {
  return Array.isArray(session.flagged) ? session.flagged.filter((id): id is string => typeof id === 'string') : [];
}

/** Older saves have no skip fields. Fill them in so a reload cannot crash. */
export function normalizeSession(session: LiveSession): LiveSession {
  const raw = session as LiveSession & {
    skipped?: unknown;
    skipReview?: unknown;
    returnToReview?: unknown;
    bookmarkIndex?: unknown;
    flagged?: unknown;
  };
  return {
    ...session,
    flagged: storedFlagged(raw),
    skipped: Array.isArray(raw.skipped) ? raw.skipped.filter((id): id is string => typeof id === 'string') : [],
    skipReview: raw.skipReview === true,
    returnToReview: raw.returnToReview === true,
    bookmarkIndex: typeof raw.bookmarkIndex === 'number' ? raw.bookmarkIndex : null,
  };
}

/** Skipped cards that still have no answer, in exam order. */
export function skippedUnanswered(session: Pick<LiveSession, 'skipped' | 'answers' | 'cardIds'>): string[] {
  const answered = new Set(session.answers.map((answer) => answer.cardId));
  const skipped = new Set(session.skipped ?? []);
  const ordered: string[] = [];
  for (const id of session.cardIds) {
    if (skipped.has(id) && !answered.has(id) && !ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

export function liveScore(session: LiveSession): {
  answered: number;
  total: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  percent: number | null;
} {
  const unique = new Set(session.answers.map((answer) => answer.cardId));
  const correct = session.answers.filter((answer) => answer.correct).length;
  const incorrect = session.answers.filter((answer) => !answer.correct).length;
  const total = session.originalCount;
  return {
    answered: unique.size,
    total,
    correct,
    incorrect,
    unanswered: Math.max(0, total - unique.size),
    percent: session.answers.length ? correct / session.answers.length : null,
  };
}

function touch(session: LiveSession, now: number): LiveSession {
  if (session.status === 'finished') return session;
  if (session.runningSince == null) return { ...session, updatedAt: now };
  return {
    ...session,
    accumulatedMs: elapsedMs(session, now),
    runningSince: now,
    updatedAt: now,
  };
}

function expireIfNeeded(session: LiveSession, now: number): LiveSession {
  if (session.timerMode !== 'timed' || session.timeLimitMs == null || session.status === 'finished') {
    return session;
  }
  if (elapsedMs(session, now) < session.timeLimitMs) return session;
  return {
    ...session,
    accumulatedMs: session.timeLimitMs,
    runningSince: null,
    status: 'finished',
    finishedReason: 'time',
    updatedAt: now,
  };
}

function markComplete(session: LiveSession, now: number): LiveSession {
  return {
    ...session,
    status: 'finished',
    finishedReason: 'complete',
    runningSince: null,
    accumulatedMs: elapsedMs(session, now),
    skipReview: false,
    returnToReview: false,
    updatedAt: now,
  };
}

/**
 * Leave the current card by answering it or skipping it.
 * A skip does not record an answer and does not requeue the card.
 */
function settle(
  session: LiveSession,
  leftCardId: string,
  mode: 'answer' | 'skip',
  correct: boolean,
  now: number,
): LiveSession {
  let updated: LiveSession = { ...session };
  const fromReview = session.returnToReview;
  const drillLike = updated.kind === 'drill' || updated.kind === 'review';
  const onCurrent = updated.cardIds[updated.index] === leftCardId;
  const drillMiss = mode === 'answer' && !correct && drillLike;

  if (mode === 'skip') {
    if (!updated.skipped.includes(leftCardId)) updated.skipped = [...updated.skipped, leftCardId];
  } else {
    updated.skipped = updated.skipped.filter((id) => id !== leftCardId);
  }
  if (drillMiss) updated.cardIds = [...updated.cardIds, leftCardId];

  if (fromReview) {
    updated.returnToReview = false;
    const remaining = skippedUnanswered(updated);
    if (remaining.length > 0) {
      updated.skipReview = true;
      return updated;
    }
    if (drillMiss && updated.bookmarkIndex == null) {
      updated.skipReview = false;
      updated.index = updated.cardIds.length - 1;
      return updated;
    }
    if (updated.bookmarkIndex != null && updated.bookmarkIndex < updated.cardIds.length) {
      updated.index = updated.bookmarkIndex;
      updated.bookmarkIndex = null;
      updated.skipReview = false;
      return updated;
    }
    if (drillMiss) {
      updated.skipReview = false;
      updated.index = Math.max(0, updated.cardIds.length - 1);
      return updated;
    }
    updated.skipReview = false;
    return markComplete(updated, now);
  }

  if (onCurrent) updated.index = Math.min(updated.index + 1, updated.cardIds.length);
  updated.returnToReview = false;
  const remaining = skippedUnanswered(updated);
  const atEnd = updated.index >= updated.cardIds.length;
  const answeredIds = new Set(updated.answers.map((item) => item.cardId));
  const examDone = updated.kind === 'exam' && answeredIds.size >= updated.originalCount;
  const drillDone = drillLike && atEnd && remaining.length === 0;
  if (examDone || drillDone) return markComplete(updated, now);
  if (atEnd && remaining.length > 0) {
    updated.skipReview = true;
    updated.bookmarkIndex = null;
    return updated;
  }
  updated.skipReview = false;
  return updated;
}

/** Leave the card blank, advance, and keep the clock running. Not a review. */
export function skipQuestion(session: LiveSession, cardId: string, now: number): LiveSession {
  const next = touch(normalizeSession(session), now);
  if (next.status === 'finished') return next;
  const answered = new Set(next.answers.map((answer) => answer.cardId));
  if (answered.has(cardId)) return next;
  return expireIfNeeded(settle(next, cardId, 'skip', false, now), now);
}

/** Show the skipped-question list and remember where to continue. The clock keeps running. */
export function openSkipReview(session: LiveSession, now: number): LiveSession {
  const next = touch(normalizeSession(session), now);
  if (next.status === 'finished') return next;
  const atEnd = next.index >= next.cardIds.length;
  return {
    ...next,
    skipReview: true,
    returnToReview: false,
    bookmarkIndex: atEnd ? null : next.index,
  };
}

/** Jump to any question in the sitting. Skipped cards still return to the skip list afterward. */
export function jumpToQuestion(session: LiveSession, cardId: string, now: number): LiveSession {
  const next = touch(normalizeSession(session), now);
  if (next.status === 'finished') return next;
  const index = next.cardIds.indexOf(cardId);
  if (index < 0) return next;
  return {
    ...next,
    index,
    skipReview: false,
    returnToReview: skippedUnanswered(next).includes(cardId),
  };
}

export function jumpToSkipped(session: LiveSession, cardId: string, now: number): LiveSession {
  const next = touch(normalizeSession(session), now);
  if (next.status === 'finished') return next;
  const index = next.cardIds.indexOf(cardId);
  if (index < 0 || !skippedUnanswered(next).includes(cardId)) return next;
  return {
    ...next,
    index,
    skipReview: false,
    returnToReview: true,
  };
}

export function continueAfterReview(session: LiveSession, now: number): LiveSession {
  const next = touch(normalizeSession(session), now);
  if (next.status === 'finished' || next.bookmarkIndex == null) return next;
  const index = Math.max(0, Math.min(next.bookmarkIndex, Math.max(next.cardIds.length - 1, 0)));
  return {
    ...next,
    index,
    skipReview: false,
    returnToReview: false,
    bookmarkIndex: null,
  };
}

export function finishSession(session: LiveSession, now: number): LiveSession {
  const next = normalizeSession(session);
  if (next.status === 'finished') return next;
  return {
    ...next,
    accumulatedMs: elapsedMs(next, now),
    runningSince: null,
    status: 'finished',
    finishedReason: 'complete',
    skipReview: false,
    returnToReview: false,
    updatedAt: now,
  };
}

export function answerSession(
  session: LiveSession,
  answer: SessionAnswer,
): { session: LiveSession; finished: boolean } {
  const next = touch(normalizeSession(session), answer.at);
  const answers =
    next.kind === 'exam' && next.answers.some((item) => item.cardId === answer.cardId)
      ? next.answers.map((item) => (item.cardId === answer.cardId ? answer : item))
      : [...next.answers, answer];
  const updated = expireIfNeeded(settle({ ...next, answers }, answer.cardId, 'answer', answer.correct, answer.at), answer.at);
  return { session: updated, finished: updated.status === 'finished' };
}

export function sessionMissedCardIds(session: LiveSession): string[] {
  const latest = new Map<string, SessionAnswer>();
  for (const answer of session.answers) latest.set(answer.cardId, answer);
  return [...latest.values()].filter((answer) => !answer.correct).map((answer) => answer.cardId);
}

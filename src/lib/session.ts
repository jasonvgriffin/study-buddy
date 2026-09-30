import type { Card, LiveSession, SessionAnswer } from './types';
import { formatDuration, newId } from './format';

export const TIMED_EXAM_MS = 90 * 60 * 1000;

export function elapsedMs(session: Pick<LiveSession, 'accumulatedMs' | 'runningSince'>, now: number): number {
  if (session.runningSince == null) return session.accumulatedMs;
  return session.accumulatedMs + Math.max(0, now - session.runningSince);
}

export function resumeLabel(session: LiveSession, now: number): string {
  const total = session.kind === 'exam' ? session.originalCount : session.cardIds.length;
  const question = Math.min(session.index + 1, Math.max(total, 1));
  return `Resume ${session.deckName}: question ${question} of ${total}, ${formatDuration(elapsedMs(session, now))} elapsed`;
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
  if (session.status === 'finished') return session;
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

export function toggleFlag(session: LiveSession, cardId: string, now: number): LiveSession {
  const flagged = session.flagged.includes(cardId)
    ? session.flagged.filter((id) => id !== cardId)
    : [...session.flagged, cardId];
  return touch({ ...session, flagged }, now);
}

export function liveScore(session: LiveSession): {
  answered: number;
  total: number;
  correct: number;
  percent: number | null;
} {
  const unique = new Set(session.answers.map((answer) => answer.cardId));
  const correct = session.answers.filter((answer) => answer.correct).length;
  const total = session.originalCount;
  return {
    answered: unique.size,
    total,
    correct,
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

export function answerSession(
  session: LiveSession,
  answer: SessionAnswer,
): { session: LiveSession; finished: boolean } {
  const next = touch(session, answer.at);
  const answers = [...next.answers, answer];
  let cardIds = next.cardIds;
  if ((next.kind === 'drill' || next.kind === 'review') && !answer.correct) {
    cardIds = [...cardIds, answer.cardId];
  }
  let index = next.index;
  if (next.cardIds[next.index] === answer.cardId) index = Math.min(index + 1, cardIds.length);
  let updated: LiveSession = { ...next, answers, cardIds, index };
  const examDone =
    updated.kind === 'exam' &&
    new Set(updated.answers.map((item) => item.cardId)).size >= updated.originalCount;
  const drillDone =
    (updated.kind === 'drill' || updated.kind === 'review') && updated.index >= updated.cardIds.length;
  if (examDone || drillDone) {
    updated = {
      ...updated,
      status: 'finished',
      finishedReason: 'complete',
      runningSince: null,
      accumulatedMs: elapsedMs(updated, answer.at),
    };
  }
  updated = expireIfNeeded(updated, answer.at);
  return { session: updated, finished: updated.status === 'finished' };
}

export function sessionMissedCardIds(session: LiveSession): string[] {
  const latest = new Map<string, SessionAnswer>();
  for (const answer of session.answers) latest.set(answer.cardId, answer);
  return [...latest.values()].filter((answer) => !answer.correct).map((answer) => answer.cardId);
}

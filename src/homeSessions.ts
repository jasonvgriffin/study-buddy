type OpenSession = {
  status: string;
  subjectId: string;
  updatedAt: number;
};

/** Unfinished sittings in the current focus, most recently active first. */
export function openHomeSessions<T extends OpenSession>(
  sessions: readonly T[],
  inFocus: (subjectId: string) => boolean,
): T[] {
  return sessions
    .filter((session) => session.status !== 'finished' && inFocus(session.subjectId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

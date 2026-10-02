/** Label for the home Continue button. Subject names come from the saved subject list. */
export function continueButtonLabel(input: {
  subjects: readonly { id: string; name: string }[];
  /** Subject id stored on the in-progress session. */
  sessionSubjectId?: string | null;
  /** Subject id stored on the exam/deck that session belongs to. */
  deckSubjectId?: string | null;
}): string {
  const name =
    subjectName(input.subjects, input.sessionSubjectId) ??
    subjectName(input.subjects, input.deckSubjectId);
  return name ? `Continue ${name}` : 'Continue';
}

function subjectName(
  subjects: readonly { id: string; name: string }[],
  subjectId: string | null | undefined,
): string | null {
  if (!subjectId) return null;
  const name = subjects.find((subject) => subject.id === subjectId)?.name.trim() ?? '';
  return name || null;
}

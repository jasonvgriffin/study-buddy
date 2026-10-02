/** Label for a button that resumes an open sitting. */
export function resumeButtonLabel(testName: string | null | undefined): string {
  const name = testName?.trim() ?? '';
  return name ? `Resume ${name}` : 'Resume';
}

/** Current deck name for a resume button. Blank when that deck has no name. */
export function resumeTestName(
  decks: readonly { id: string; name: string }[],
  deckId: string | null | undefined,
): string | null {
  if (!deckId) return null;
  const name = decks.find((deck) => deck.id === deckId)?.name.trim() ?? '';
  return name || null;
}

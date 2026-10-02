/** Label for a button that resumes an open sitting. The name is a deck display label. */
export function resumeButtonLabel(testName: string | null | undefined): string {
  const name = testName?.trim() ?? '';
  return name ? `Resume ${name}` : 'Resume';
}

const FEEDBACK_ADDRESS = 'eve.chief_of_staff@agentmail.to';

export function feedbackMailHref(version: string, builtAtIso: string): string {
  const built = `${builtAtIso.slice(0, 16).replace('T', ' ')} UTC`;
  const subject = 'Study Buddy feedback';
  const body = `What happened:\n\n\nApp version: ${version}\nBuild: ${built}`;
  return `mailto:${FEEDBACK_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

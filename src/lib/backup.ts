export const BACKUP_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;

export function latestStudyActivity(reviews: { at: number }[]): number | null {
  let latest: number | null = null;
  for (const review of reviews) {
    if (latest == null || review.at > latest) latest = review.at;
  }
  return latest;
}

/** The 7-day banner is only on the Settings screen, not Home or the other pages. */
export function backupReminderOnScreen(routeName: string): boolean {
  return routeName === 'settings';
}

/** Show the reminder after study, until a backup is exported or the banner is dismissed. */
export function backupReminderDue(input: {
  now: number;
  exportedAt: number | null;
  dismissedAt: number | null;
  activityAt: number | null;
}): boolean {
  if (input.activityAt == null) return false;
  if (input.exportedAt != null && input.now - input.exportedAt < BACKUP_REMINDER_MS) return false;
  if (input.dismissedAt != null && input.now - input.dismissedAt < BACKUP_REMINDER_MS) return false;
  return true;
}

import { describe, expect, it } from 'vitest';
import { BACKUP_REMINDER_MS, backupReminderDue, backupReminderOnScreen, latestStudyActivity } from './backup';

describe('backup reminder', () => {
  it('shows only on the Settings screen', () => {
    expect(backupReminderOnScreen('settings')).toBe(true);
    for (const route of ['home', 'stats', 'deck', 'session', 'review', 'results']) {
      expect(backupReminderOnScreen(route)).toBe(false);
    }
  });

  const now = 1_700_000_000_000;

  it('stays quiet until someone has answered a card', () => {
    expect(latestStudyActivity([])).toBeNull();
    expect(latestStudyActivity([{ at: 10 }, { at: 40 }, { at: 25 }])).toBe(40);
    expect(
      backupReminderDue({ now, exportedAt: null, dismissedAt: null, activityAt: null }),
    ).toBe(false);
  });

  it('shows after study when no backup was exported in the last 7 days', () => {
    expect(
      backupReminderDue({ now, exportedAt: null, dismissedAt: null, activityAt: now - 1000 }),
    ).toBe(true);
    expect(
      backupReminderDue({
        now,
        exportedAt: now - BACKUP_REMINDER_MS - 1,
        dismissedAt: null,
        activityAt: now - 1000,
      }),
    ).toBe(true);
    expect(
      backupReminderDue({
        now,
        exportedAt: now - 60_000,
        dismissedAt: null,
        activityAt: now - 1000,
      }),
    ).toBe(false);
  });

  it('hides a dismissed banner for 7 days and shows it again after that', () => {
    expect(
      backupReminderDue({
        now,
        exportedAt: null,
        dismissedAt: now - 60_000,
        activityAt: now - 1000,
      }),
    ).toBe(false);
    expect(
      backupReminderDue({
        now,
        exportedAt: null,
        dismissedAt: now - BACKUP_REMINDER_MS - 1,
        activityAt: now - 1000,
      }),
    ).toBe(true);
  });
});

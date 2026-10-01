import { backupReminderDue, latestStudyActivity } from './lib/backup';
import { useStudy } from './store';

export function BackupReminder() {
  const study = useStudy();
  const snap = study.snap;
  if (!snap) return null;
  const due = backupReminderDue({
    now: Date.now(),
    exportedAt: snap.backup?.exportedAt ?? null,
    dismissedAt: snap.backup?.reminderDismissedAt ?? null,
    activityAt: latestStudyActivity(snap.reviews),
  });
  if (!due) return null;
  return (
    <div className="banner stack" data-testid="backup-reminder" role="status">
      <p style={{ margin: 0 }}>
        No backup exported in the last 7 days. Export a copy so clearing site data does not wipe your decks.
      </p>
      <button className="btn btn-primary btn-block" data-testid="backup-reminder-export" type="button" onClick={() => void study.downloadBackup()}>
        Export backup
      </button>
      <button className="btn btn-ghost btn-block" data-testid="backup-reminder-dismiss" type="button" onClick={() => void study.dismissBackupReminder()}>
        Dismiss
      </button>
    </div>
  );
}

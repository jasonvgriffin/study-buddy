import { useState } from 'react';
import { Screen } from './bits';
import { TEXT_SIZE_LABELS, TEXT_SIZES, readTextSize, writeTextSize, type TextSize } from './lib/textSize';
import { useStudy } from './store';

export function Settings() {
  const study = useStudy();
  const [error, setError] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<TextSize>(() => readTextSize());
  const persist = study.snap?.persist;
  const persistText =
    persist?.granted === true
      ? 'This browser has marked Study Buddy’s storage as persistent.'
      : persist?.granted === false
        ? 'Persistent storage was not granted. Export a backup so a data clear does not wipe your decks.'
        : 'Persistent storage is not available in this browser.';

  return (
    <Screen title="Settings" lede="Decks, answers, and paused exams stay in IndexedDB on this device.">
      <article className="card stack" style={{ padding: '1rem' }}>
        <h2>Text size</h2>
        <p className="muted" style={{ margin: 0 }}>
          Applies on this device and stays after a refresh.
        </p>
        <div className="stack">
          {TEXT_SIZES.map((size) => (
            <button
              key={size}
              className={textSize === size ? 'btn btn-primary btn-block' : 'btn btn-ghost btn-block'}
              type="button"
              data-testid={`text-size-${size}`}
              aria-pressed={textSize === size}
              onClick={() => {
                writeTextSize(size);
                setTextSize(size);
              }}
            >
              {TEXT_SIZE_LABELS[size]}
            </button>
          ))}
        </div>
      </article>
      <article className="card stack" style={{ padding: '1rem' }}>
        <h2>Storage</h2>
        <p style={{ margin: 0 }}>{persistText}</p>
        <button className="btn btn-ghost" type="button" onClick={() => void study.askPersist()}>
          Ask to keep this data
        </button>
      </article>
      <article className="card stack" style={{ padding: '1rem' }}>
        <h2>Backup</h2>
        <p className="muted" style={{ margin: 0 }}>
          Export JSON after a study session. Import replaces what is currently stored on this device.
        </p>
        <button className="btn btn-primary" type="button" onClick={() => void study.downloadBackup()}>
          Export backup
        </button>
        <label className="btn btn-ghost btn-block">
          Import backup
          <input
            hidden
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              void study.restoreBackup(file).catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : 'Could not import that file.');
              });
            }}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
      </article>
      <article className="card stack" style={{ padding: '1rem' }}>
        <h2>Using on Brave (mobile)</h2>
        <p style={{ margin: 0 }}>
          Open this site in Brave, then use the menu to add it to your home screen. If the page looks blocked, tap the Brave lion and turn Shields down for this site only.
        </p>
        <p style={{ margin: 0 }}>
          Clearing site data, or using a private tab, erases decks and history. Export a backup first. Study Buddy does not use cookies, analytics, or a network request to fetch questions.
        </p>
      </article>
    </Screen>
  );
}

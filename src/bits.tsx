import { useEffect, useRef, type ReactNode } from 'react';
import { messerHref } from './lib/messer';
import { drillStillOpenPrompt } from './lib/session';

export function WatchLesson({
  href,
  title,
  onPersist,
}: {
  href: string;
  title: string | null;
  onPersist: () => Promise<void>;
}) {
  return (
    <a
      className="lesson-link"
      data-testid="watch-lesson"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        event.preventDefault();
        void onPersist().then(() => {
          window.open(href, '_blank', 'noopener,noreferrer');
        });
      }}
    >
      {title ? `Watch the lesson: ${title}` : 'Watch the lesson'}
    </a>
  );
}

export function MesserVideoLink({ certId, domainName }: { certId: string | null; domainName: string }) {
  const href = messerHref(certId, domainName);
  if (!href) return null;
  return (
    <a className="lesson-link" data-testid="messer-link" href={href} target="_blank" rel="noopener noreferrer">
      Watch the Messer video
    </a>
  );
}

export function DestructiveConfirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm-layer">
      <div
        className="card stack confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        data-testid="confirm-dialog"
      >
        <h2 id="confirm-title">{title}</h2>
        <p style={{ margin: 0 }}>{body}</p>
        <button className="btn btn-clay btn-block" data-testid="confirm-destructive" type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button className="btn btn-ghost btn-block" data-testid="confirm-cancel" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Inline confirm beside Drill missed cards when that test already has an open sitting. */
export function DrillReplacePrompt({
  deckName,
  onStart,
  onCancel,
}: {
  deckName: string;
  onStart: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="stack" data-testid="drill-replace">
      <p data-testid="drill-replace-text" style={{ margin: 0 }}>
        {drillStillOpenPrompt(deckName)}
      </p>
      <button className="btn btn-primary btn-block" data-testid="drill-replace-start" type="button" onClick={onStart}>
        Start drill
      </button>
      <button className="btn btn-ghost btn-block" data-testid="drill-replace-cancel" type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** Shown before Discard and start over erases the device. Nothing is removed until confirm. */
export function ResetConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <DestructiveConfirm
      title="Discard and start over?"
      body="This clears every subject, uploaded PDF, test, saved session, score, streak, and study recommendation on this device."
      confirmLabel="Discard everything"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

/** A form that opens on demand, in the slot above the page's main action. */
export function DemandPanel({
  title,
  testId = 'demand-panel',
  onCancel,
  children,
}: {
  title: string;
  testId?: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.scrollIntoView({ block: 'start' });
    const field = root.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, select');
    field?.focus();
  }, []);
  return (
    <section ref={ref} className="card stack demand-panel" data-testid={testId} aria-label={title} style={{ padding: '1rem' }}>
      <h2>{title}</h2>
      {children}
      <button className="btn btn-ghost btn-block" data-testid="demand-cancel" type="button" onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}

export function Screen({
  title,
  lede,
  children,
  onBack,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="stack">
      {onBack ? (
        <button className="btn btn-ghost" type="button" onClick={onBack}>
          Back
        </button>
      ) : null}
      <header className="stack" style={{ gap: '0.35rem' }}>
        <h1>{title}</h1>
        {lede ? <p className="muted" style={{ margin: 0 }}>{lede}</p> : null}
      </header>
      {children}
    </div>
  );
}

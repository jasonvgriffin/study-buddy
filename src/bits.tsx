import type { ReactNode } from 'react';

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

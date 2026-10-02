import { useMemo, useState } from 'react';
import { certById, detectCert, isCertId, CERTS, type CertId } from './lib/comptia';
import {
  initialWeightRows,
  sampleExam,
  sampleNotes,
  officialRows,
  type SimCard,
  type WeightRow,
} from './lib/examSim';
import type { Deck } from './lib/types';

export function ExamSimPanel({
  subjectName,
  decks,
  cards,
  onStart,
  onCancel,
}: {
  subjectName: string;
  decks: Deck[];
  cards: SimCard[];
  onStart: (cardIds: string[]) => void;
  onCancel: () => void;
}) {
  const detected = useMemo(
    () => detectCert([subjectName, ...decks.flatMap((deck) => [deck.name, deck.sourceFileName])]),
    [subjectName, decks],
  );
  const [certId, setCertId] = useState<CertId | ''>(detected ?? '');
  const [rows, setRows] = useState<WeightRow[]>(() => initialWeightRows(detected, decks, cards));
  const [countText, setCountText] = useState('90');
  const count = Math.max(0, Math.floor(Number(countText)));
  const sample = useMemo(
    () => sampleExam({ cards, rows, count: Number.isFinite(count) ? count : 0 }),
    [cards, rows, count],
  );
  const notes = sampleNotes(sample);
  const certLabel = certId ? certById(certId).label : 'No cert detected';

  function chooseCert(value: string) {
    const next = isCertId(value) ? value : '';
    setCertId(next);
    if (next && next !== detected) setRows(officialRows(next));
    else setRows(initialWeightRows(next || null, decks, cards));
  }

  return (
    <section className="card stack" data-testid="exam-sim-panel" aria-label="Exam simulation" style={{ padding: '1rem' }}>
      <h2>Exam simulation</h2>
      <p data-testid="exam-sim-cert-name" style={{ margin: 0 }}>
        {certLabel}
      </p>
      <p className="muted" data-testid="exam-sim-subject" style={{ margin: 0 }}>
        {subjectName}
      </p>
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Cert</span>
        <select
          className="field"
          data-testid="exam-sim-cert"
          value={certId}
          onChange={(event) => chooseCert(event.target.value)}
        >
          <option value="">No cert</option>
          {CERTS.map((cert) => (
            <option key={cert.id} value={cert.id}>
              {cert.label}
            </option>
          ))}
        </select>
      </label>
      {rows.length ? (
        <div className="stack" data-testid="exam-sim-weights">
          {rows.map((row) => (
            <label
              key={row.key}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
            >
              <span>{row.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <input
                  className="field"
                  data-testid="exam-sim-weight"
                  data-domain={row.name}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label={`${row.name} percent`}
                  value={row.percent}
                  style={{ width: '5.5rem' }}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    const percent = Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
                    setRows((current) => current.map((item) => (item.key === row.key ? { ...item, percent } : item)));
                  }}
                />
                <span>%</span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          No domains on these questions. The sitting uses questions from every test in this subject.
        </p>
      )}
      <label className="stack" style={{ gap: '0.35rem' }}>
        <span>Questions</span>
        <input
          className="field"
          data-testid="exam-sim-count"
          type="number"
          inputMode="numeric"
          min={1}
          value={countText}
          onChange={(event) => setCountText(event.target.value)}
        />
      </label>
      {notes.length ? (
        <div className="stack" data-testid="exam-sim-notes">
          {notes.map((line) => (
            <p key={line} style={{ margin: 0 }}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
      <button
        className="btn btn-primary btn-block"
        data-testid="exam-sim-start"
        type="button"
        disabled={!sample.ids.length}
        onClick={() => onStart(sample.ids)}
      >
        Start
      </button>
      <button className="btn btn-ghost btn-block" data-testid="exam-sim-cancel" type="button" onClick={onCancel}>
        Cancel
      </button>
    </section>
  );
}

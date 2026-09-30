import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  deleteDeck,
  deleteDraft,
  deleteSessionAndReviews,
  deleteSubject,
  exportBackup,
  importBackup,
  loadSnapshot,
  putCard,
  putDeck,
  putDeckBundle,
  putDraft,
  putReviewBundle,
  putSession,
  putSubject,
  replaceMemories,
  requestPersistentStorage,
  type StudySnapshot,
} from './lib/db';
import { newId } from './lib/format';
import { lessonTitle, watchUrl } from './lib/lessons';
import { extractPdfPages } from './lib/pdfExtract';
import { choiceGraded, gradeLabels, parseDocument } from './lib/parser';
import { dueCardIds } from './lib/queue';
import {
  applyReview,
  emptyMemory,
  isUnclearedMiss,
  memoryFromReviews,
  orderForDrill,
} from './lib/scoring';
import {
  activeSessionForDeck,
  answerSession,
  createDrillSession,
  createExamSession,
  createReviewSession,
  noteHidden,
  rehydrateSession,
  resumeSession,
  toggleFlag,
} from './lib/session';
import type {
  BackupFile,
  Card,
  CardMemory,
  Deck,
  ImportDraft,
  LiveSession,
  Review,
  Subject,
} from './lib/types';
import { navigate, parseRoute, type Route } from './nav';

type StudyApi = {
  ready: boolean;
  bootError: string | null;
  busy: string | null;
  message: string | null;
  route: Route;
  focus: string | 'all';
  snap: StudySnapshot | null;
  setFocus: (id: string | 'all') => void;
  setMessage: (message: string | null) => void;
  addSubject: (name: string) => Promise<string>;
  renameSubject: (id: string, name: string) => Promise<void>;
  removeSubject: (id: string) => Promise<void>;
  importPdf: (file: File) => Promise<void>;
  loadSample: (which: 'three' | 'notes') => Promise<void>;
  saveDraftTests: (draft: ImportDraft) => Promise<void>;
  writeDraft: (draft: ImportDraft) => Promise<void>;
  dropDraft: (id: string) => Promise<void>;
  renameDeck: (deck: Deck, name: string) => Promise<void>;
  removeDeck: (deckId: string) => Promise<void>;
  writeCard: (card: Card) => Promise<void>;
  startExam: (deck: Deck, timed: boolean) => Promise<void>;
  startMissedDrill: (deck: Deck, section: string | null) => Promise<void>;
  startDueReview: (label: string, filter: ReviewFilter) => Promise<void>;
  startRecommendation: (rec: {
    id: string;
    scope: string;
    label: string;
    deckId: string | null;
    subjectId: string;
    section: string | null;
  }) => Promise<void>;
  answer: (
    sessionId: string,
    card: Card,
    chosenLabels: string[],
    correct: boolean,
  ) => Promise<{ finished: boolean }>;
  pause: (sessionId: string) => Promise<void>;
  resume: (sessionId: string) => Promise<void>;
  discard: (sessionId: string) => Promise<void>;
  flag: (sessionId: string, cardId: string) => Promise<void>;
  persistSession: (sessionId: string) => Promise<void>;
  syncTimer: (sessionId: string) => Promise<void>;
  downloadBackup: () => Promise<void>;
  restoreBackup: (file: File) => Promise<void>;
  askPersist: () => Promise<void>;
};

export type ReviewFilter = {
  subjectId?: string | null;
  deckId?: string | null;
  domainNumber?: number | null;
  objective?: string | null;
  scopeKey: string;
};

const StudyContext = createContext<StudyApi | null>(null);

export function StudyProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<StudySnapshot | null>(null);
  const snapRef = useRef<StudySnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  const [focus, setFocus] = useState<string | 'all'>('all');
  const routeRef = useRef(route);
  const focusRef = useRef(focus);
  const draftWrites = useRef(Promise.resolve());
  routeRef.current = route;
  focusRef.current = focus;

  const replaceSnap = (next: StudySnapshot) => {
    snapRef.current = next;
    setSnap(next);
  };

  const patch = (fn: (current: StudySnapshot) => StudySnapshot) => {
    setSnap((prev) => {
      const base = prev ?? snapRef.current;
      if (!base) return prev;
      const next = fn(base);
      snapRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const loaded = await loadSnapshot();
        const now = Date.now();
        const sessions: LiveSession[] = [];
        for (const session of loaded.sessions) {
          if (session.status === 'finished') {
            sessions.push(session);
            continue;
          }
          const next = rehydrateSession(session, now);
          if (session.status !== 'paused' || session.runningSince != null) await putSession(next);
          sessions.push(next);
        }
        if (cancel) return;
        replaceSnap({ ...loaded, sessions });
        setReady(true);
        const granted = await requestPersistentStorage();
        if (cancel) return;
        patch((current) => ({
          ...current,
          persist: { key: 'persist', granted, at: Date.now() },
        }));
      } catch (error) {
        if (!cancel) setBootError(error instanceof Error ? error.message : 'Could not open saved study data.');
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const pauseIfLeaving = (from: Route, to: Route) => {
      if (from.name !== 'session') return;
      if (to.name === 'session' && to.sessionId === from.sessionId) return;
      void pause(from.sessionId);
    };
    const onHash = () => {
      const next = parseRoute(location.hash);
      pauseIfLeaving(routeRef.current, next);
      routeRef.current = next;
      setRoute(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const hide = () => {
      const current = snapRef.current;
      if (!current) return;
      if (document.visibilityState === 'hidden') {
        for (const session of current.sessions) {
          if (session.status === 'active') void pause(session.id);
        }
      }
    };
    const onPageHide = () => {
      const current = snapRef.current;
      if (!current) return;
      for (const session of current.sessions) {
        if (session.status === 'active') void pause(session.id);
      }
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  async function pause(sessionId: string) {
    const current = snapRef.current;
    const session = current?.sessions.find((item) => item.id === sessionId);
    if (!session || session.status !== 'active') return;
    const next = noteHidden(session, Date.now());
    await putSession(next);
    patch((state) => ({
      ...state,
      sessions: state.sessions.map((item) => (item.id === sessionId ? next : item)),
    }));
  }

  async function addSubject(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Name the subject first.');
    const now = Date.now();
    const subject: Subject = { id: newId(), name: trimmed, createdAt: now, updatedAt: now };
    await putSubject(subject);
    patch((state) => ({ ...state, subjects: [...state.subjects, subject] }));
    setFocus(subject.id);
    return subject.id;
  }

  async function renameSubject(id: string, name: string) {
    const current = snapRef.current?.subjects.find((subject) => subject.id === id);
    if (!current) return;
    const next = { ...current, name: name.trim() || current.name, updatedAt: Date.now() };
    await putSubject(next);
    patch((state) => ({
      ...state,
      subjects: state.subjects.map((subject) => (subject.id === id ? next : subject)),
    }));
  }

  async function removeSubject(id: string) {
    await deleteSubject(id);
    patch((state) => ({
      ...state,
      subjects: state.subjects.filter((subject) => subject.id !== id),
      decks: state.decks.filter((deck) => deck.subjectId !== id),
      cards: state.cards.filter((card) => card.subjectId !== id),
      reviews: state.reviews.filter((review) => review.subjectId !== id),
      sessions: state.sessions.filter((session) => session.subjectId !== id),
      memories: state.memories.filter((memory) => memory.subjectId !== id),
      drafts: state.drafts.filter((draft) => draft.subjectId !== id),
    }));
    setFocus((current) => (current === id ? 'all' : current));
  }

  function selectedSubjectId(): string | null {
    return focusRef.current === 'all' ? null : focusRef.current;
  }

  async function importPdf(file: File) {
    const subjectId = selectedSubjectId();
    if (!subjectId) {
      setMessage('Choose a subject before uploading. All subjects is a view, not a place to store a PDF.');
      return;
    }
    setMessage(null);
    setBusy(`Reading ${file.name}`);
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const pages = await extractPdfPages(data, (page, total) => {
        setBusy(`Reading page ${page} of ${total}`);
      });
      setBusy('Finding questions');
      const doc = parseDocument(pages);
      const tests = doc.tests.filter((test) => test.cards.length > 0);
      if (!tests.length) {
        setMessage('No questions found in that PDF. Study Buddy reads text in the file. Scanned pages need OCR first.');
        return;
      }
      const draft: ImportDraft = {
        id: newId(),
        subjectId,
        fileName: file.name,
        tests,
        domains: doc.domains,
        videoStarts: {},
        updatedAt: Date.now(),
      };
      await putDraft(draft);
      patch((state) => ({ ...state, drafts: [...state.drafts.filter((item) => item.id !== draft.id), draft] }));
      navigate(`/review/${draft.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read that PDF.');
    } finally {
      setBusy(null);
    }
  }

  async function loadSample(which: 'three' | 'notes') {
    const subjectId = selectedSubjectId();
    if (!subjectId) {
      setMessage('Choose a subject before loading a sample.');
      return;
    }
    const fileName = which === 'three' ? 'sample-three-tests.pdf' : 'sample-notes.pdf';
    setBusy('Loading the sample PDF');
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}samples/${fileName}`);
      if (!response.ok) throw new Error('The sample PDF is missing from this build.');
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: 'application/pdf' });
      await importPdf(file);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load the sample.');
      setBusy(null);
    }
  }

  async function writeDraft(draft: ImportDraft) {
    const next = { ...draft, updatedAt: Date.now() };
    patch((state) => ({
      ...state,
      drafts: state.drafts.map((item) => (item.id === next.id ? next : item)),
    }));
    const job = draftWrites.current.then(() => putDraft(next));
    draftWrites.current = job.then(
      () => undefined,
      () => undefined,
    );
    await job;
  }

  async function dropDraft(id: string) {
    await deleteDraft(id);
    patch((state) => ({ ...state, drafts: state.drafts.filter((draft) => draft.id !== id) }));
    navigate('/');
  }

  async function saveDraftTests(draft: ImportDraft) {
    if (!draft.subjectId) {
      setMessage('Choose a subject before saving.');
      return;
    }
    const subjectId = draft.subjectId;
    const now = Date.now();
    const stem = draft.fileName.replace(/\.pdf$/i, '');
    for (let testIndex = 0; testIndex < draft.tests.length; testIndex += 1) {
      const test = draft.tests[testIndex];
      const deckId = newId();
      const name = test.name === 'Imported test' && draft.tests.length === 1 ? stem : test.name;
      const deck: Deck = {
        id: deckId,
        subjectId,
        name,
        sourceFileName: draft.fileName,
        sourceGroupId: draft.id,
        domains: draft.domains,
        createdAt: now,
        updatedAt: now,
      };
      const cards: Card[] = test.cards.map((card, cardIndex) => {
        const raw = draft.videoStarts?.[`${testIndex}:${cardIndex}`];
        const videoStartSec = typeof raw === 'number' && raw > 0 ? Math.floor(raw) : null;
        return {
          ...card,
          id: newId(),
          deckId,
          subjectId,
          order: cardIndex,
          videoStartSec,
        };
      });
      await putDeckBundle(deck, cards);
    }
    await deleteDraft(draft.id);
    const loaded = await loadSnapshot();
    replaceSnap(loaded);
    setFocus(subjectId);
    navigate('/');
  }

  async function renameDeck(deck: Deck, name: string) {
    const next = { ...deck, name: name.trim() || deck.name, updatedAt: Date.now() };
    await putDeck(next);
    patch((state) => ({
      ...state,
      decks: state.decks.map((item) => (item.id === deck.id ? next : item)),
    }));
  }

  async function removeDeck(deckId: string) {
    await deleteDeck(deckId);
    patch((state) => ({
      ...state,
      decks: state.decks.filter((deck) => deck.id !== deckId),
      cards: state.cards.filter((card) => card.deckId !== deckId),
      reviews: state.reviews.filter((review) => review.deckId !== deckId),
      sessions: state.sessions.filter((session) => session.deckId !== deckId),
      memories: state.memories.filter((memory) => memory.deckId !== deckId),
    }));
    navigate('/');
  }

  async function writeCard(card: Card) {
    await putCard(card);
    patch((state) => ({
      ...state,
      cards: state.cards.map((item) => (item.id === card.id ? card : item)),
    }));
  }

  function blockIfBusyDeck(deckId: string): LiveSession | null {
    const existing = activeSessionForDeck(snapRef.current?.sessions ?? [], deckId);
    if (!existing) return null;
    setMessage('This test already has a session in progress. Resume it, or discard it, before starting another.');
    return existing;
  }

  async function openSession(session: LiveSession) {
    await putSession(session);
    patch((state) => ({ ...state, sessions: [...state.sessions, session] }));
    navigate(`/session/${session.id}`);
  }

  async function startExam(deck: Deck, timed: boolean) {
    const cards = (snapRef.current?.cards ?? []).filter((card) => card.deckId === deck.id);
    if (!cards.length) {
      setMessage('This test has no cards.');
      return;
    }
    if (blockIfBusyDeck(deck.id)) return;
    const session = createExamSession(deck, cards, timed ? 'timed' : 'untimed', Date.now());
    await openSession(session);
  }

  async function startMissedDrill(deck: Deck, section: string | null) {
    const state = snapRef.current;
    if (!state) return;
    const cards = state.cards.filter((card) => card.deckId === deck.id);
    const memories = new Map(state.memories.map((memory) => [memory.cardId, memory]));
    const missed = cards.filter((card) => {
      if (section && card.section !== section && card.objective !== section) return false;
      const memory = memories.get(card.id);
      return memory ? isUnclearedMiss(memory) : false;
    });
    const ordered = orderForDrill(
      missed.map((card) => memories.get(card.id)).filter((memory): memory is CardMemory => !!memory),
      Date.now(),
    );
    if (!ordered.length) {
      setMessage('No missed cards in this test yet.');
      return;
    }
    if (blockIfBusyDeck(deck.id)) return;
    const session = createDrillSession(deck, cards, ordered, section, Date.now());
    await openSession(session);
  }

  async function startDueReview(label: string, filter: ReviewFilter) {
    const state = snapRef.current;
    if (!state) return;
    const existing = state.sessions.find(
      (session) => session.scopeKey === filter.scopeKey && session.status !== 'finished',
    );
    if (existing) {
      navigate(`/session/${existing.id}`);
      return;
    }
    const ids = dueCardIds(state.cards, state.memories, Date.now(), filter);
    if (!ids.length) {
      setMessage('Nothing is due there yet.');
      return;
    }
    const cards = state.cards.filter((card) => ids.includes(card.id));
    const first = cards[0];
    if (!first) return;
    const session = createReviewSession(
      label,
      filter.subjectId ?? first.subjectId,
      filter.deckId ?? first.deckId,
      cards,
      ids,
      filter.domainNumber ?? null,
      filter.scopeKey,
      Date.now(),
    );
    await openSession(session);
  }

  async function startRecommendation(rec: {
    id: string;
    scope: string;
    label: string;
    deckId: string | null;
    subjectId: string;
    section: string | null;
  }) {
    const state = snapRef.current;
    if (!state) return;
    if (rec.scope === 'subject' || rec.scope === 'domain') {
      const domainNumber = rec.scope === 'domain' ? Number(rec.id.split(':').at(-1)) : null;
      await startDueReview(rec.label, {
        subjectId: rec.subjectId,
        domainNumber: Number.isFinite(domainNumber) ? domainNumber : null,
        scopeKey: `review:${rec.id}`,
      });
      return;
    }
    if (!rec.deckId) {
      setMessage('Nothing is due there yet.');
      return;
    }
    const deck = state.decks.find((item) => item.id === rec.deckId);
    if (!deck) return;
    const memories = new Map(state.memories.map((memory) => [memory.cardId, memory]));
    const pool = state.cards.filter((card) => {
      if (card.deckId !== deck.id) return false;
      if (rec.scope === 'objective' && rec.section && card.objective !== rec.section) return false;
      return true;
    });
    const missed = pool.filter((card) => {
      const memory = memories.get(card.id);
      return memory ? isUnclearedMiss(memory) : false;
    });
    if (missed.length) {
      if (blockIfBusyDeck(deck.id)) return;
      const ordered = orderForDrill(
        missed.map((card) => memories.get(card.id)).filter((memory): memory is CardMemory => !!memory),
        Date.now(),
      );
      const session = createDrillSession(deck, state.cards, ordered, rec.section, Date.now());
      await openSession(session);
      return;
    }
    const due = dueCardIds(pool, state.memories, Date.now(), { deckId: deck.id });
    if (due.length) {
      await startDueReview(rec.label, {
        subjectId: deck.subjectId,
        deckId: deck.id,
        objective: rec.scope === 'objective' ? rec.section : null,
        scopeKey: `review:${rec.id}`,
      });
      return;
    }
    const fresh = pool.filter((card) => (memories.get(card.id)?.attempts ?? 0) === 0).map((card) => card.id);
    if (fresh.length) {
      if (blockIfBusyDeck(deck.id)) return;
      const session = createDrillSession(deck, state.cards, fresh, rec.section, Date.now());
      await openSession(session);
      return;
    }
    setMessage('Nothing is due there yet.');
  }

  async function answer(sessionId: string, card: Card, chosenLabels: string[], correct: boolean) {
    const state = snapRef.current;
    const found = state?.sessions.find((session) => session.id === sessionId);
    if (!state || !found) return { finished: false };
    const now = Date.now();
    const session = found.status === 'paused' ? resumeSession(found, now) : found;
    const review: Review = {
      id: newId(),
      cardId: card.id,
      deckId: card.deckId,
      subjectId: card.subjectId,
      sessionId,
      correct,
      chosenLabels,
      at: now,
    };
    const prior =
      state.memories.find((memory) => memory.cardId === card.id) ??
      emptyMemory(card.id, card.deckId, card.subjectId);
    const memory = applyReview(prior, correct, now);
    const { session: next, finished } = answerSession(session, {
      cardId: card.id,
      correct,
      chosenLabels,
      at: now,
    });
    await putReviewBundle(review, memory, next);
    patch((current) => ({
      ...current,
      reviews: [...current.reviews, review],
      memories: [
        ...current.memories.filter((item) => item.cardId !== memory.cardId),
        memory,
      ],
      sessions: current.sessions.map((item) => (item.id === sessionId ? next : item)),
    }));
    return { finished };
  }

  async function resume(sessionId: string) {
    const session = snapRef.current?.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const next = resumeSession(session, Date.now());
    await putSession(next);
    patch((state) => ({
      ...state,
      sessions: state.sessions.map((item) => (item.id === sessionId ? next : item)),
    }));
    const here = parseRoute(location.hash);
    if (next.status === 'finished') navigate(`/results/${sessionId}`);
    else if (here.name !== 'session' || here.sessionId !== sessionId) navigate(`/session/${sessionId}`);
  }

  async function discard(sessionId: string) {
    const removed = await deleteSessionAndReviews(sessionId);
    const loaded = await loadSnapshot();
    const affected = new Set(removed.map((review) => review.cardId));
    const rebuilt: CardMemory[] = [];
    for (const cardId of affected) {
      const card = loaded.cards.find((item) => item.id === cardId);
      if (!card) continue;
      const reviews = loaded.reviews.filter((review) => review.cardId === cardId);
      rebuilt.push(memoryFromReviews(card.id, card.deckId, card.subjectId, reviews));
    }
    if (rebuilt.length) await replaceMemories(rebuilt);
    const fresh = await loadSnapshot();
    replaceSnap(fresh);
    navigate('/');
  }

  async function flag(sessionId: string, cardId: string) {
    const session = snapRef.current?.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    const next = toggleFlag(session, cardId, Date.now());
    await putSession(next);
    patch((state) => ({
      ...state,
      sessions: state.sessions.map((item) => (item.id === sessionId ? next : item)),
    }));
  }

  async function persistSession(sessionId: string) {
    const session = snapRef.current?.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    await putSession(session);
  }

  async function syncTimer(sessionId: string) {
    const session = snapRef.current?.sessions.find((item) => item.id === sessionId);
    if (!session || session.status !== 'active' || session.timerMode !== 'timed') return;
    const next = resumeSession(session, Date.now());
    if (next.status !== 'finished') return;
    await putSession(next);
    patch((state) => ({
      ...state,
      sessions: state.sessions.map((item) => (item.id === sessionId ? next : item)),
    }));
  }

  async function downloadBackup() {
    const backup = await exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `study-buddy-backup-${backup.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function restoreBackup(file: File) {
    const text = await file.text();
    const backup = JSON.parse(text) as BackupFile;
    await importBackup(backup);
    replaceSnap(await loadSnapshot());
    setMessage('Backup restored on this device.');
    navigate('/');
  }

  async function askPersist() {
    const granted = await requestPersistentStorage();
    patch((state) => ({
      ...state,
      persist: { key: 'persist', granted, at: Date.now() },
    }));
  }

  const api = useMemo<StudyApi>(
    () => ({
      ready,
      bootError,
      busy,
      message,
      route,
      focus,
      snap,
      setFocus,
      setMessage,
      addSubject,
      renameSubject,
      removeSubject,
      importPdf,
      loadSample,
      saveDraftTests,
      writeDraft,
      dropDraft,
      renameDeck,
      removeDeck,
      writeCard,
      startExam,
      startMissedDrill,
      startDueReview,
      startRecommendation,
      answer,
      pause,
      resume,
      discard,
      flag,
      persistSession,
      syncTimer,
      downloadBackup,
      restoreBackup,
      askPersist,
    }),
    [ready, bootError, busy, message, route, focus, snap],
  );

  return <StudyContext.Provider value={api}>{children}</StudyContext.Provider>;
}

export function useStudy(): StudyApi {
  const value = useContext(StudyContext);
  if (!value) throw new Error('Study data is not ready.');
  return value;
}

export function gradedCorrect(card: Card, chosenLabels: string[], selfGrade: boolean | null): boolean {
  if (choiceGraded(card)) return gradeLabels(card.correctLabels, chosenLabels);
  return selfGrade === true;
}

export function lessonHref(card: Card): string | null {
  return watchUrl(card.lessonUrl, card.videoStartSec);
}

export function lessonLabel(card: Card): string | null {
  return lessonTitle(card.lessonUrl);
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  deleteCard,
  deleteDeck,
  deleteDraft,
  deleteSourceGroup,
  deleteSubject,
  exportBackup,
  importBackup,
  loadSnapshot,
  putFigures,
  relinkDraftFigures,
  putCard,
  putDeck,
  putDeckBundle,
  putDraft,
  putReviewBundle,
  putSession,
  putSubject,
  saveBackupMeta,
  requestPersistentStorage,
  wipeStudyDatabase,
  type StudySnapshot,
} from './lib/db';
import { newId } from './lib/format';
import { lessonTitle, watchUrl } from './lib/lessons';
import { assignFigures, bindFiguresToCards } from './lib/figures';
import { extractPdfStudy } from './lib/pdfExtract';
import { pbqFigureJobs } from './lib/regions';
import { choiceGraded, gradeLabels, parseDocument } from './lib/parser';
import { dueCardIds } from './lib/queue';
import {
  applyReview,
  emptyMemory,
  isUnclearedMiss,
  orderForDrill,
} from './lib/scoring';
import {
  activeSessionForDeck,
  answerSession,
  continueAfterReview,
  createDrillSession,
  createExamSession,
  createReviewSession,
  finishSession,
  jumpToQuestion,
  jumpToSkipped,
  noteHidden,
  openSkipReview,
  rehydrateSession,
  resumeSession,
  skipQuestion,
  skippedUnanswered,
  storedFlagged,
} from './lib/session';
import type {
  BackupFile,
  BackupMeta,
  Card,
  CardMemory,
  Deck,
  ImportDraft,
  LiveSession,
  Review,
  StoredFigure,
  Subject,
} from './lib/types';
import { parseHomeTab, resolveHomeTab, type HomeTab } from './homeTab';
import { navigate, parseRoute, type Route } from './nav';

type StudyApi = {
  ready: boolean;
  bootError: string | null;
  busy: string | null;
  message: string | null;
  route: Route;
  focus: string | 'all';
  homeTab: HomeTab | null;
  setHomeTab: (tab: HomeTab | null) => void;
  dataEpoch: number;
  snap: StudySnapshot | null;
  setFocus: (id: string | 'all') => void;
  setMessage: (message: string | null) => void;
  addSubject: (name: string) => Promise<string>;
  renameSubject: (id: string, name: string) => Promise<void>;
  removeSubject: (id: string) => Promise<void>;
  removeSource: (sourceGroupId: string) => Promise<void>;
  importPdf: (file: File) => Promise<void>;
  loadSample: (which: 'three' | 'notes') => Promise<void>;
  saveDraftTests: (draft: ImportDraft, options?: { replaceDeckIds?: string[] }) => Promise<void>;
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
  discard: () => Promise<void>;
  removeCard: (cardId: string) => Promise<void>;
  jumpToAny: (sessionId: string, cardId: string) => Promise<void>;
  skip: (sessionId: string, cardId: string) => Promise<void>;
  jumpTo: (sessionId: string, cardId: string) => Promise<void>;
  continueSession: (sessionId: string) => Promise<void>;
  endSession: (sessionId: string) => Promise<void>;
  persistSession: (sessionId: string) => Promise<void>;
  syncTimer: (sessionId: string) => Promise<void>;
  downloadBackup: () => Promise<void>;
  dismissBackupReminder: () => Promise<void>;
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
  const [homeTab, setHomeTabState] = useState<HomeTab | null>(() =>
    parseRoute(location.hash).name === 'home' ? parseHomeTab(location.hash) : null,
  );
  const [focus, setFocus] = useState<string | 'all'>('all');
  const [dataEpoch, setDataEpoch] = useState(0);
  const routeRef = useRef(route);
  const homeTabRef = useRef(homeTab);
  const focusRef = useRef(focus);
  const forceBlankHome = useRef(false);
  const draftWrites = useRef(Promise.resolve());
  routeRef.current = route;
  focusRef.current = focus;

  const setHomeTab = useCallback((tab: HomeTab | null) => {
    homeTabRef.current = tab;
    setHomeTabState(tab);
    if (tab === null && parseRoute(location.hash).name === 'home' && parseHomeTab(location.hash)) {
      navigate('/');
    }
  }, []);

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
      const prev = routeRef.current;
      const next = parseRoute(location.hash);
      if (next.name === 'home') {
        if (forceBlankHome.current) {
          forceBlankHome.current = false;
          homeTabRef.current = null;
          setHomeTabState(null);
        } else {
          const resolved = resolveHomeTab({
            current: homeTabRef.current,
            requested: parseHomeTab(location.hash),
            arriving: prev.name !== 'home',
            from: prev,
          });
          if (resolved && resolved !== homeTabRef.current) setHomeTab(resolved);
        }
      }
      pauseIfLeaving(prev, next);
      routeRef.current = next;
      setRoute(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [setHomeTab]);

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

  async function removeSource(sourceGroupId: string) {
    await deleteSourceGroup(sourceGroupId);
    replaceSnap(await loadSnapshot());
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
      const extracted = await extractPdfStudy(data, (page, total) => {
        setBusy(`Reading page ${page} of ${total}`);
      });
      setBusy('Finding questions');
      const doc = parseDocument(extracted.textPages);
      const tests = doc.tests
        .filter((test) => test.cards.length > 0)
        .map((test) => ({
          ...test,
          cards: test.cards.map((card) => ({ ...card, captureId: card.captureId ?? newId() })),
        }));
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
      const mapped = assignFigures({
        pageCount: extracted.pageCount,
        pages: extracted.pageSizes,
        lines: extracted.lines,
        chrome: extracted.chrome,
        images: extracted.images,
      });
      const pbqCards = tests.flatMap((test) =>
        test.cards.filter((card) => card.pbq).map((card) => ({ label: card.sourceLabel, task: card.pbq! })),
      );
      const regionJobs = pbqFigureJobs({
        cards: pbqCards,
        lines: extracted.lines,
        chrome: extracted.chrome,
        pages: extracted.pageSizes,
        images: extracted.images,
      });
      if (regionJobs.length) setBusy('Cropping figures for performance-based questions');
      const regionPngs = regionJobs.length ? await extracted.renderRegions(regionJobs) : new Map<string, Blob>();
      const figures: StoredFigure[] = [];
      for (const test of tests) {
        for (const card of test.cards) {
          if (!card.pbq || !card.captureId) continue;
          for (const job of regionJobs) {
            const [label, itemId] = job.id.split('#');
            if (label !== card.sourceLabel) continue;
            const png = regionPngs.get(job.id);
            if (!png) continue;
            figures.push({
              id: `${newId()}`,
              draftId: draft.id,
              cardId: null,
              captureId: card.captureId,
              role: 'question',
              itemId: itemId ?? null,
              png,
            });
          }
        }
      }
      if (mapped.assignments.length) {
        setBusy('Saving figures from the PDF');
        const pngs = await extracted.rasterize(mapped.assignments.map((item) => item.imageIndex));
        const links = bindFiguresToCards(tests, mapped.slots);
        for (const link of links) {
          const card = tests[link.testIndex]?.cards[link.cardIndex];
          const slot = mapped.slots[link.slotIndex];
          if (!card?.captureId || !slot) continue;
          const pairs: ['question' | 'explanation', number[]][] = [
            ['question', slot.questionImageIndexes],
            ['explanation', slot.explanationImageIndexes],
          ];
          for (const [role, indexes] of pairs) {
            // Performance-based questions get cleaned crops above; the raw page images there
            // include printed answer blanks and lists, so only explanation images are kept.
            if (card.pbq && role === 'question') continue;
            for (const imageIndex of indexes) {
              const png = pngs.get(imageIndex);
              if (!png) continue;
              figures.push({
                id: newId(),
                draftId: draft.id,
                cardId: null,
                captureId: card.captureId,
                role,
                png,
              });
            }
          }
        }
      }
      if (figures.length) {
        setBusy('Saving figures from the PDF');
        await putFigures(figures);
      }
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

  async function saveDraftTests(draft: ImportDraft, options?: { replaceDeckIds?: string[] }) {
    if (!draft.subjectId) {
      setMessage('Choose a subject before saving.');
      return;
    }
    // Re-importing the same PDF replaces the earlier decks (cards, figures, answers,
    // and paused sessions) so an old parse without figures cannot linger beside the new one.
    for (const deckId of options?.replaceDeckIds ?? []) {
      await deleteDeck(deckId);
    }
    const subjectId = draft.subjectId;
    const now = Date.now();
    const stem = draft.fileName.replace(/\.pdf$/i, '');
    const captureToCard = new Map<string, string>();
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
      for (const card of cards) {
        if (card.captureId) captureToCard.set(card.captureId, card.id);
      }
      await putDeckBundle(deck, cards);
    }
    await relinkDraftFigures(draft.id, captureToCard);
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

  async function discard() {
    const fresh = await wipeStudyDatabase();
    replaceSnap(fresh);
    focusRef.current = 'all';
    setFocus('all');
    setMessage(null);
    setBusy(null);
    setDataEpoch((epoch) => epoch + 1);
    forceBlankHome.current = true;
    homeTabRef.current = null;
    setHomeTabState(null);
    navigate('/');
  }

  async function removeCard(cardId: string) {
    await deleteCard(cardId);
    patch((state) => ({
      ...state,
      cards: state.cards.filter((card) => card.id !== cardId),
      reviews: state.reviews.filter((review) => review.cardId !== cardId),
      memories: state.memories.filter((memory) => memory.cardId !== cardId),
      sessions: state.sessions.map((session) => {
        const flagged = storedFlagged(session);
        if (!session.cardIds.includes(cardId) && !flagged.includes(cardId) && !session.skipped.includes(cardId)) {
          return session;
        }
        const cardIds = session.cardIds.filter((id) => id !== cardId);
        return {
          ...session,
          cardIds,
          originalCount: session.cardIds.includes(cardId) ? Math.max(0, session.originalCount - 1) : session.originalCount,
          index: Math.min(session.index, Math.max(cardIds.length - 1, 0)),
          answers: session.answers.filter((item) => item.cardId !== cardId),
          flagged: flagged.filter((id) => id !== cardId),
          skipped: session.skipped.filter((id) => id !== cardId),
        };
      }),
    }));
  }

  async function jumpToAny(sessionId: string, cardId: string) {
    const session = liveOrResumed(sessionId);
    if (!session || session.status === 'finished') {
      if (session?.status === 'finished') await writeSession(sessionId, session);
      return;
    }
    await writeSession(sessionId, jumpToQuestion(session, cardId, Date.now()));
  }

  async function writeSession(sessionId: string, next: LiveSession) {
    await putSession(next);
    patch((state) => ({
      ...state,
      sessions: state.sessions.map((item) => (item.id === sessionId ? next : item)),
    }));
    if (next.status === 'finished') navigate(`/results/${sessionId}`);
  }

  function liveOrResumed(sessionId: string): LiveSession | null {
    const found = snapRef.current?.sessions.find((item) => item.id === sessionId);
    if (!found || found.status === 'finished') return found ?? null;
    return found.status === 'paused' ? resumeSession(found, Date.now()) : found;
  }

  async function skip(sessionId: string, cardId: string) {
    const session = liveOrResumed(sessionId);
    if (!session || session.status === 'finished') {
      if (session?.status === 'finished') await writeSession(sessionId, session);
      return;
    }
    const next = skipQuestion(session, cardId, Date.now());
    await writeSession(sessionId, next);
  }

  async function jumpTo(sessionId: string, cardId: string) {
    const session = liveOrResumed(sessionId);
    if (!session || session.status === 'finished') {
      if (session?.status === 'finished') await writeSession(sessionId, session);
      return;
    }
    await writeSession(sessionId, jumpToSkipped(session, cardId, Date.now()));
  }

  async function continueSession(sessionId: string) {
    const session = liveOrResumed(sessionId);
    if (!session || session.status === 'finished') {
      if (session?.status === 'finished') await writeSession(sessionId, session);
      return;
    }
    await writeSession(sessionId, continueAfterReview(session, Date.now()));
  }

  async function endSession(sessionId: string) {
    const session = liveOrResumed(sessionId);
    if (!session) return;
    if (session.status === 'finished') {
      await writeSession(sessionId, session);
      return;
    }
    const now = Date.now();
    const next =
      session.skipReview || skippedUnanswered(session).length === 0
        ? finishSession(session, now)
        : openSkipReview(session, now);
    await writeSession(sessionId, next);
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
    const next: BackupMeta = {
      key: 'backup',
      exportedAt: Date.now(),
      reminderDismissedAt: snapRef.current?.backup?.reminderDismissedAt ?? null,
    };
    await saveBackupMeta(next);
    patch((state) => ({ ...state, backup: next }));
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `study-buddy-backup-${backup.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function dismissBackupReminder() {
    const next: BackupMeta = {
      key: 'backup',
      exportedAt: snapRef.current?.backup?.exportedAt ?? null,
      reminderDismissedAt: Date.now(),
    };
    await saveBackupMeta(next);
    patch((state) => ({ ...state, backup: next }));
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
      homeTab,
      setHomeTab,
      dataEpoch,
      snap,
      setFocus,
      setMessage,
      addSubject,
      renameSubject,
      removeSubject,
      removeSource,
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
      removeCard,
      jumpToAny,
      skip,
      jumpTo,
      continueSession,
      endSession,
      persistSession,
      syncTimer,
      downloadBackup,
      dismissBackupReminder,
      restoreBackup,
      askPersist,
    }),
    [ready, bootError, busy, message, route, focus, homeTab, setHomeTab, dataEpoch, snap],
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

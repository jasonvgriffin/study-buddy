import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  BackupFile,
  Card,
  CardMemory,
  Deck,
  ImportDraft,
  LiveSession,
  PersistMeta,
  Review,
  StoredFigure,
  Subject,
} from './types';

const DB_NAME = 'study-buddy';
const DB_VERSION = 2;

interface StudySchema extends DBSchema {
  subjects: { key: string; value: Subject };
  decks: { key: string; value: Deck };
  cards: { key: string; value: Card };
  reviews: { key: string; value: Review };
  sessions: { key: string; value: LiveSession };
  memories: { key: string; value: CardMemory };
  drafts: { key: string; value: ImportDraft };
  meta: { key: string; value: PersistMeta };
  figures: { key: string; value: StoredFigure };
}

export type StudySnapshot = {
  subjects: Subject[];
  decks: Deck[];
  cards: Card[];
  reviews: Review[];
  sessions: LiveSession[];
  memories: CardMemory[];
  drafts: ImportDraft[];
  persist: PersistMeta | null;
};

let cached: Promise<IDBPDatabase<StudySchema>> | null = null;

function createDb() {
  return openDB<StudySchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('subjects')) db.createObjectStore('subjects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('reviews')) db.createObjectStore('reviews', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('memories')) db.createObjectStore('memories', { keyPath: 'cardId' });
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('figures')) db.createObjectStore('figures', { keyPath: 'id' });
    },
  });
}

export function openStudyDb() {
  if (!cached) cached = createDb();
  return cached;
}

export async function closeStudyDb(): Promise<void> {
  if (!cached) return;
  const db = await cached;
  db.close();
  cached = null;
}

export async function resetStudyDb(): Promise<void> {
  await closeStudyDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not delete the study database'));
    request.onblocked = () => resolve();
  });
}

export async function loadSnapshot(): Promise<StudySnapshot> {
  const db = await openStudyDb();
  const [subjects, decks, cards, reviews, sessions, memories, drafts, persist] = await Promise.all([
    db.getAll('subjects'),
    db.getAll('decks'),
    db.getAll('cards'),
    db.getAll('reviews'),
    db.getAll('sessions'),
    db.getAll('memories'),
    db.getAll('drafts'),
    db.get('meta', 'persist'),
  ]);
  return {
    subjects,
    decks,
    cards,
    reviews,
    sessions,
    memories,
    drafts,
    persist: persist ?? null,
  };
}

export async function putSubject(subject: Subject): Promise<void> {
  const db = await openStudyDb();
  await db.put('subjects', subject);
}

export async function putDeck(deck: Deck): Promise<void> {
  const db = await openStudyDb();
  await db.put('decks', deck);
}

export async function putDeckBundle(deck: Deck, cards: Card[]): Promise<void> {
  const db = await openStudyDb();
  const tx = db.transaction(['decks', 'cards'], 'readwrite');
  await tx.objectStore('decks').put(deck);
  for (const card of cards) await tx.objectStore('cards').put(card);
  await tx.done;
}

export async function putCard(card: Card): Promise<void> {
  const db = await openStudyDb();
  await db.put('cards', card);
}

export async function putDraft(draft: ImportDraft): Promise<void> {
  const db = await openStudyDb();
  await db.put('drafts', draft);
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openStudyDb();
  const figures = (await db.getAll('figures')).filter((figure) => figure.draftId === id);
  const tx = db.transaction(['drafts', 'figures'], 'readwrite');
  await tx.objectStore('drafts').delete(id);
  for (const figure of figures) await tx.objectStore('figures').delete(figure.id);
  await tx.done;
}

export async function putFigures(figures: StoredFigure[]): Promise<void> {
  if (!figures.length) return;
  const db = await openStudyDb();
  const tx = db.transaction('figures', 'readwrite');
  for (const figure of figures) await tx.store.put(figure);
  await tx.done;
}

export async function figureCountForCards(cardIds: string[]): Promise<number> {
  if (!cardIds.length) return 0;
  const db = await openStudyDb();
  const want = new Set(cardIds);
  const figures = await db.getAll('figures');
  return figures.filter((figure) => figure.role === 'question' && !!figure.cardId && want.has(figure.cardId)).length;
}

export async function figuresForCard(cardId: string): Promise<StoredFigure[]> {
  const db = await openStudyDb();
  const figures = (await db.getAll('figures')).filter((figure) => figure.cardId === cardId);
  return figures.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'question' ? -1 : 1;
    if (!!a.itemId !== !!b.itemId) return a.itemId ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

/** Figures captured for one card of an import draft that has not been saved yet. */
export async function figuresForDraftCapture(draftId: string, captureId: string): Promise<StoredFigure[]> {
  const db = await openStudyDb();
  const figures = (await db.getAll('figures')).filter(
    (figure) => figure.draftId === draftId && figure.captureId === captureId,
  );
  return figures.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'question' ? -1 : 1;
    if (!!a.itemId !== !!b.itemId) return a.itemId ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

export async function relinkDraftFigures(draftId: string, captureToCard: Map<string, string>): Promise<void> {
  const db = await openStudyDb();
  const figures = (await db.getAll('figures')).filter((figure) => figure.draftId === draftId);
  const tx = db.transaction('figures', 'readwrite');
  for (const figure of figures) {
    const cardId = captureToCard.get(figure.captureId);
    if (!cardId) {
      await tx.store.delete(figure.id);
      continue;
    }
    await tx.store.put({ ...figure, draftId: null, cardId });
  }
  await tx.done;
}

export async function putSession(session: LiveSession): Promise<void> {
  const db = await openStudyDb();
  await db.put('sessions', session);
}

export async function putReviewBundle(
  review: Review,
  memory: CardMemory,
  session: LiveSession,
): Promise<void> {
  const db = await openStudyDb();
  const tx = db.transaction(['reviews', 'memories', 'sessions'], 'readwrite');
  await tx.objectStore('reviews').put(review);
  await tx.objectStore('memories').put(memory);
  await tx.objectStore('sessions').put(session);
  await tx.done;
}

export async function replaceMemories(memories: CardMemory[]): Promise<void> {
  const db = await openStudyDb();
  const tx = db.transaction('memories', 'readwrite');
  for (const memory of memories) await tx.store.put(memory);
  await tx.done;
}

export async function deleteSessionAndReviews(sessionId: string): Promise<Review[]> {
  const db = await openStudyDb();
  const reviews = (await db.getAll('reviews')).filter((review) => review.sessionId === sessionId);
  const tx = db.transaction(['reviews', 'sessions'], 'readwrite');
  for (const review of reviews) await tx.objectStore('reviews').delete(review.id);
  await tx.objectStore('sessions').delete(sessionId);
  await tx.done;
  return reviews;
}

export async function deleteDeck(deckId: string): Promise<void> {
  const db = await openStudyDb();
  const [cards, reviews, sessions, memories] = await Promise.all([
    db.getAll('cards'),
    db.getAll('reviews'),
    db.getAll('sessions'),
    db.getAll('memories'),
  ]);
  const figures = await db.getAll('figures');
  const cardIds = new Set(cards.filter((item) => item.deckId === deckId).map((card) => card.id));
  const tx = db.transaction(['decks', 'cards', 'reviews', 'sessions', 'memories', 'figures'], 'readwrite');
  await tx.objectStore('decks').delete(deckId);
  for (const card of cards.filter((item) => item.deckId === deckId)) {
    await tx.objectStore('cards').delete(card.id);
  }
  for (const figure of figures) {
    if (figure.cardId && cardIds.has(figure.cardId)) await tx.objectStore('figures').delete(figure.id);
  }
  for (const review of reviews.filter((item) => item.deckId === deckId)) {
    await tx.objectStore('reviews').delete(review.id);
  }
  for (const session of sessions.filter((item) => item.deckId === deckId)) {
    await tx.objectStore('sessions').delete(session.id);
  }
  for (const memory of memories.filter((item) => item.deckId === deckId)) {
    await tx.objectStore('memories').delete(memory.cardId);
  }
  await tx.done;
}

export async function deleteSubject(subjectId: string): Promise<void> {
  const db = await openStudyDb();
  const [decks, cards, reviews, sessions, memories, drafts, figures] = await Promise.all([
    db.getAll('decks'),
    db.getAll('cards'),
    db.getAll('reviews'),
    db.getAll('sessions'),
    db.getAll('memories'),
    db.getAll('drafts'),
    db.getAll('figures'),
  ]);
  const cardIds = new Set(cards.filter((item) => item.subjectId === subjectId).map((card) => card.id));
  const draftIds = new Set(drafts.filter((item) => item.subjectId === subjectId).map((draft) => draft.id));
  const tx = db.transaction(
    ['subjects', 'decks', 'cards', 'reviews', 'sessions', 'memories', 'drafts', 'figures'],
    'readwrite',
  );
  await tx.objectStore('subjects').delete(subjectId);
  for (const deck of decks.filter((item) => item.subjectId === subjectId)) {
    await tx.objectStore('decks').delete(deck.id);
  }
  for (const card of cards.filter((item) => item.subjectId === subjectId)) {
    await tx.objectStore('cards').delete(card.id);
  }
  for (const review of reviews.filter((item) => item.subjectId === subjectId)) {
    await tx.objectStore('reviews').delete(review.id);
  }
  for (const session of sessions.filter((item) => item.subjectId === subjectId)) {
    await tx.objectStore('sessions').delete(session.id);
  }
  for (const memory of memories.filter((item) => item.subjectId === subjectId)) {
    await tx.objectStore('memories').delete(memory.cardId);
  }
  for (const draft of drafts.filter((item) => item.subjectId === subjectId)) {
    await tx.objectStore('drafts').delete(draft.id);
  }
  for (const figure of figures) {
    const onCard = figure.cardId != null && cardIds.has(figure.cardId);
    const onDraft = figure.draftId != null && draftIds.has(figure.draftId);
    if (onCard || onDraft) await tx.objectStore('figures').delete(figure.id);
  }
  await tx.done;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

export async function savePersistMeta(meta: PersistMeta): Promise<void> {
  const db = await openStudyDb();
  await db.put('meta', meta);
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
  try {
    const granted = await navigator.storage.persist();
    await savePersistMeta({ key: 'persist', granted, at: Date.now() });
    return granted;
  } catch {
    await savePersistMeta({ key: 'persist', granted: null, at: Date.now() });
    return null;
  }
}

export async function exportBackup(): Promise<BackupFile> {
  const snapshot = await loadSnapshot();
  const db = await openStudyDb();
  const figures = await db.getAll('figures');
  const encoded = [];
  for (const figure of figures) {
    if (!figure.cardId) continue;
    const bytes = new Uint8Array(await figure.png.arrayBuffer());
    encoded.push({
      id: figure.id,
      cardId: figure.cardId,
      captureId: figure.captureId,
      role: figure.role,
      ...(figure.itemId ? { itemId: figure.itemId } : {}),
      pngBase64: bytesToBase64(bytes),
    });
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    subjects: snapshot.subjects,
    decks: snapshot.decks,
    cards: snapshot.cards,
    reviews: snapshot.reviews,
    sessions: snapshot.sessions,
    memories: snapshot.memories,
    ...(encoded.length ? { figures: encoded } : {}),
  };
}

export async function importBackup(backup: BackupFile): Promise<void> {
  if (backup.version !== 1) throw new Error('This backup file is not a Study Buddy version 1 export.');
  const db = await openStudyDb();
  const tx = db.transaction(
    ['subjects', 'decks', 'cards', 'reviews', 'sessions', 'memories', 'drafts', 'figures'],
    'readwrite',
  );
  for (const store of ['subjects', 'decks', 'cards', 'reviews', 'sessions', 'memories', 'drafts', 'figures'] as const) {
    await tx.objectStore(store).clear();
  }
  for (const subject of backup.subjects) await tx.objectStore('subjects').put(subject);
  for (const deck of backup.decks) await tx.objectStore('decks').put(deck);
  for (const card of backup.cards) await tx.objectStore('cards').put(card);
  for (const review of backup.reviews) await tx.objectStore('reviews').put(review);
  for (const session of backup.sessions) await tx.objectStore('sessions').put(session);
  for (const memory of backup.memories) await tx.objectStore('memories').put(memory);
  for (const figure of backup.figures ?? []) {
    await tx.objectStore('figures').put({
      id: figure.id,
      draftId: null,
      cardId: figure.cardId,
      captureId: figure.captureId,
      role: figure.role,
      itemId: figure.itemId ?? null,
      png: base64ToBlob(figure.pngBase64),
    });
  }
  await tx.done;
}

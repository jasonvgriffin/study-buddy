import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { normalizeSession, storedFlagged } from './session';
import type {
  BackupFile,
  Card,
  CardMemory,
  Deck,
  ImportDraft,
  LiveSession,
  BackupMeta,
  MetaRecord,
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
  meta: { key: string; value: MetaRecord };
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
  backup: BackupMeta | null;
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
  const [subjects, decks, cards, reviews, sessions, memories, drafts, persistRow, backupRow] = await Promise.all([
    db.getAll('subjects'),
    db.getAll('decks'),
    db.getAll('cards'),
    db.getAll('reviews'),
    db.getAll('sessions'),
    db.getAll('memories'),
    db.getAll('drafts'),
    db.get('meta', 'persist'),
    db.get('meta', 'backup'),
  ]);
  return {
    subjects,
    decks,
    cards,
    reviews,
    sessions: sessions.map((session) => normalizeSession(session)),
    memories,
    drafts,
    persist: persistRow?.key === 'persist' ? persistRow : null,
    backup: backupRow?.key === 'backup' ? backupRow : null,
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

export async function deleteCard(cardId: string): Promise<void> {
  const db = await openStudyDb();
  const [reviews, sessions, figures] = await Promise.all([
    db.getAll('reviews'),
    db.getAll('sessions'),
    db.getAll('figures'),
  ]);
  const tx = db.transaction(['cards', 'reviews', 'sessions', 'memories', 'figures'], 'readwrite');
  await tx.objectStore('cards').delete(cardId);
  await tx.objectStore('memories').delete(cardId);
  for (const review of reviews.filter((item) => item.cardId === cardId)) {
    await tx.objectStore('reviews').delete(review.id);
  }
  for (const figure of figures.filter((item) => item.cardId === cardId)) {
    await tx.objectStore('figures').delete(figure.id);
  }
  for (const session of sessions) {
    const flagged = storedFlagged(session);
    if (!session.cardIds.includes(cardId) && !(session.skipped ?? []).includes(cardId) && !flagged.includes(cardId)) {
      continue;
    }
    const had = session.cardIds.includes(cardId);
    const cardIds = session.cardIds.filter((id) => id !== cardId);
    const next = normalizeSession({
      ...session,
      cardIds,
      originalCount: had ? Math.max(0, session.originalCount - 1) : session.originalCount,
      index: Math.min(session.index, Math.max(cardIds.length - 1, 0)),
      answers: session.answers.filter((item) => item.cardId !== cardId),
      flagged: flagged.filter((id) => id !== cardId),
      skipped: (session.skipped ?? []).filter((id) => id !== cardId),
      updatedAt: Date.now(),
    });
    await tx.objectStore('sessions').put(next);
  }
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

const FIGURE_SAVE_ERROR =
  'Could not save the pictures from this PDF. If this window is private, open a normal window and import the file again.';

function figureSaveError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : '';
  if (raw.startsWith('Could not save the pictures')) return error instanceof Error ? error : new Error(raw);
  return new Error(FIGURE_SAVE_ERROR);
}

function copyBytes(value: unknown): Uint8Array<ArrayBuffer> | null {
  let view: Uint8Array | null = null;
  if (value instanceof ArrayBuffer) view = new Uint8Array(value);
  else if (ArrayBuffer.isView(value)) view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (!view || !view.byteLength) return null;
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

/** Rebuild a Blob for display. Legacy records still hold a Blob in `png`. */
export function figurePngBlob(figure: StoredFigure): Blob | null {
  const bytes = copyBytes(figure.bytes);
  if (bytes) return new Blob([bytes], { type: figure.mime || 'image/png' });
  if (figure.png instanceof Blob && figure.png.size) return figure.png;
  return null;
}

async function figureRecordForStore(figure: StoredFigure): Promise<StoredFigure> {
  const fromBlob = figure.png instanceof Blob ? new Uint8Array(await figure.png.arrayBuffer()) : null;
  const bytes = copyBytes(figure.bytes) ?? (fromBlob && fromBlob.byteLength ? copyBytes(fromBlob) : null);
  if (!bytes) throw new Error(FIGURE_SAVE_ERROR);
  const mime = figure.mime || (figure.png instanceof Blob ? figure.png.type : '') || 'image/png';
  return {
    id: figure.id,
    draftId: figure.draftId,
    cardId: figure.cardId,
    captureId: figure.captureId,
    role: figure.role,
    itemId: figure.itemId ?? null,
    bytes: bytes.buffer,
    mime,
  };
}

function withPngBlob(figure: StoredFigure): (StoredFigure & { png: Blob }) | null {
  const png = figurePngBlob(figure);
  if (!png) return null;
  return { ...figure, png };
}

export async function putFigures(figures: StoredFigure[]): Promise<void> {
  if (!figures.length) return;
  try {
    // Convert blobs before the transaction. Awaiting that work inside the transaction
    // lets IndexedDB auto-commit, and the later put then fails.
    const records: StoredFigure[] = [];
    for (const figure of figures) records.push(await figureRecordForStore(figure));
    const db = await openStudyDb();
    const tx = db.transaction('figures', 'readwrite');
    for (const record of records) await tx.store.put(record);
    await tx.done;
  } catch (error) {
    throw figureSaveError(error);
  }
}

export async function figureCountForCards(cardIds: string[]): Promise<number> {
  if (!cardIds.length) return 0;
  const db = await openStudyDb();
  const want = new Set(cardIds);
  const figures = await db.getAll('figures');
  return figures.filter((figure) => figure.role === 'question' && !!figure.cardId && want.has(figure.cardId)).length;
}

export async function figuresForCard(cardId: string): Promise<(StoredFigure & { png: Blob })[]> {
  const db = await openStudyDb();
  const figures = (await db.getAll('figures')).filter((figure) => figure.cardId === cardId);
  return figures
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'question' ? -1 : 1;
      if (!!a.itemId !== !!b.itemId) return a.itemId ? 1 : -1;
      return a.id.localeCompare(b.id);
    })
    .map(withPngBlob)
    .filter((figure): figure is StoredFigure & { png: Blob } => figure != null);
}

/** Figures captured for one card of an import draft that has not been saved yet. */
export async function figuresForDraftCapture(draftId: string, captureId: string): Promise<(StoredFigure & { png: Blob })[]> {
  const db = await openStudyDb();
  const figures = (await db.getAll('figures')).filter(
    (figure) => figure.draftId === draftId && figure.captureId === captureId,
  );
  return figures
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'question' ? -1 : 1;
      if (!!a.itemId !== !!b.itemId) return a.itemId ? 1 : -1;
      return a.id.localeCompare(b.id);
    })
    .map(withPngBlob)
    .filter((figure): figure is StoredFigure & { png: Blob } => figure != null);
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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function figurePngBytes(figure: StoredFigure): Promise<Uint8Array | null> {
  const stored = copyBytes(figure.bytes);
  if (stored) return stored;
  if (figure.png instanceof Blob && figure.png.size) return copyBytes(await figure.png.arrayBuffer());
  return null;
}

export async function savePersistMeta(meta: PersistMeta): Promise<void> {
  const db = await openStudyDb();
  await db.put('meta', meta);
}

export async function saveBackupMeta(meta: BackupMeta): Promise<void> {
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
    const bytes = await figurePngBytes(figure);
    if (!bytes) continue;
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
  try {
    for (const figure of backup.figures ?? []) {
      await tx.objectStore('figures').put({
        id: figure.id,
        draftId: null,
        cardId: figure.cardId,
        captureId: figure.captureId,
        role: figure.role,
        itemId: figure.itemId ?? null,
        bytes: base64ToArrayBuffer(figure.pngBase64),
        mime: 'image/png',
      });
    }
    await tx.done;
  } catch (error) {
    throw figureSaveError(error);
  }
}

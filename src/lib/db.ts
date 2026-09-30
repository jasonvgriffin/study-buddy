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
  Subject,
} from './types';

const DB_NAME = 'study-buddy';
const DB_VERSION = 1;

interface StudySchema extends DBSchema {
  subjects: { key: string; value: Subject };
  decks: { key: string; value: Deck };
  cards: { key: string; value: Card };
  reviews: { key: string; value: Review };
  sessions: { key: string; value: LiveSession };
  memories: { key: string; value: CardMemory };
  drafts: { key: string; value: ImportDraft };
  meta: { key: string; value: PersistMeta };
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
      db.createObjectStore('subjects', { keyPath: 'id' });
      db.createObjectStore('decks', { keyPath: 'id' });
      db.createObjectStore('cards', { keyPath: 'id' });
      db.createObjectStore('reviews', { keyPath: 'id' });
      db.createObjectStore('sessions', { keyPath: 'id' });
      db.createObjectStore('memories', { keyPath: 'cardId' });
      db.createObjectStore('drafts', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'key' });
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
  await db.delete('drafts', id);
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
  const tx = db.transaction(['decks', 'cards', 'reviews', 'sessions', 'memories'], 'readwrite');
  await tx.objectStore('decks').delete(deckId);
  for (const card of cards.filter((item) => item.deckId === deckId)) {
    await tx.objectStore('cards').delete(card.id);
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
  const [decks, cards, reviews, sessions, memories, drafts] = await Promise.all([
    db.getAll('decks'),
    db.getAll('cards'),
    db.getAll('reviews'),
    db.getAll('sessions'),
    db.getAll('memories'),
    db.getAll('drafts'),
  ]);
  const tx = db.transaction(
    ['subjects', 'decks', 'cards', 'reviews', 'sessions', 'memories', 'drafts'],
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
  await tx.done;
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
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    subjects: snapshot.subjects,
    decks: snapshot.decks,
    cards: snapshot.cards,
    reviews: snapshot.reviews,
    sessions: snapshot.sessions,
    memories: snapshot.memories,
  };
}

export async function importBackup(backup: BackupFile): Promise<void> {
  if (backup.version !== 1) throw new Error('This backup file is not a Study Buddy version 1 export.');
  const db = await openStudyDb();
  const tx = db.transaction(
    ['subjects', 'decks', 'cards', 'reviews', 'sessions', 'memories', 'drafts'],
    'readwrite',
  );
  for (const store of ['subjects', 'decks', 'cards', 'reviews', 'sessions', 'memories', 'drafts'] as const) {
    await tx.objectStore(store).clear();
  }
  for (const subject of backup.subjects) await tx.objectStore('subjects').put(subject);
  for (const deck of backup.decks) await tx.objectStore('decks').put(deck);
  for (const card of backup.cards) await tx.objectStore('cards').put(card);
  for (const review of backup.reviews) await tx.objectStore('reviews').put(review);
  for (const session of backup.sessions) await tx.objectStore('sessions').put(session);
  for (const memory of backup.memories) await tx.objectStore('memories').put(memory);
  await tx.done;
}

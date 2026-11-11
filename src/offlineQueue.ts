import type { Decision, Deck } from "./types";

const DB_NAME = "radar-deck";
const DB_VERSION = 1;
const STORE_CACHE = "cache";
const STORE_QUEUE = "queue";

export interface QueueEntry {
  key: number;
  id: string;
  decision: Decision | null; // null = delete (Undo)
  queuedAt: string; // ISO
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE);
      }
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: "key", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result: T;
    Promise.resolve(fn(store))
      .then((r) => {
        result = r;
      })
      .catch(reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getCachedDeck(): Promise<Deck | undefined> {
  return withStore(STORE_CACHE, "readonly", (store) => {
    return new Promise<Deck | undefined>((resolve, reject) => {
      const req = store.get("deck");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function setCachedDeck(deck: Deck): Promise<void> {
  return withStore(STORE_CACHE, "readwrite", (store) => {
    store.put(deck, "deck");
  });
}

export async function enqueueDecision(id: string, decision: Decision | null): Promise<void> {
  const entry: Omit<QueueEntry, "key"> = { id, decision, queuedAt: new Date().toISOString() };
  return withStore(STORE_QUEUE, "readwrite", (store) => {
    store.add(entry);
  });
}

export async function getQueue(): Promise<QueueEntry[]> {
  return withStore(STORE_QUEUE, "readonly", (store) => {
    return new Promise<QueueEntry[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as QueueEntry[]);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function removeQueueEntry(key: number): Promise<void> {
  return withStore(STORE_QUEUE, "readwrite", (store) => {
    store.delete(key);
  });
}

export async function clearQueue(): Promise<void> {
  return withStore(STORE_QUEUE, "readwrite", (store) => {
    store.clear();
  });
}

/**
 * Merge two decision maps (e.g. a cached/local copy and a freshly fetched server copy).
 * For each id present in either, the decision with the newer `at` wins. A missing side
 * loses to whichever side has an entry.
 */
export function mergeDecisions(
  a: Record<string, Decision>,
  b: Record<string, Decision>
): Record<string, Decision> {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  const merged: Record<string, Decision> = {};
  for (const id of ids) {
    const da = a[id];
    const db = b[id];
    if (da && db) {
      merged[id] = new Date(da.at).getTime() >= new Date(db.at).getTime() ? da : db;
    } else {
      merged[id] = da ?? db;
    }
  }
  return merged;
}

/**
 * Replay queued writes in the order they were queued. `send` performs one POST and
 * returns the decision the server actually stored (it may differ if the server kept
 * a newer decision already on file). Entries are removed from the queue as they succeed;
 * replay stops on the first failure so later entries retry on the next attempt.
 */
export async function flushQueue(
  send: (id: string, decision: Decision | null) => Promise<void>
): Promise<{ sent: number; remaining: number }> {
  const entries = await getQueue();
  entries.sort((x, y) => x.key - y.key);
  let sent = 0;
  for (const entry of entries) {
    try {
      await send(entry.id, entry.decision);
      await removeQueueEntry(entry.key);
      sent++;
    } catch {
      break;
    }
  }
  const remaining = (await getQueue()).length;
  return { sent, remaining };
}

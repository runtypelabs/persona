// A durable key/value store for paused tool-call runs — the on-device stand-in
// for the server-side "execution store" a hosted agent runtime keeps (compare
// examples/ai-sdk-webmcp/app/api/chat/execution-store.ts, whose in-memory cache
// ships with a "swap for a durable store in production" warning).
//
// When the model emits tool calls we PAUSE and persist the whole run here; the
// widget runs the tools on the page and POSTs /resume; we reload the run from
// this store and continue. That's exactly the dispatch → pause → resume
// handshake a server provides — except the "server" is a few KB of IndexedDB in
// the same tab. Persisting it (rather than holding state in an in-memory Map)
// is what makes the resume behave like a real backend's: the run survives a page
// reload, is visible to other tabs, and is the single source of truth on resume.
//
// IndexedDB is the primary backing (async, roomy, structured — what you'd reach
// for to mimic a server datastore). localStorage is a synchronous fallback for
// environments where IndexedDB is unavailable (e.g. some private-mode contexts).

const DB_NAME = "persona-litert";
const STORE_NAME = "resume";
const DB_VERSION = 1;
const LS_PREFIX = "persona-litert-resume:";

export interface ResumeStore<T> {
  get(id: string): Promise<T | null>;
  set(id: string, value: T): Promise<void>;
  delete(id: string): Promise<void>;
  /** Best-effort sweep of records older than the TTL. */
  prune(): Promise<void>;
}

interface Envelope<T> {
  value: T;
  updatedAt: number;
}

// ── IndexedDB backing ────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest<R>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<R> {
  return openDb().then(
    (db) =>
      new Promise<R>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const req = run(tx.objectStore(STORE_NAME));
        req.onsuccess = () => resolve(req.result as R);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

function idbStore<T>(ttlMs: number): ResumeStore<T> {
  return {
    async get(id) {
      const env = await idbRequest<Envelope<T> | undefined>("readonly", (s) => s.get(id));
      if (!env) return null;
      if (Date.now() - env.updatedAt > ttlMs) {
        await this.delete(id);
        return null;
      }
      return env.value;
    },
    async set(id, value) {
      await idbRequest("readwrite", (s) =>
        s.put({ value, updatedAt: Date.now() } satisfies Envelope<T>, id),
      );
    },
    async delete(id) {
      await idbRequest("readwrite", (s) => s.delete(id));
    },
    async prune() {
      const cutoff = Date.now() - ttlMs;
      const db = await openDb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const objectStore = tx.objectStore(STORE_NAME);
        const cursorReq = objectStore.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const env = cursor.value as Envelope<T>;
          if (env.updatedAt < cutoff) cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      });
    },
  };
}

// ── localStorage fallback ──────────────────────────────────────────────────

function lsStore<T>(ttlMs: number): ResumeStore<T> {
  const key = (id: string): string => `${LS_PREFIX}${id}`;
  return {
    async get(id) {
      try {
        const raw = localStorage.getItem(key(id));
        if (!raw) return null;
        const env = JSON.parse(raw) as Envelope<T>;
        if (Date.now() - env.updatedAt > ttlMs) {
          localStorage.removeItem(key(id));
          return null;
        }
        return env.value;
      } catch {
        return null;
      }
    },
    async set(id, value) {
      try {
        localStorage.setItem(key(id), JSON.stringify({ value, updatedAt: Date.now() }));
      } catch {
        /* quota / unavailable — resume just won't survive a reload */
      }
    },
    async delete(id) {
      try {
        localStorage.removeItem(key(id));
      } catch {
        /* ignore */
      }
    },
    async prune() {
      try {
        const cutoff = Date.now() - ttlMs;
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith(LS_PREFIX)) continue;
          try {
            const env = JSON.parse(localStorage.getItem(k) ?? "{}") as Envelope<T>;
            if (!env.updatedAt || env.updatedAt < cutoff) localStorage.removeItem(k);
          } catch {
            localStorage.removeItem(k);
          }
        }
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Build a durable resume store. Prefers IndexedDB; falls back to localStorage.
 * `ttlMs` evicts abandoned runs (the user closed the approval and walked away)
 * so the store doesn't grow without bound — the durable equivalent of a server
 * cache TTL. Defaults to one hour.
 */
export function createResumeStore<T>(ttlMs: number = 60 * 60 * 1000): ResumeStore<T> {
  const backend =
    typeof indexedDB !== "undefined" ? idbStore<T>(ttlMs) : lsStore<T>(ttlMs);
  // Sweep stale runs on startup; never let it reject.
  void backend.prune().catch(() => {});
  return backend;
}

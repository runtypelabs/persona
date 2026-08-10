import type { SSEEventRecord } from "../types";

export class EventStreamStore {
  private db: IDBDatabase | null = null;
  private pendingWrites: SSEEventRecord[] = [];
  private flushScheduled = false;
  private isDestroyed = false;
  private openPromise: Promise<void> | null = null;
  private readonly dbName: string;
  private readonly storeName: string;

  constructor(dbName = "persona-event-stream", storeName = "events") {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  open(): Promise<void> {
    if (this.openPromise) return this.openPromise;
    this.openPromise = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(this.dbName, 1);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            const store = db.createObjectStore(this.storeName, { keyPath: "id" });
            store.createIndex("timestamp", "timestamp", { unique: false });
          }
        };

        request.onsuccess = () => {
          if (this.isDestroyed) {
            request.result.close();
            resolve();
            return;
          }
          this.db = request.result;
          this.scheduleFlush();
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (err) {
        reject(err);
      }
    });
    return this.openPromise;
  }

  put(event: SSEEventRecord): void {
    if (this.isDestroyed) return;
    this.pendingWrites.push(event);
    this.scheduleFlush();
  }

  putBatch(events: SSEEventRecord[]): void {
    if (this.isDestroyed || events.length === 0) return;
    this.pendingWrites.push(...events);
    this.scheduleFlush();
  }

  getAll(): Promise<SSEEventRecord[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve([]);
        return;
      }
      try {
        const tx = this.db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const index = store.index("timestamp");
        const request = index.getAll();

        request.onsuccess = () => {
          resolve(request.result as SSEEventRecord[]);
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  getCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve(0);
        return;
      }
      try {
        const tx = this.db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const request = store.count();

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  clear(): Promise<void> {
    this.pendingWrites = [];
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      try {
        const tx = this.db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  destroy(): Promise<void> {
    this.isDestroyed = true;
    this.pendingWrites = [];
    this.close();
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.deleteDatabase(this.dbName);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          reject(request.error);
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private flushWrites(): void {
    this.flushScheduled = false;
    if (!this.db || this.isDestroyed || this.pendingWrites.length === 0) return;
    const toWrite = this.pendingWrites;
    this.pendingWrites = [];
    try {
      const tx = this.db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      for (const event of toWrite) {
        store.put(event);
      }
    } catch {
      // Keep failed writes for a later best-effort retry.
      this.pendingWrites.unshift(...toWrite);
    }
  }

  private scheduleFlush(): void {
    if (!this.db || this.flushScheduled || this.pendingWrites.length === 0) return;
    this.flushScheduled = true;
    queueMicrotask(() => this.flushWrites());
  }
}

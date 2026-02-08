import type { SSEEventRecord } from "../types";
import type { EventStreamStore } from "./event-stream-store";

export class EventStreamBuffer {
  private buffer: SSEEventRecord[];
  private head = 0;
  private count = 0;
  private totalCaptured = 0;
  private eventTypesSet = new Set<string>();
  private readonly maxSize: number;
  private readonly store: EventStreamStore | null;

  constructor(maxSize = 500, store: EventStreamStore | null = null) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize);
    this.store = store;
  }

  push(event: SSEEventRecord): void {
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.maxSize;
    if (this.count < this.maxSize) {
      this.count++;
    }
    this.totalCaptured++;
    this.eventTypesSet.add(event.type);
    this.store?.put(event);
  }

  getAll(): SSEEventRecord[] {
    if (this.count === 0) return [];
    if (this.count < this.maxSize) {
      return this.buffer.slice(0, this.count);
    }
    // Buffer is full, items wrap around
    return [
      ...this.buffer.slice(this.head, this.maxSize),
      ...this.buffer.slice(0, this.head)
    ];
  }

  async restore(): Promise<number> {
    if (!this.store) return 0;
    const events = await this.store.getAll();
    if (events.length === 0) return 0;

    // Take the most recent maxSize events (store returns sorted by timestamp)
    const toLoad = events.length > this.maxSize
      ? events.slice(events.length - this.maxSize)
      : events;

    // Populate the ring buffer without writing back to the store
    for (const event of toLoad) {
      this.buffer[this.head] = event;
      this.head = (this.head + 1) % this.maxSize;
      if (this.count < this.maxSize) {
        this.count++;
      }
      this.eventTypesSet.add(event.type);
    }
    this.totalCaptured = events.length;

    return toLoad.length;
  }

  getAllFromStore(): Promise<SSEEventRecord[]> {
    if (this.store) {
      return this.store.getAll();
    }
    return Promise.resolve(this.getAll());
  }

  getRecent(count: number): SSEEventRecord[] {
    const all = this.getAll();
    if (count >= all.length) return all;
    return all.slice(all.length - count);
  }

  getSize(): number {
    return this.count;
  }

  getTotalCaptured(): number {
    return this.totalCaptured;
  }

  getEvictedCount(): number {
    return this.totalCaptured - this.count;
  }

  clear(): void {
    this.buffer = new Array(this.maxSize);
    this.head = 0;
    this.count = 0;
    this.totalCaptured = 0;
    this.eventTypesSet.clear();
    this.store?.clear();
  }

  destroy(): void {
    this.store?.destroy();
  }

  getEventTypes(): string[] {
    return Array.from(this.eventTypesSet);
  }
}

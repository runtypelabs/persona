import type { SSEEventRecord } from "../types";

export class EventStreamBuffer {
  private buffer: SSEEventRecord[];
  private head = 0;
  private count = 0;
  private totalCaptured = 0;
  private eventTypesSet = new Set<string>();
  private readonly maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
    this.buffer = new Array(maxSize);
  }

  push(event: SSEEventRecord): void {
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.maxSize;
    if (this.count < this.maxSize) {
      this.count++;
    }
    this.totalCaptured++;
    this.eventTypesSet.add(event.type);
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
  }

  getEventTypes(): string[] {
    return Array.from(this.eventTypesSet);
  }
}

export class Deduplicator {
  constructor(private readonly deduplicationWindowMs: number) {}

  private readonly processedEvents = new Map<string, NodeJS.Timeout>();

  check(key: string) {
    return this.processedEvents.has(key);
  }

  add(key: string) {
    const timeout = setTimeout(() => {
      this.processedEvents.delete(key);
    }, this.deduplicationWindowMs);
    this.processedEvents.set(key, timeout);
  }
}

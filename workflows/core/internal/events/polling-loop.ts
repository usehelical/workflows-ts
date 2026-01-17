export class PollingLoop {
  private intervalMs: number;
  private jitterFactor: number;
  private intervalHandle: NodeJS.Timeout | null = null;
  private callback: () => void;
  private running: boolean;

  constructor(intervalMs: number, callback: () => void, jitterFactor: number = 0.1) {
    this.intervalMs = intervalMs;
    this.callback = callback;
    this.jitterFactor = Math.max(0, Math.min(1, jitterFactor));
  }

  private calculateNextInterval(): number {
    const jitterRange = this.intervalMs * this.jitterFactor;
    const jitter = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(0, this.intervalMs + jitter);
  }

  private scheduleNext() {
    if (this.intervalHandle === null || !this.running) {
      return;
    }

    const nextInterval = this.calculateNextInterval();
    this.intervalHandle = setTimeout(() => {
      this.callback();
      this.scheduleNext();
    }, nextInterval);
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.scheduleNext();
  }

  stop() {
    if (!this.running && this.intervalHandle) {
      clearTimeout(this.intervalHandle);
      this.intervalHandle = null;
      this.running = false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

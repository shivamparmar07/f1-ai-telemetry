/**
 * Bounded Semaphore
 * Limits the number of concurrent asynchronous operations to prevent
 * overwhelming upstream services like OpenF1.
 */

export interface SemaphoreStats {
  concurrencyLimit: number;
  runningCount: number;
  queueLength: number;
  totalAcquisitions: number;
  totalWaitTimeMs: number;
  averageWaitTimeMs: number;
}

export class BoundedSemaphore {
  private running = 0;
  private queue: Array<{
    resolve: (release: () => void) => void;
    reject: (reason: any) => void;
    enqueuedAt: number;
  }> = [];

  private totalAcquisitions = 0;
  private totalWaitTimeMs = 0;

  constructor(public readonly maxConcurrency: number = 3) {
    if (maxConcurrency < 1) {
      throw new Error('Semaphore maxConcurrency must be at least 1');
    }
  }

  /**
   * Acquire a concurrency permit.
   * Resolves with a `release` function that MUST be invoked when the operation completes.
   */
  async acquire(timeoutMs?: number): Promise<() => void> {
    const enqueuedAt = Date.now();

    if (this.running < this.maxConcurrency) {
      this.running++;
      this.totalAcquisitions++;
      return this.createReleaseFn();
    }

    return new Promise<() => void>((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;

      const item = {
        resolve: (release: () => void) => {
          if (timeoutId) clearTimeout(timeoutId);
          const waitTime = Date.now() - enqueuedAt;
          this.totalWaitTimeMs += waitTime;
          this.totalAcquisitions++;
          resolve(release);
        },
        reject: (reason: any) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(reason);
        },
        enqueuedAt,
      };

      if (timeoutMs && timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          const index = this.queue.indexOf(item);
          if (index !== -1) {
            this.queue.splice(index, 1);
            reject(new Error(`Semaphore acquisition timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);
      }

      this.queue.push(item);
    });
  }

  /**
   * Helper to run an async function with acquired permit
   */
  async run<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    const release = await this.acquire(timeoutMs);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private createReleaseFn(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.running--;

      if (this.queue.length > 0 && this.running < this.maxConcurrency) {
        this.running++;
        const next = this.queue.shift();
        if (next) {
          next.resolve(this.createReleaseFn());
        }
      }
    };
  }

  getStats(): SemaphoreStats {
    return {
      concurrencyLimit: this.maxConcurrency,
      runningCount: this.running,
      queueLength: this.queue.length,
      totalAcquisitions: this.totalAcquisitions,
      totalWaitTimeMs: this.totalWaitTimeMs,
      averageWaitTimeMs:
        this.totalAcquisitions > 0
          ? Math.round((this.totalWaitTimeMs / this.totalAcquisitions) * 10) / 10
          : 0,
    };
  }

  resetStats(): void {
    this.totalAcquisitions = 0;
    this.totalWaitTimeMs = 0;
  }
}

/**
 * SingleFlight (Request Coalescing) Pattern
 * Deduplicates concurrent requests for the same key so that only a single
 * execution takes place, and all concurrent callers share the resulting promise.
 */

export interface SingleFlightStats {
  activeRequests: number;
  totalCalls: number;
  coalescedCalls: number;
}

export class SingleFlight {
  private inFlight = new Map<string, Promise<any>>();
  private totalCalls = 0;
  private coalescedCalls = 0;

  /**
   * Execute a task or join an existing in-flight task with the given key.
   * If a task for the key is already running, returns the existing promise.
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    this.totalCalls++;

    const existing = this.inFlight.get(key);
    if (existing) {
      this.coalescedCalls++;
      return existing as Promise<T>;
    }

    const promise = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  /**
   * Check if a specific key is currently in-flight
   */
  isInFlight(key: string): boolean {
    return this.inFlight.has(key);
  }

  /**
   * Get telemetry stats for coalescing
   */
  getStats(): SingleFlightStats {
    return {
      activeRequests: this.inFlight.size,
      totalCalls: this.totalCalls,
      coalescedCalls: this.coalescedCalls,
    };
  }

  /**
   * Reset stats counters (useful for benchmarks/testing)
   */
  resetStats(): void {
    this.totalCalls = 0;
    this.coalescedCalls = 0;
  }
}

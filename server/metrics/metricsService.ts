/**
 * Observability & Performance Metrics Service
 * Tracks API response latency quantiles (p50, p95, p99), cache hit efficiency,
 * upstream requests per minute (RPM), concurrency deduplication, retries, and errors.
 */

export interface LatencyPercentiles {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  samplesCount: number;
}

export interface SystemMetricsReport {
  timestamp: string;
  uptimeSeconds: number;
  api: {
    totalRequests: number;
    activeRequests: number;
    errorsTotal: number;
    errorRate: number;
    latency: LatencyPercentiles;
  };
  cache: {
    size: number;
    freshHits: number;
    swrHits: number;
    misses: number;
    totalLookups: number;
    hitRatio: number;
  };
  concurrency: {
    coalescedRequests: number;
    semaphoreRunning: number;
    semaphoreQueueLength: number;
    averageQueueWaitMs: number;
  };
  upstream: {
    requestsTotal: number;
    rollingRpm: number;
    retriesTotal: number;
    rateLimits429Total: number;
    timeoutsTotal: number;
    circuitBreakerState: string;
    circuitBreakerTrips: number;
  };
}

export class MetricsService {
  private startTime = Date.now();
  private totalApiRequests = 0;
  private activeApiRequests = 0;
  private apiErrorsTotal = 0;

  // Latency Reservoir (rolling sliding window of last 1000 response durations)
  private readonly maxReservoirSize = 1000;
  private latencyReservoir: number[] = [];

  // Upstream tracking
  private upstreamRequestsTotal = 0;
  private upstreamRetriesTotal = 0;
  private upstream429Total = 0;
  private upstreamTimeoutsTotal = 0;

  // Upstream request timestamps for rolling RPM (60-sec window)
  private upstreamRequestTimestamps: number[] = [];

  /**
   * Record the start of an incoming API request
   */
  startApiRequest(): () => void {
    this.totalApiRequests++;
    this.activeApiRequests++;
    const requestStart = Date.now();

    return (isError: boolean = false) => {
      this.activeApiRequests = Math.max(0, this.activeApiRequests - 1);
      const durationMs = Date.now() - requestStart;
      this.recordLatency(durationMs);
      if (isError) {
        this.apiErrorsTotal++;
      }
    };
  }

  /**
   * Record a latency sample into the reservoir
   */
  recordLatency(durationMs: number): void {
    if (this.latencyReservoir.length >= this.maxReservoirSize) {
      // Overwrite random element or shift
      const replaceIdx = Math.floor(Math.random() * this.latencyReservoir.length);
      this.latencyReservoir[replaceIdx] = durationMs;
    } else {
      this.latencyReservoir.push(durationMs);
    }
  }

  /**
   * Record an upstream event from UpstreamClient
   */
  recordUpstreamEvent(event: any): void {
    const now = Date.now();
    switch (event.type) {
      case 'upstream_request_start':
        this.upstreamRequestsTotal++;
        this.upstreamRequestTimestamps.push(now);
        this.pruneUpstreamTimestamps(now);
        break;
      case 'upstream_request_retry':
        this.upstreamRetriesTotal++;
        break;
      case 'upstream_request_429':
        this.upstream429Total++;
        break;
      case 'upstream_request_timeout':
        this.upstreamTimeoutsTotal++;
        break;
    }
  }

  private pruneUpstreamTimestamps(now: number): void {
    const cutoff = now - 60000; // 60 seconds
    while (this.upstreamRequestTimestamps.length > 0 && this.upstreamRequestTimestamps[0] < cutoff) {
      this.upstreamRequestTimestamps.shift();
    }
  }

  /**
   * Calculate rolling upstream Requests Per Minute (RPM)
   */
  getRollingUpstreamRpm(): number {
    this.pruneUpstreamTimestamps(Date.now());
    return this.upstreamRequestTimestamps.length;
  }

  /**
   * Calculate quantiles: p50, p95, p99 from the reservoir
   */
  calculateLatencyQuantiles(): LatencyPercentiles {
    if (this.latencyReservoir.length === 0) {
      return { p50Ms: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0, samplesCount: 0 };
    }

    const sorted = [...this.latencyReservoir].sort((a, b) => a - b);
    const count = sorted.length;

    const getQuantile = (q: number): number => {
      const idx = Math.min(count - 1, Math.max(0, Math.floor(count * q)));
      return Math.round(sorted[idx] * 10) / 10;
    };

    return {
      p50Ms: getQuantile(0.50),
      p95Ms: getQuantile(0.95),
      p99Ms: getQuantile(0.99),
      minMs: Math.round(sorted[0] * 10) / 10,
      maxMs: Math.round(sorted[count - 1] * 10) / 10,
      samplesCount: count,
    };
  }

  /**
   * Compile a full performance and observability report
   */
  getReport(cacheStats: any, semaphoreStats: any, singleFlightStats: any, circuitBreakerStats: any): SystemMetricsReport {
    const now = Date.now();
    const uptimeSeconds = Math.round((now - this.startTime) / 1000);
    const errorRate = this.totalApiRequests > 0 ? this.apiErrorsTotal / this.totalApiRequests : 0;

    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      api: {
        totalRequests: this.totalApiRequests,
        activeRequests: this.activeApiRequests,
        errorsTotal: this.apiErrorsTotal,
        errorRate: Math.round(errorRate * 1000) / 1000,
        latency: this.calculateLatencyQuantiles(),
      },
      cache: {
        size: cacheStats.size,
        freshHits: cacheStats.freshHits,
        swrHits: cacheStats.swrHits,
        misses: cacheStats.misses,
        totalLookups: cacheStats.totalLookups,
        hitRatio: cacheStats.hitRatio,
      },
      concurrency: {
        coalescedRequests: singleFlightStats.coalescedCalls,
        semaphoreRunning: semaphoreStats.runningCount,
        semaphoreQueueLength: semaphoreStats.queueLength,
        averageQueueWaitMs: semaphoreStats.averageWaitTimeMs,
      },
      upstream: {
        requestsTotal: this.upstreamRequestsTotal,
        rollingRpm: this.getRollingUpstreamRpm(),
        retriesTotal: this.upstreamRetriesTotal,
        rateLimits429Total: this.upstream429Total,
        timeoutsTotal: this.upstreamTimeoutsTotal,
        circuitBreakerState: circuitBreakerStats.state,
        circuitBreakerTrips: circuitBreakerStats.tripsTotal,
      },
    };
  }

  reset(): void {
    this.totalApiRequests = 0;
    this.activeApiRequests = 0;
    this.apiErrorsTotal = 0;
    this.latencyReservoir = [];
    this.upstreamRequestsTotal = 0;
    this.upstreamRetriesTotal = 0;
    this.upstream429Total = 0;
    this.upstreamTimeoutsTotal = 0;
    this.upstreamRequestTimestamps = [];
  }
}

export const globalMetrics = new MetricsService();

/**
 * Robust Upstream HTTP Client
 * Combines Bounded Concurrency, Request Coalescing, Circuit Breaking,
 * Hard Timeouts, and Exponential Backoff with Jitter and Retry-After handling.
 */

import { SingleFlight } from './SingleFlight';
import { BoundedSemaphore } from './BoundedSemaphore';
import { CircuitBreaker } from './CircuitBreaker';

export interface UpstreamClientConfig {
  maxConcurrency?: number;
  circuitBreakerThreshold?: number;
  cooldownPeriodMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  onMetricEvent?: (event: UpstreamMetricEvent) => void;
}

export type UpstreamMetricEvent =
  | { type: 'upstream_request_start'; url: string }
  | { type: 'upstream_request_success'; url: string; durationMs: number; attempt: number }
  | { type: 'upstream_request_retry'; url: string; attempt: number; delayMs: number; reason: string }
  | { type: 'upstream_request_429'; url: string; retryAfterSeconds: number }
  | { type: 'upstream_request_timeout'; url: string; attempt: number }
  | { type: 'upstream_request_failure'; url: string; error: string; attempts: number }
  | { type: 'coalesced_request'; url: string };

export class UpstreamClient {
  public readonly singleFlight: SingleFlight;
  public readonly semaphore: BoundedSemaphore;
  public readonly circuitBreaker: CircuitBreaker;

  private maxRetries: number;
  private baseBackoffMs: number;
  private maxBackoffMs: number;
  private onMetricEvent?: (event: UpstreamMetricEvent) => void;

  constructor(config?: UpstreamClientConfig) {
    this.singleFlight = new SingleFlight();
    this.semaphore = new BoundedSemaphore(config?.maxConcurrency ?? 3);
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: config?.circuitBreakerThreshold ?? 5,
      cooldownPeriodMs: config?.cooldownPeriodMs ?? 15000,
      timeoutMs: config?.timeoutMs ?? 8000,
    });

    this.maxRetries = config?.maxRetries ?? 3;
    this.baseBackoffMs = config?.baseBackoffMs ?? 500;
    this.maxBackoffMs = config?.maxBackoffMs ?? 10000;
    this.onMetricEvent = config?.onMetricEvent;
  }

  setMetricListener(listener: (event: UpstreamMetricEvent) => void) {
    this.onMetricEvent = listener;
  }

  private emitMetric(event: UpstreamMetricEvent) {
    if (this.onMetricEvent) {
      try {
        this.onMetricEvent(event);
      } catch (e) {
        console.error('Metric event listener error:', e);
      }
    }
  }

  /**
   * Parse the Retry-After header which can be an integer in seconds or an HTTP-date
   */
  private parseRetryAfter(header: string | null): number | null {
    if (!header) return null;

    // Try parsing as integer seconds
    const seconds = parseInt(header, 10);
    if (!isNaN(seconds) && seconds >= 0) {
      return seconds;
    }

    // Try parsing as HTTP date
    const dateParsed = Date.parse(header);
    if (!isNaN(dateParsed)) {
      const deltaSec = Math.max(1, Math.ceil((dateParsed - Date.now()) / 1000));
      return deltaSec;
    }

    return null;
  }

  /**
   * Determine if an error or status code is transient/retryable
   */
  private isTransientStatus(status: number): boolean {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  /**
   * Calculate exponential backoff with full jitter:
   * backoff = uniform_random(0, min(maxBackoff, baseBackoff * 2^attempt))
   */
  private calculateBackoffWithJitter(attempt: number): number {
    const exponential = Math.min(this.maxBackoffMs, this.baseBackoffMs * Math.pow(2, attempt));
    // Full jitter ensures high dispersion and minimizes collision thunder
    return Math.floor(Math.random() * exponential);
  }

  /**
   * Fetch a resource with SingleFlight coalescing, Bounded Concurrency,
   * Circuit Breaker protection, and exponential backoff.
   */
  async fetchWithResilience<T>(url: string, fetchFn?: (inputUrl: string, signal?: AbortSignal) => Promise<Response>): Promise<T> {
    const isAlreadyInFlight = this.singleFlight.isInFlight(url);
    if (isAlreadyInFlight) {
      this.emitMetric({ type: 'coalesced_request', url });
    }

    return this.singleFlight.execute(url, async () => {
      return this.semaphore.run(async () => {
        return this.executeWithRetry<T>(url, fetchFn);
      });
    });
  }

  private async executeWithRetry<T>(url: string, customFetch?: (inputUrl: string, signal?: AbortSignal) => Promise<Response>): Promise<T> {
    const doFetch = customFetch || ((u, sig) => fetch(u, { signal: sig }));
    let lastError: any = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const startTime = Date.now();
      this.emitMetric({ type: 'upstream_request_start', url });

      try {
        const data = await this.circuitBreaker.execute(async (signal) => {
          let response: Response;
          try {
            response = await doFetch(url, signal);
          } catch (netErr: any) {
            if (signal.aborted) {
              this.emitMetric({ type: 'upstream_request_timeout', url, attempt });
              throw new Error(`Upstream request to ${url} timed out`);
            }
            throw netErr;
          }

          // Handle 429 Rate Limiting specifically
          if (response.status === 429) {
            const retryAfterSec = this.parseRetryAfter(response.headers.get('Retry-After')) ?? 2;
            this.emitMetric({ type: 'upstream_request_429', url, retryAfterSeconds: retryAfterSec });
            const error = new Error(`Upstream rate limit (429)`);
            (error as any).status = 429;
            (error as any).retryAfterSec = retryAfterSec;
            throw error;
          }

          // Handle 4xx non-retryable client errors
          if (response.status >= 400 && response.status < 500) {
            const error = new Error(`Upstream client error: ${response.status} ${response.statusText}`);
            (error as any).status = response.status;
            (error as any).isClientError = true;
            throw error;
          }

          // Handle 5xx server errors
          if (!response.ok) {
            const error = new Error(`Upstream server error: ${response.status} ${response.statusText}`);
            (error as any).status = response.status;
            throw error;
          }

          return await response.json();
        });

        const durationMs = Date.now() - startTime;
        this.emitMetric({ type: 'upstream_request_success', url, durationMs, attempt });
        return data as T;
      } catch (err: any) {
        lastError = err;

        // Do NOT retry permanent client errors (400, 404, 422, etc.)
        if (err.isClientError && err.status !== 429) {
          this.emitMetric({ type: 'upstream_request_failure', url, error: err.message, attempts: attempt + 1 });
          throw err;
        }

        // If circuit breaker is open, do not retry
        if (err.name === 'CircuitBreakerOpenError') {
          this.emitMetric({ type: 'upstream_request_failure', url, error: err.message, attempts: attempt + 1 });
          throw err;
        }

        // If reached max retries, fail
        if (attempt >= this.maxRetries) {
          this.emitMetric({ type: 'upstream_request_failure', url, error: err.message, attempts: attempt + 1 });
          break;
        }

        // Determine delay: respect Retry-After if present, otherwise exponential backoff with jitter
        let delayMs = 0;
        if (err.status === 429 && typeof err.retryAfterSec === 'number') {
          // Retry-After plus a slight random jitter to prevent cluster synchronization
          delayMs = err.retryAfterSec * 1000 + Math.floor(Math.random() * 300);
        } else {
          delayMs = this.calculateBackoffWithJitter(attempt);
        }

        this.emitMetric({
          type: 'upstream_request_retry',
          url,
          attempt: attempt + 1,
          delayMs,
          reason: err.message,
        });

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError || new Error(`Upstream request to ${url} failed after ${this.maxRetries} retries`);
  }
}

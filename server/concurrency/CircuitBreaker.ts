/**
 * Circuit Breaker Pattern
 * Protects the system from cascading failures by failing fast when upstream services fail repeatedly.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold?: number; // Consecutive failures before tripping (default: 5)
  cooldownPeriodMs?: number; // Time in OPEN state before trying HALF_OPEN (default: 15000ms)
  timeoutMs?: number; // Request timeout limit (default: 8000ms)
}

export interface CircuitBreakerStats {
  state: CircuitState;
  consecutiveFailures: number;
  tripsTotal: number;
  lastStateChange: number;
  lastFailureMessage: string | null;
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string = 'Circuit breaker is OPEN. Upstream requests are temporarily paused.') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private tripsTotal = 0;
  private lastStateChange = Date.now();
  private lastFailureMessage: string | null = null;

  public readonly failureThreshold: number;
  public readonly cooldownPeriodMs: number;
  public readonly timeoutMs: number;

  constructor(config?: CircuitBreakerConfig) {
    this.failureThreshold = config?.failureThreshold ?? 5;
    this.cooldownPeriodMs = config?.cooldownPeriodMs ?? 15000;
    this.timeoutMs = config?.timeoutMs ?? 8000;
  }

  /**
   * Execute an operation wrapped by the circuit breaker and timeout
   */
  async execute<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.checkStateTransition();

    if (this.state === 'OPEN') {
      throw new CircuitBreakerOpenError(
        `Circuit breaker is OPEN. Fail-fast active until cooldown (${Math.max(
          0,
          Math.ceil((this.lastStateChange + this.cooldownPeriodMs - Date.now()) / 1000)
        )}s remaining). Last error: ${this.lastFailureMessage || 'Unknown'}`
      );
    }

    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    if (this.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        controller.abort(new Error(`Operation timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    }

    try {
      const result = await fn(controller.signal);
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onFailure(error);
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private checkStateTransition(): void {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastStateChange;
      if (elapsed >= this.cooldownPeriodMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      // Canary request succeeded, heal circuit
      this.transitionTo('CLOSED');
    }
    this.consecutiveFailures = 0;
  }

  private onFailure(error: any): void {
    this.consecutiveFailures++;
    this.lastFailureMessage = error?.message || String(error);

    if (this.state === 'HALF_OPEN') {
      // Canary failed, trip back to open
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && this.consecutiveFailures >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: CircuitState): void {
    if (newState === 'OPEN' && this.state !== 'OPEN') {
      this.tripsTotal++;
    }
    this.state = newState;
    this.lastStateChange = Date.now();
  }

  getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  getStats(): CircuitBreakerStats {
    this.checkStateTransition();
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      tripsTotal: this.tripsTotal,
      lastStateChange: this.lastStateChange,
      lastFailureMessage: this.lastFailureMessage,
    };
  }

  /**
   * Manually reset circuit breaker (useful for tests or manual admin override)
   */
  reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.lastStateChange = Date.now();
    this.lastFailureMessage = null;
  }

  /**
   * Force trip the breaker (useful for testing failure scenarios)
   */
  trip(): void {
    this.transitionTo('OPEN');
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SingleFlight } from '../server/concurrency/SingleFlight';
import { BoundedSemaphore } from '../server/concurrency/BoundedSemaphore';
import { CircuitBreaker, CircuitBreakerOpenError } from '../server/concurrency/CircuitBreaker';
import { UpstreamClient } from '../server/concurrency/upstreamClient';
import { APICache } from '../cache';

describe('Priority 2: Robust Concurrency and Caching Engine', () => {
  describe('SingleFlight (Request Coalescing)', () => {
    it('coalesces 50 simultaneous requests for the same uncached resource into exactly 1 execution', async () => {
      const sf = new SingleFlight();
      let executionCount = 0;

      const mockTask = async () => {
        executionCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { data: 'lap_telemetry_payload' };
      };

      // 50 simultaneous calls
      const promises = Array.from({ length: 50 }).map(() =>
        sf.execute('resource_key_1', mockTask)
      );

      const results = await Promise.all(promises);

      // Verify all 50 received the exact same result
      expect(results).toHaveLength(50);
      results.forEach((res) => {
        expect(res).toEqual({ data: 'lap_telemetry_payload' });
      });

      // Verify task executed exactly ONCE
      expect(executionCount).toBe(1);

      // Verify stats
      const stats = sf.getStats();
      expect(stats.totalCalls).toBe(50);
      expect(stats.coalescedCalls).toBe(49);
      expect(stats.activeRequests).toBe(0);
    });

    it('clears in-flight key when execution rejects and propagates error to all waiters', async () => {
      const sf = new SingleFlight();
      let executionCount = 0;

      const failingTask = async () => {
        executionCount++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error('Upstream 500 Internal Error');
      };

      const promises = Array.from({ length: 10 }).map(() =>
        sf.execute('failing_key', failingTask).catch((err) => err.message)
      );

      const results = await Promise.all(promises);

      expect(executionCount).toBe(1);
      results.forEach((msg) => expect(msg).toBe('Upstream 500 Internal Error'));
      expect(sf.isInFlight('failing_key')).toBe(false);
    });
  });

  describe('BoundedSemaphore (Concurrency Limiting)', () => {
    it('enforces maximum concurrent operations and drains queued tasks in order', async () => {
      const semaphore = new BoundedSemaphore(2); // Max 2 concurrent
      let activeCount = 0;
      let peakConcurrency = 0;
      const completedOrder: number[] = [];

      const runTask = async (id: number) => {
        await semaphore.run(async () => {
          activeCount++;
          peakConcurrency = Math.max(peakConcurrency, activeCount);
          await new Promise((resolve) => setTimeout(resolve, 30));
          completedOrder.push(id);
          activeCount--;
        });
      };

      // Run 6 tasks concurrently
      await Promise.all([runTask(1), runTask(2), runTask(3), runTask(4), runTask(5), runTask(6)]);

      expect(peakConcurrency).toBe(2);
      expect(activeCount).toBe(0);
      expect(completedOrder).toHaveLength(6);
    });
  });

  describe('CircuitBreaker', () => {
    it('trips to OPEN after 5 consecutive failures and fails fast with CircuitBreakerOpenError', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownPeriodMs: 100, timeoutMs: 50 });

      let callCount = 0;
      const failingFn = async () => {
        callCount++;
        throw new Error('Connection refused');
      };

      // 3 failures should trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingFn)).rejects.toThrow('Connection refused');
      }

      expect(callCount).toBe(3);
      expect(breaker.getState()).toBe('OPEN');

      // 4th call should immediately fail-fast without invoking failingFn
      await expect(breaker.execute(failingFn)).rejects.toThrow(CircuitBreakerOpenError);
      expect(callCount).toBe(3); // was NOT called
    });

    it('transitions to HALF_OPEN after cooldown and resets to CLOSED after successful canary call', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownPeriodMs: 50 });

      // Trip to open
      await expect(breaker.execute(async () => { throw new Error('err'); })).rejects.toThrow();
      await expect(breaker.execute(async () => { throw new Error('err'); })).rejects.toThrow();
      expect(breaker.getState()).toBe('OPEN');

      // Wait for cooldown
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(breaker.getState()).toBe('HALF_OPEN');

      // Successful canary call heals the circuit
      const result = await breaker.execute(async () => 'healed');
      expect(result).toBe('healed');
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('times out and aborts hanging operations', async () => {
      const breaker = new CircuitBreaker({ timeoutMs: 40 });

      await expect(
        breaker.execute(async (signal) => {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 200);
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('Aborted by signal'));
            });
          });
        })
      ).rejects.toThrow();
    });
  });

  describe('UpstreamClient: Exponential Backoff & 429 Retry-After', () => {
    it('retries with exponential backoff on transient errors and respects Retry-After on 429', async () => {
      const client = new UpstreamClient({
        maxRetries: 2,
        baseBackoffMs: 20,
        maxBackoffMs: 100,
      });

      let attempts = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          // Return 429 with Retry-After header: 0 seconds (for test speed)
          return new Response(JSON.stringify({ error: 'Rate limited' }), {
            status: 429,
            headers: { 'Retry-After': '0' },
          });
        }
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });

      const data = await client.fetchWithResilience<{ success: boolean }>('https://api.openf1.org/v1/laps', mockFetch as any);

      expect(attempts).toBe(2);
      expect(data).toEqual({ success: true });
    });

    it('fails immediately without retrying on permanent 4xx client errors (e.g. 404)', async () => {
      const client = new UpstreamClient({ maxRetries: 3 });
      let attempts = 0;

      const mockFetch = vi.fn().mockImplementation(async () => {
        attempts++;
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      });

      await expect(client.fetchWithResilience('https://api.openf1.org/v1/invalid', mockFetch as any)).rejects.toThrow(
        'Upstream client error: 404'
      );
      expect(attempts).toBe(1); // No retries!
    });
  });

  describe('APICache: Stale-While-Revalidate (SWR)', () => {
    it('serves stale response within 1ms while background revalidation updates cache', async () => {
      const cache = new APICache(100);

      // Set key with 0.05s fresh TTL, and 1s stale TTL
      cache.set('test_swr_key', { version: 1 }, 0.05, 1);

      // Wait 60ms so it enters STALE window
      await new Promise((resolve) => setTimeout(resolve, 60));

      const statusResult = cache.getWithStatus('test_swr_key');
      expect(statusResult.status).toBe('STALE');
      expect(statusResult.data).toEqual({ version: 1 });

      let backgroundFetched = false;
      const revalidationPromise = new Promise<void>((resolve) => {
        cache
          .getOrFetch(
            'test_swr_key',
            async () => {
              backgroundFetched = true;
              return { version: 2 };
            },
            60,
            120,
            (newData) => {
              expect(newData).toEqual({ version: 2 });
              resolve();
            }
          )
          .then((immediateResult) => {
            // Immediate result returned to caller must be version 1 (stale, zero wait!)
            expect(immediateResult).toEqual({ version: 1 });
          });
      });

      await revalidationPromise;
      expect(backgroundFetched).toBe(true);

      // Subsequent read gets fresh version 2
      const freshResult = cache.get('test_swr_key');
      expect(freshResult).toEqual({ version: 2 });
    });

    it('evicts least recently used items when capacity limit is reached', () => {
      const cache = new APICache(2); // capacity 2
      cache.set('key1', 'val1');
      cache.set('key2', 'val2');

      // Access key1 to make key2 older
      cache.get('key1');

      // Adding key3 should evict key2
      cache.set('key3', 'val3');

      expect(cache.get('key1')).toBe('val1');
      expect(cache.get('key2')).toBeNull(); // evicted!
      expect(cache.get('key3')).toBe('val3');
      expect(cache.getStats().evictions).toBe(1);
    });
  });
});

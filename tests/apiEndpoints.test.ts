import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { app, server } from '../server';

describe('Priority 4: End-to-End API Endpoints and Failure Scenarios', () => {
  let baseUrl: string;

  beforeAll(async () => {
    // Wait for server or use app directly with an ephemeral port
    const port = 5001;
    await new Promise<void>((resolve) => {
      // If server is already listening, we can query it or listen on another port
      if (server.listening) {
        baseUrl = `http://localhost:${(server.address() as any)?.port || 5000}`;
        resolve();
      } else {
        server.listen(port, () => {
          baseUrl = `http://localhost:${port}`;
          resolve();
        });
      }
    });
  });

  it('serves /api/metrics returning latency quantiles and cache stats', async () => {
    const res = await fetch(`${baseUrl}/api/metrics`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty('api');
    expect(data.api).toHaveProperty('latency');
    expect(data.api.latency).toHaveProperty('p50Ms');
    expect(data.api.latency).toHaveProperty('p95Ms');
    expect(data.api.latency).toHaveProperty('p99Ms');

    expect(data).toHaveProperty('cache');
    expect(data.cache).toHaveProperty('hitRatio');
    expect(data).toHaveProperty('concurrency');
    expect(data.concurrency).toHaveProperty('coalescedRequests');
    expect(data).toHaveProperty('upstream');
    expect(data.upstream).toHaveProperty('circuitBreakerState');
  });

  it('serves /api/circuit-status and responds to trip and reset commands', async () => {
    // Get circuit status
    const res1 = await fetch(`${baseUrl}/api/circuit-status`);
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.state).toBe('CLOSED');

    // Trip circuit
    const tripRes = await fetch(`${baseUrl}/api/circuit/trip`, { method: 'POST' });
    expect(tripRes.status).toBe(200);
    const tripData = await tripRes.json();
    expect(tripData.stats.state).toBe('OPEN');

    // Reset circuit
    const resetRes = await fetch(`${baseUrl}/api/circuit/reset`, { method: 'POST' });
    expect(resetRes.status).toBe(200);
    const resetData = await resetRes.json();
    expect(resetData.stats.state).toBe('CLOSED');
  });

  it('executes /api/benchmark verifying singleflight request coalescing', async () => {
    const res = await fetch(`${baseUrl}/api/benchmark?concurrency=25`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.requestedConcurrency).toBe(25);
    expect(data.completedRequests).toBe(25);
    expect(data.upstreamFetchesTriggered).toBe(1); // Exactly 1 upstream fetch!
    expect(data.requestsDeduplicated).toBe(24);
    expect(data.proof).toContain('VERIFIED: SingleFlight coalescing');
  });

  it('serves /health check with circuit status', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.circuitBreaker).toBe('CLOSED');
  });
});

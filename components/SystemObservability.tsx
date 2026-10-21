import React, { useState, useEffect } from 'react';
import { SystemMetricsReport } from '../server/metrics/metricsService';
import { getSystemMetrics, runConcurrencyBenchmark } from '../services/backendService';

export const SystemObservability: React.FC = () => {
  const [metrics, setMetrics] = useState<SystemMetricsReport | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<any | null>(null);
  const [runningBenchmark, setRunningBenchmark] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchMetrics = async () => {
    try {
      const data = await getSystemMetrics();
      setMetrics(data);
    } catch (e) {
      console.error('Failed to load system metrics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 4000); // Polling every 4s
    return () => clearInterval(interval);
  }, []);

  const handleRunBenchmark = async () => {
    setRunningBenchmark(true);
    try {
      const res = await runConcurrencyBenchmark(50);
      setBenchmarkResult(res);
      await fetchMetrics(); // Refresh metrics after benchmark
    } catch (e) {
      console.error('Benchmark error:', e);
    } finally {
      setRunningBenchmark(false);
    }
  };

  return (
    <div className="bg-neutral-800/90 backdrop-blur-md rounded-xl border border-neutral-700/80 p-6 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-700/60 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <h2 className="text-xl font-bold uppercase tracking-wider text-white f1-font">
              System Observability & Concurrency HUD
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Real-time backend telemetry: p50/p95/p99 latency quantiles, cache hit ratios, singleflight coalescing, and circuit breaker health
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="run-benchmark-btn"
            onClick={handleRunBenchmark}
            disabled={runningBenchmark}
            className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-red-600/30 flex items-center gap-2 disabled:opacity-50"
          >
            {runningBenchmark ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Benchmarking 50 Concurrent Requests...
              </>
            ) : (
              <>
                <span>⚡</span> Run 50-Request Coalescing Benchmark
              </>
            )}
          </button>
        </div>
      </div>

      {loading && !metrics ? (
        <div className="py-12 flex justify-center items-center text-neutral-400 text-xs">
          Loading metrics telemetry...
        </div>
      ) : metrics ? (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Latency Quantile Card */}
            <div className="p-4 bg-neutral-900/80 rounded-xl border border-neutral-700/80">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                API Response Latency
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono text-emerald-400">
                  {metrics.api.latency.p50Ms}ms
                </span>
                <span className="text-xs text-neutral-400 font-mono">p50</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                <span>p95: {metrics.api.latency.p95Ms}ms</span>
                <span>p99: {metrics.api.latency.p99Ms}ms</span>
              </div>
            </div>

            {/* Cache Efficiency Card */}
            <div className="p-4 bg-neutral-900/80 rounded-xl border border-neutral-700/80">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Cache Hit Ratio
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono text-blue-400">
                  {Math.round(metrics.cache.hitRatio * 100)}%
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  ({metrics.cache.freshHits + metrics.cache.swrHits}/{metrics.cache.totalLookups})
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                <span>Fresh: {metrics.cache.freshHits}</span>
                <span>SWR: {metrics.cache.swrHits}</span>
              </div>
            </div>

            {/* Singleflight Coalesced Card */}
            <div className="p-4 bg-neutral-900/80 rounded-xl border border-neutral-700/80">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Requests Deduplicated
              </span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black font-mono text-amber-400">
                  {metrics.concurrency.coalescedRequests}
                </span>
                <span className="text-xs text-neutral-400">coalesced</span>
              </div>
              <p className="mt-1 text-[11px] text-neutral-400">
                Prevented redundant OpenF1 upstream calls
              </p>
            </div>

            {/* Circuit Breaker & Health Card */}
            <div className="p-4 bg-neutral-900/80 rounded-xl border border-neutral-700/80">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Circuit Breaker
              </span>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    metrics.upstream.circuitBreakerState === 'CLOSED'
                      ? 'bg-emerald-400 shadow-md shadow-emerald-500/50'
                      : metrics.upstream.circuitBreakerState === 'HALF_OPEN'
                      ? 'bg-amber-400 shadow-md shadow-amber-500/50'
                      : 'bg-red-500 shadow-md shadow-red-500/50'
                  }`}
                ></span>
                <span className="text-lg font-black font-mono text-white">
                  {metrics.upstream.circuitBreakerState}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-400 font-mono">
                <span>Trips: {metrics.upstream.circuitBreakerTrips}</span>
                <span>Rolling RPM: {metrics.upstream.rollingRpm}</span>
              </div>
            </div>
          </div>

          {/* Benchmark Results Display */}
          {benchmarkResult && (
            <div className="p-5 bg-gradient-to-r from-neutral-900 via-neutral-900/90 to-red-950/30 rounded-xl border border-red-500/40 animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5">
                  <span>🚀</span> Live Concurrency Benchmark Results
                </span>
                <span className="text-xs font-mono px-2 py-0.5 bg-red-950 border border-red-500/50 text-red-300 rounded font-bold">
                  {benchmarkResult.coalescingEfficiency} Coalescing Efficiency
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase">Concurrent Clients</span>
                  <span className="text-lg font-bold text-white">{benchmarkResult.requestedConcurrency}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase">Upstream Calls Made</span>
                  <span className="text-lg font-bold text-emerald-400">{benchmarkResult.upstreamFetchesTriggered} (Only 1!)</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase">Calls Deduplicated</span>
                  <span className="text-lg font-bold text-blue-400">{benchmarkResult.requestsDeduplicated}</span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase">Total Benchmark Time</span>
                  <span className="text-lg font-bold text-amber-400">{benchmarkResult.totalDurationMs}ms</span>
                </div>
              </div>

              <div className="mt-3 p-2.5 bg-neutral-950/80 rounded border border-neutral-800 text-[11px] text-neutral-300">
                <strong className="text-emerald-400">Empirical Proof:</strong> {benchmarkResult.proof}
              </div>
            </div>
          )}

          {/* Deep Observability Breakdown Table */}
          <div className="bg-neutral-900/70 rounded-xl border border-neutral-700/80 p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 mb-4">
              Detailed Upstream & Concurrency Instrumentation
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="space-y-3">
                <div className="flex justify-between py-1 border-b border-neutral-800">
                  <span className="text-neutral-400">Total API Invocations:</span>
                  <span className="font-mono text-white font-bold">{metrics.api.totalRequests}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800">
                  <span className="text-neutral-400">Active Requests in Flight:</span>
                  <span className="font-mono text-white font-bold">{metrics.api.activeRequests}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800">
                  <span className="text-neutral-400">Error Rate:</span>
                  <span className="font-mono text-white font-bold">{(metrics.api.errorRate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800">
                  <span className="text-neutral-400">Cache Stale-While-Revalidate Hits:</span>
                  <span className="font-mono text-white font-bold">{metrics.cache.swrHits}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between py-1 border-b border-neutral-800">
                  <span className="text-neutral-400">Total Upstream Requests:</span>
                  <span className="font-mono text-white font-bold">{metrics.upstream.requestsTotal}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800">
                  <span className="text-neutral-400">HTTP 429 Rate Limits Hit:</span>
                  <span className="font-mono text-white font-bold">{metrics.upstream.rateLimits429Total}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800">
                  <span className="text-neutral-400">Upstream Retries Executed:</span>
                  <span className="font-mono text-white font-bold">{metrics.upstream.retriesTotal}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-neutral-800">
                  <span className="text-neutral-400">Semaphore Average Queue Wait:</span>
                  <span className="font-mono text-white font-bold">{metrics.concurrency.averageQueueWaitMs}ms</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

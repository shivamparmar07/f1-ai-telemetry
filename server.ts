import express from 'express';
import cors from 'cors';
import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { APICache } from './cache';
import {
  fetchMeetings,
  fetchSessions,
  fetchDrivers,
  fetchSessionResults,
  fetchStartingGrid,
  fetchStints,
  fetchLaps,
  fetchPositions,
  fetchRaceControl,
  fetchPitStops,
  fetchIntervals,
  upstreamClient,
} from './openF1Poller';
import { globalMetrics } from './server/metrics/metricsService';
import { reconstructRace } from './services/raceReconstruction';
import { compareDrivers, generateRaceIntelligenceSummary } from './services/raceIntelligence';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const cache = new APICache(1000);
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Performance Observability Middleware: tracks every API call duration and outcome
app.use((req, res, next) => {
  // Exclude static assets from latency quantiles
  if (req.path.startsWith('/api') || req.path === '/health') {
    const recordFinish = globalMetrics.startApiRequest();
    res.on('finish', () => {
      const isError = res.statusCode >= 500;
      recordFinish(isError);
    });
  }
  next();
});

// Connected WebSocket clients
const clients = new Set<WebSocket>();

// Broadcast cache update to all connected clients
function broadcastUpdate(eventType: string, data: any) {
  const message = JSON.stringify({ type: eventType, data, timestamp: Date.now() });
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// WebSocket connection handling
wss.on('connection', (ws: WebSocket) => {
  clients.add(ws);

  // Send initial metrics snapshot on connect
  const initialStats = globalMetrics.getReport(
    cache.getStats(),
    upstreamClient.semaphore.getStats(),
    upstreamClient.singleFlight.getStats(),
    upstreamClient.circuitBreaker.getStats()
  );
  ws.send(JSON.stringify({ type: 'metrics_snapshot', data: initialStats, timestamp: Date.now() }));

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// Periodic WebSocket broadcast of metrics (every 10 seconds)
setInterval(() => {
  if (clients.size > 0) {
    const metrics = globalMetrics.getReport(
      cache.getStats(),
      upstreamClient.semaphore.getStats(),
      upstreamClient.singleFlight.getStats(),
      upstreamClient.circuitBreaker.getStats()
    );
    broadcastUpdate('system_metrics', metrics);
  }
}, 10000);

// ==========================================
// REST API Endpoints with SWR & Observability
// ==========================================

// Meetings by year
app.get('/api/meetings/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    const cacheKey = `meetings_${year}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchMeetings(year),
      3600, // 1 hour fresh
      86400, // 24 hours stale
      (updated) => broadcastUpdate('meetings', { year, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch meetings' });
  }
});

// Sessions by meeting
app.get('/api/sessions/:meetingKey', async (req, res) => {
  try {
    const meetingKey = parseInt(req.params.meetingKey, 10);
    const cacheKey = `sessions_${meetingKey}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchSessions(meetingKey),
      3600,
      86400,
      (updated) => broadcastUpdate('sessions', { meetingKey, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch sessions' });
  }
});

// Drivers by session
app.get('/api/drivers/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const cacheKey = `drivers_${sessionKey}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchDrivers(sessionKey),
      3600,
      86400,
      (updated) => broadcastUpdate('drivers', { sessionKey, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch drivers' });
  }
});

// Session results
app.get('/api/session-results/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const cacheKey = `results_${sessionKey}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchSessionResults(sessionKey),
      300,
      1800,
      (updated) => broadcastUpdate('results', { sessionKey, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch results' });
  }
});

// Starting grid
app.get('/api/grid/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const cacheKey = `grid_${sessionKey}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchStartingGrid(sessionKey),
      300,
      1800,
      (updated) => broadcastUpdate('grid', { sessionKey, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching grid:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch grid' });
  }
});

// Stints
app.get('/api/stints/:sessionKey/:driverNumber?', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const driverNumber = req.params.driverNumber ? parseInt(req.params.driverNumber, 10) : undefined;
    const cacheKey = driverNumber ? `stints_${sessionKey}_${driverNumber}` : `stints_${sessionKey}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchStints(sessionKey, driverNumber),
      300,
      1800,
      (updated) => broadcastUpdate('stints', { sessionKey, driverNumber, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching stints:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch stints' });
  }
});

// Laps
app.get('/api/laps/:sessionKey/:driverNumber?', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const driverNumber = req.params.driverNumber ? parseInt(req.params.driverNumber, 10) : undefined;
    const cacheKey = driverNumber ? `laps_${sessionKey}_${driverNumber}` : `laps_${sessionKey}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchLaps(sessionKey, driverNumber),
      300,
      1800,
      (updated) => broadcastUpdate('laps', { sessionKey, driverNumber, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching laps:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch laps' });
  }
});

// Positions
app.get('/api/positions/:sessionKey/:driverNumber?', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const driverNumber = req.params.driverNumber ? parseInt(req.params.driverNumber, 10) : undefined;
    const cacheKey = driverNumber ? `positions_${sessionKey}_${driverNumber}` : `positions_${sessionKey}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchPositions(sessionKey, driverNumber),
      300,
      1800,
      (updated) => broadcastUpdate('positions', { sessionKey, driverNumber, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch positions' });
  }
});

// Race Control events (Flags, Safety Cars, Incidents)
app.get('/api/race-control/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const cacheKey = `race_control_${sessionKey}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchRaceControl(sessionKey),
      300,
      1800,
      (updated) => broadcastUpdate('race_control', { sessionKey, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching race control:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch race control' });
  }
});

// Pit stop events
app.get('/api/pit/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const cacheKey = `pit_${sessionKey}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchPitStops(sessionKey),
      300,
      1800,
      (updated) => broadcastUpdate('pit', { sessionKey, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching pit data:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch pit data' });
  }
});

// Intervals (gap to leader and interval to car ahead)
app.get('/api/intervals/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const cacheKey = `intervals_${sessionKey}`;

    const data = await cache.getOrFetch(
      cacheKey,
      () => fetchIntervals(sessionKey),
      300,
      1800,
      (updated) => broadcastUpdate('intervals', { sessionKey, data: updated })
    );

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching intervals:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch intervals' });
  }
});

// ==========================================
// Priority 1: Full Race Reconstruction Engine
// ==========================================
app.get('/api/race-timeline/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const cacheKey = `reconstructed_timeline_${sessionKey}`;

    const timeline = await cache.getOrFetch(
      cacheKey,
      async () => {
        // Fetch necessary streams with bounded concurrency and coalescing
        const [
          drivers,
          sessionResults,
          startingGrid,
          laps,
          positions,
          intervals,
          stints,
          pitStops,
          raceControl,
        ] = await Promise.all([
          fetchDrivers(sessionKey).catch(() => []),
          fetchSessionResults(sessionKey).catch(() => []),
          fetchStartingGrid(sessionKey).catch(() => []),
          fetchLaps(sessionKey).catch(() => []),
          fetchPositions(sessionKey).catch(() => []),
          fetchIntervals(sessionKey).catch(() => []),
          fetchStints(sessionKey).catch(() => []),
          fetchPitStops(sessionKey).catch(() => []),
          fetchRaceControl(sessionKey).catch(() => []),
        ]);

        return reconstructRace({
          sessionKey,
          drivers,
          sessionResults,
          startingGrid,
          laps,
          positions,
          intervals,
          stints,
          pitStops,
          raceControl,
        });
      },
      300,
      1800,
      (updated) => broadcastUpdate('timeline_reconstructed', { sessionKey, data: updated })
    );

    res.json(timeline);
  } catch (error: any) {
    console.error('Error reconstructing race timeline:', error);
    res.status(500).json({ error: error.message || 'Failed to reconstruct race timeline' });
  }
});

// ==========================================
// Priority 5: Race Intelligence & Insights
// ==========================================

// Driver Head-to-Head Comparison
app.get('/api/intelligence/comparison/:sessionKey/:driver1/:driver2', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const d1 = parseInt(req.params.driver1, 10);
    const d2 = parseInt(req.params.driver2, 10);
    const cacheKey = `comparison_${sessionKey}_${d1}_${d2}`;

    const comparison = await cache.getOrFetch(
      cacheKey,
      async () => {
        // Reuse reconstructed timeline
        const timelineCacheKey = `reconstructed_timeline_${sessionKey}`;
        let timeline = cache.get<any>(timelineCacheKey);

        if (!timeline) {
          // Trigger timeline reconstruction if not already cached
          const [
            drivers,
            sessionResults,
            startingGrid,
            laps,
            positions,
            intervals,
            stints,
            pitStops,
            raceControl,
          ] = await Promise.all([
            fetchDrivers(sessionKey).catch(() => []),
            fetchSessionResults(sessionKey).catch(() => []),
            fetchStartingGrid(sessionKey).catch(() => []),
            fetchLaps(sessionKey).catch(() => []),
            fetchPositions(sessionKey).catch(() => []),
            fetchIntervals(sessionKey).catch(() => []),
            fetchStints(sessionKey).catch(() => []),
            fetchPitStops(sessionKey).catch(() => []),
            fetchRaceControl(sessionKey).catch(() => []),
          ]);

          timeline = reconstructRace({
            sessionKey,
            drivers,
            sessionResults,
            startingGrid,
            laps,
            positions,
            intervals,
            stints,
            pitStops,
            raceControl,
          });
          cache.set(timelineCacheKey, timeline, 300, 1800);
        }

        const result = compareDrivers(d1, d2, timeline);
        if (!result) {
          throw new Error(`Unable to compare drivers #${d1} and #${d2} for session ${sessionKey}`);
        }
        return result;
      },
      300,
      1800
    );

    res.json(comparison);
  } catch (error: any) {
    console.error('Error generating driver comparison:', error);
    res.status(500).json({ error: error.message || 'Failed to generate driver comparison' });
  }
});

// Race Intelligence Summary (gainers/losers, pit stops, notable events)
app.get('/api/intelligence/summary/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey, 10);
    const cacheKey = `intelligence_summary_${sessionKey}`;

    const summary = await cache.getOrFetch(
      cacheKey,
      async () => {
        const timelineCacheKey = `reconstructed_timeline_${sessionKey}`;
        let timeline = cache.get<any>(timelineCacheKey);

        if (!timeline) {
          const [
            drivers,
            sessionResults,
            startingGrid,
            laps,
            positions,
            intervals,
            stints,
            pitStops,
            raceControl,
          ] = await Promise.all([
            fetchDrivers(sessionKey).catch(() => []),
            fetchSessionResults(sessionKey).catch(() => []),
            fetchStartingGrid(sessionKey).catch(() => []),
            fetchLaps(sessionKey).catch(() => []),
            fetchPositions(sessionKey).catch(() => []),
            fetchIntervals(sessionKey).catch(() => []),
            fetchStints(sessionKey).catch(() => []),
            fetchPitStops(sessionKey).catch(() => []),
            fetchRaceControl(sessionKey).catch(() => []),
          ]);

          timeline = reconstructRace({
            sessionKey,
            drivers,
            sessionResults,
            startingGrid,
            laps,
            positions,
            intervals,
            stints,
            pitStops,
            raceControl,
          });
          cache.set(timelineCacheKey, timeline, 300, 1800);
        }

        return generateRaceIntelligenceSummary(timeline);
      },
      300,
      1800
    );

    res.json(summary);
  } catch (error: any) {
    console.error('Error generating intelligence summary:', error);
    res.status(500).json({ error: error.message || 'Failed to generate intelligence summary' });
  }
});

// ==========================================
// Priority 3: Observability & Metrics
// ==========================================

// Real-time system metrics
app.get('/api/metrics', (req, res) => {
  const report = globalMetrics.getReport(
    cache.getStats(),
    upstreamClient.semaphore.getStats(),
    upstreamClient.singleFlight.getStats(),
    upstreamClient.circuitBreaker.getStats()
  );
  res.json(report);
});

// Circuit Breaker Status
app.get('/api/circuit-status', (req, res) => {
  res.json(upstreamClient.circuitBreaker.getStats());
});

// Manual circuit breaker control for testing
app.post('/api/circuit/trip', (req, res) => {
  upstreamClient.circuitBreaker.trip();
  res.json({ message: 'Circuit breaker tripped to OPEN', stats: upstreamClient.circuitBreaker.getStats() });
});

app.post('/api/circuit/reset', (req, res) => {
  upstreamClient.circuitBreaker.reset();
  res.json({ message: 'Circuit breaker reset to CLOSED', stats: upstreamClient.circuitBreaker.getStats() });
});

// Live Concurrency & Coalescing Benchmark Route
app.get('/api/benchmark', async (req, res) => {
  const concurrency = parseInt((req.query.concurrency as string) || '50', 10);
  const benchmarkKey = `benchmark_resource_${Date.now()}`;

  let upstreamFetchCount = 0;
  const mockUpstreamFetch = async () => {
    upstreamFetchCount++;
    await new Promise((resolve) => setTimeout(resolve, 150)); // simulate 150ms network latency
    return { data: 'ok', timestamp: Date.now() };
  };

  const startTime = Date.now();

  // Dispatch N simultaneous requests for the exact same uncached key
  const promises = Array.from({ length: concurrency }).map(() =>
    upstreamClient.singleFlight.execute(benchmarkKey, mockUpstreamFetch)
  );

  const results = await Promise.all(promises);
  const totalDurationMs = Date.now() - startTime;

  res.json({
    description: `Simulated ${concurrency} simultaneous requests for the same uncached resource`,
    requestedConcurrency: concurrency,
    completedRequests: results.length,
    upstreamFetchesTriggered: upstreamFetchCount,
    requestsDeduplicated: concurrency - upstreamFetchCount,
    coalescingEfficiency: `${Math.round(((concurrency - upstreamFetchCount) / concurrency) * 100)}%`,
    totalDurationMs,
    averageLatencyMs: Math.round((totalDurationMs / concurrency) * 10) / 10,
    proof:
      upstreamFetchCount === 1
        ? 'VERIFIED: SingleFlight coalescing collapsed all concurrent requests into exactly 1 upstream fetch!'
        : 'FAILED: Duplicate upstream fetches occurred.',
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    circuitBreaker: upstreamClient.circuitBreaker.getState(),
  });
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'dist')));

// Catch-all route to serve React's index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 APICache with SWR & SingleFlight initialized`);
  console.log(`🛡️ Bounded Concurrency Semaphore & Circuit Breaker active`);
  console.log(`📈 Metrics & Observability available at http://localhost:${PORT}/api/metrics`);
  console.log(`🔌 WebSocket server ready for connections`);
});

export { app, server, broadcastUpdate, cache };

import express from 'express';
import cors from 'cors';
import { WebSocket, WebSocketServer } from 'ws';
import http from 'http';
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
} from './openF1Poller';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const cache = new APICache();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Connected WebSocket clients
const clients = new Set<WebSocket>();

// Broadcast cache update to all connected clients
function broadcastUpdate(eventType: string, data: any) {
  const message = JSON.stringify({ type: eventType, data, timestamp: Date.now() });
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// WebSocket connection
wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');
  clients.add(ws);

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// REST API Endpoints

// Meetings by year
app.get('/api/meetings/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const cacheKey = `meetings_${year}`;
    
    let data = cache.get(cacheKey);
    if (!data) {
      data = await fetchMeetings(year);
      cache.set(cacheKey, data, 3600); // 1 hour TTL
      broadcastUpdate('meetings', { year, data });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// Sessions by meeting
app.get('/api/sessions/:meetingKey', async (req, res) => {
  try {
    const meetingKey = parseInt(req.params.meetingKey);
    const cacheKey = `sessions_${meetingKey}`;
    
    let data = cache.get(cacheKey);
    if (!data) {
      data = await fetchSessions(meetingKey);
      cache.set(cacheKey, data, 3600);
      broadcastUpdate('sessions', { meetingKey, data });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Drivers by session
app.get('/api/drivers/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey);
    const cacheKey = `drivers_${sessionKey}`;
    
    let data = cache.get(cacheKey);
    if (!data) {
      data = await fetchDrivers(sessionKey);
      cache.set(cacheKey, data, 3600);
      broadcastUpdate('drivers', { sessionKey, data });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching drivers:', error);
    res.status(500).json({ error: 'Failed to fetch drivers' });
  }
});

// Session results
app.get('/api/session-results/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey);
    const cacheKey = `results_${sessionKey}`;
    
    let data = cache.get(cacheKey);
    if (!data) {
      data = await fetchSessionResults(sessionKey);
      cache.set(cacheKey, data, 300); // 5 min TTL for race data
      broadcastUpdate('results', { sessionKey, data });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Starting grid
app.get('/api/grid/:sessionKey', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey);
    const cacheKey = `grid_${sessionKey}`;
    
    let data = cache.get(cacheKey);
    if (!data) {
      data = await fetchStartingGrid(sessionKey);
      cache.set(cacheKey, data, 300);
      broadcastUpdate('grid', { sessionKey, data });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching grid:', error);
    res.status(500).json({ error: 'Failed to fetch grid' });
  }
});

// Stints
app.get('/api/stints/:sessionKey/:driverNumber', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey);
    const driverNumber = parseInt(req.params.driverNumber);
    const cacheKey = `stints_${sessionKey}_${driverNumber}`;
    
    let data = cache.get(cacheKey);
    if (!data) {
      data = await fetchStints(sessionKey, driverNumber);
      cache.set(cacheKey, data, 300);
      broadcastUpdate('stints', { sessionKey, driverNumber, data });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching stints:', error);
    res.status(500).json({ error: 'Failed to fetch stints' });
  }
});

// Laps
app.get('/api/laps/:sessionKey/:driverNumber', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey);
    const driverNumber = parseInt(req.params.driverNumber);
    const cacheKey = `laps_${sessionKey}_${driverNumber}`;
    
    let data = cache.get(cacheKey);
    if (!data) {
      data = await fetchLaps(sessionKey, driverNumber);
      cache.set(cacheKey, data, 300);
      broadcastUpdate('laps', { sessionKey, driverNumber, data });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching laps:', error);
    res.status(500).json({ error: 'Failed to fetch laps' });
  }
});

// Positions
app.get('/api/positions/:sessionKey/:driverNumber', async (req, res) => {
  try {
    const sessionKey = parseInt(req.params.sessionKey);
    const driverNumber = parseInt(req.params.driverNumber);
    const cacheKey = `positions_${sessionKey}_${driverNumber}`;
    
    let data = cache.get(cacheKey);
    if (!data) {
      data = await fetchPositions(sessionKey, driverNumber);
      cache.set(cacheKey, data, 300);
      broadcastUpdate('positions', { sessionKey, driverNumber, data });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

server.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Cache system initialized`);
  console.log(`🔌 WebSocket server ready for connections`);
});

export { broadcastUpdate, cache };

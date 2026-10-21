/**
 * Backend API Service
 * Proxies calls to the Express backend with support for race reconstruction,
 * driver comparison, race intelligence, and system observability.
 */

import { ReconstructedRaceTimeline } from '../types/reconstruction';
import { DriverComparisonResult, RaceIntelligenceSummary } from './raceIntelligence';
import { SystemMetricsReport } from '../server/metrics/metricsService';

// @ts-ignore
const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:5000';

/**
 * Fetch meetings by year
 */
export async function getMeetingsByYear(year: number): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/meetings/${year}`);
  if (!response.ok) throw new Error('Failed to fetch meetings');
  return response.json();
}

/**
 * Fetch sessions for a meeting
 */
export async function getSessionsByMeeting(meetingKey: number): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/sessions/${meetingKey}`);
  if (!response.ok) throw new Error('Failed to fetch sessions');
  return response.json();
}

/**
 * Fetch drivers for a session
 */
export async function getDriversBySession(sessionKey: number): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/drivers/${sessionKey}`);
  if (!response.ok) throw new Error('Failed to fetch drivers');
  return response.json();
}

/**
 * Fetch session results
 */
export async function getSessionResults(sessionKey: number): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/session-results/${sessionKey}`);
  if (!response.ok) throw new Error('Failed to fetch results');
  return response.json();
}

/**
 * Fetch starting grid
 */
export async function getStartingGrid(sessionKey: number): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/grid/${sessionKey}`);
  if (!response.ok) throw new Error('Failed to fetch grid');
  return response.json();
}

/**
 * Fetch stints
 */
export async function getStints(sessionKey: number, driverNumber?: number): Promise<any[]> {
  const endpoint = driverNumber !== undefined
    ? `${BACKEND_URL}/api/stints/${sessionKey}/${driverNumber}`
    : `${BACKEND_URL}/api/stints/${sessionKey}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('Failed to fetch stints');
  return response.json();
}

/**
 * Fetch laps
 */
export async function getLaps(sessionKey: number, driverNumber?: number): Promise<any[]> {
  const endpoint = driverNumber !== undefined
    ? `${BACKEND_URL}/api/laps/${sessionKey}/${driverNumber}`
    : `${BACKEND_URL}/api/laps/${sessionKey}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('Failed to fetch laps');
  return response.json();
}

/**
 * Fetch position data
 */
export async function getPositionData(sessionKey: number, driverNumber?: number): Promise<any[]> {
  const endpoint = driverNumber !== undefined
    ? `${BACKEND_URL}/api/positions/${sessionKey}/${driverNumber}`
    : `${BACKEND_URL}/api/positions/${sessionKey}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('Failed to fetch positions');
  return response.json();
}

/**
 * Fetch full reconstructed race timeline across all drivers (Priority 1)
 */
export async function getRaceTimeline(sessionKey: number): Promise<ReconstructedRaceTimeline> {
  const response = await fetch(`${BACKEND_URL}/api/race-timeline/${sessionKey}`);
  if (!response.ok) throw new Error('Failed to fetch reconstructed race timeline');
  return response.json();
}

/**
 * Fetch Head-to-Head driver pace comparison (Priority 5)
 */
export async function getDriverComparison(
  sessionKey: number,
  driver1: number,
  driver2: number
): Promise<DriverComparisonResult> {
  const response = await fetch(`${BACKEND_URL}/api/intelligence/comparison/${sessionKey}/${driver1}/${driver2}`);
  if (!response.ok) throw new Error('Failed to fetch driver comparison');
  return response.json();
}

/**
 * Fetch Race Intelligence summary (gainers, losers, pit performance, notable events)
 */
export async function getIntelligenceSummary(sessionKey: number): Promise<RaceIntelligenceSummary> {
  const response = await fetch(`${BACKEND_URL}/api/intelligence/summary/${sessionKey}`);
  if (!response.ok) throw new Error('Failed to fetch race intelligence summary');
  return response.json();
}

/**
 * Fetch backend observability and performance metrics (Priority 3)
 */
export async function getSystemMetrics(): Promise<SystemMetricsReport> {
  const response = await fetch(`${BACKEND_URL}/api/metrics`);
  if (!response.ok) throw new Error('Failed to fetch system metrics');
  return response.json();
}

/**
 * Trigger live concurrency benchmark (Priority 2 & 3 verification)
 */
export async function runConcurrencyBenchmark(concurrency: number = 50): Promise<any> {
  const response = await fetch(`${BACKEND_URL}/api/benchmark?concurrency=${concurrency}`);
  if (!response.ok) throw new Error('Failed to run concurrency benchmark');
  return response.json();
}

/**
 * WebSocket connection for real-time cache updates and metric streaming
 */
export function connectWebSocket(onUpdate: (event: any) => void): WebSocket {
  const wsUrl = BACKEND_URL.replace('http', 'ws');
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to backend WebSocket');
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      onUpdate(message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('Disconnected from backend WebSocket');
  };

  return ws;
}

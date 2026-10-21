/**
 * OpenF1 API Poller with Robust Concurrency, Circuit Breaking, and Rate Limiting
 * Integrates UpstreamClient for bounded concurrency, request coalescing,
 * exponential backoff with jitter, 429 Retry-After compliance, and metrics collection.
 */

import { UpstreamClient } from './server/concurrency/upstreamClient';
import { globalMetrics } from './server/metrics/metricsService';

const API_BASE = 'https://api.openf1.org/v1';

// Upstream client instance configured for OpenF1 API
export const upstreamClient = new UpstreamClient({
  maxConcurrency: 3, // Prevent overloading upstream
  circuitBreakerThreshold: 5,
  cooldownPeriodMs: 15000,
  timeoutMs: 8000, // 8-second hard timeout
  maxRetries: 3,
  baseBackoffMs: 500,
  maxBackoffMs: 8000,
  onMetricEvent: (evt) => globalMetrics.recordUpstreamEvent(evt),
});

/**
 * Core resilient fetcher
 */
export async function fetchFromOpenF1<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  return upstreamClient.fetchWithResilience<T>(url);
}

// Public API Functions

export async function fetchMeetings(year: number) {
  return fetchFromOpenF1<any[]>(`/meetings?year=${year}`);
}

export async function fetchSessions(meetingKey: number) {
  return fetchFromOpenF1<any[]>(`/sessions?meeting_key=${meetingKey}`);
}

export async function fetchDrivers(sessionKey: number) {
  return fetchFromOpenF1<any[]>(`/drivers?session_key=${sessionKey}`);
}

export async function fetchSessionResults(sessionKey: number) {
  return fetchFromOpenF1<any[]>(`/session_result?session_key=${sessionKey}`);
}

export async function fetchStartingGrid(sessionKey: number) {
  return fetchFromOpenF1<any[]>(`/starting_grid?session_key=${sessionKey}`);
}

export async function fetchStints(sessionKey: number, driverNumber?: number) {
  const query = driverNumber ? `&driver_number=${driverNumber}` : '';
  return fetchFromOpenF1<any[]>(`/stints?session_key=${sessionKey}${query}`);
}

export async function fetchLaps(sessionKey: number, driverNumber?: number) {
  const query = driverNumber ? `&driver_number=${driverNumber}` : '';
  return fetchFromOpenF1<any[]>(`/laps?session_key=${sessionKey}${query}`);
}

export async function fetchPositions(sessionKey: number, driverNumber?: number) {
  const query = driverNumber ? `&driver_number=${driverNumber}` : '';
  return fetchFromOpenF1<any[]>(`/position?session_key=${sessionKey}${query}`);
}

export async function fetchRaceControl(sessionKey: number) {
  return fetchFromOpenF1<any[]>(`/race_control?session_key=${sessionKey}`);
}

export async function fetchPitStops(sessionKey: number, driverNumber?: number) {
  const query = driverNumber ? `&driver_number=${driverNumber}` : '';
  return fetchFromOpenF1<any[]>(`/pit?session_key=${sessionKey}${query}`);
}

export async function fetchIntervals(sessionKey: number, driverNumber?: number) {
  const query = driverNumber ? `&driver_number=${driverNumber}` : '';
  return fetchFromOpenF1<any[]>(`/intervals?session_key=${sessionKey}${query}`);
}

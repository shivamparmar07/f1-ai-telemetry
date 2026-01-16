/**
 * Backend API Service
 * Replaces direct OpenF1 API calls with backend proxy
 */

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
export async function getStints(sessionKey: number, driverNumber: number): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/stints/${sessionKey}/${driverNumber}`);
  if (!response.ok) throw new Error('Failed to fetch stints');
  return response.json();
}

/**
 * Fetch laps
 */
export async function getLaps(sessionKey: number, driverNumber: number): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/laps/${sessionKey}/${driverNumber}`);
  if (!response.ok) throw new Error('Failed to fetch laps');
  return response.json();
}

/**
 * Fetch position data
 */
export async function getPositionData(sessionKey: number, driverNumber: number): Promise<any[]> {
  const response = await fetch(`${BACKEND_URL}/api/positions/${sessionKey}/${driverNumber}`);
  if (!response.ok) throw new Error('Failed to fetch positions');
  return response.json();
}

/**
 * WebSocket connection for real-time cache updates
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
      console.log('Cache update received:', message.type);
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

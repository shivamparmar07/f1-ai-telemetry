/**
 * OpenF1 API Poller with rate limiting
 * Makes requests at a controlled rate (max 1 request per second)
 */

const API_BASE = 'https://api.openf1.org/v1';

// Queue for rate-limited requests
let requestQueue: (() => Promise<any>)[] = [];
let isProcessing = false;
const REQUEST_DELAY = 1000; // 1 second between requests

/**
 * Add request to queue and process
 */
async function queueRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    processQueue();
  });
}

/**
 * Process queue sequentially with delay
 */
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;

  isProcessing = true;
  while (requestQueue.length > 0) {
    const request = requestQueue.shift();
    if (request) {
      try {
        await request();
      } catch (error) {
        console.error('Queued request failed:', error);
      }
      // Wait before next request
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    }
  }
  isProcessing = false;
}

/**
 * Fetch with retry and exponential backoff
 */
async function fetchWithRetry<T>(url: string, maxRetries: number = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);

      // Don't retry on 4xx errors (bad request)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`API error: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      const delay = Math.pow(2, attempt) * 500;
      console.warn(`Request failed, retrying after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Failed after max retries');
}

// Public API functions with rate limiting

export async function fetchMeetings(year: number) {
  return queueRequest(() =>
    fetchWithRetry(`${API_BASE}/meetings?year=${year}`)
  );
}

export async function fetchSessions(meetingKey: number) {
  return queueRequest(() =>
    fetchWithRetry(`${API_BASE}/sessions?meeting_key=${meetingKey}`)
  );
}

export async function fetchDrivers(sessionKey: number) {
  return queueRequest(() =>
    fetchWithRetry(`${API_BASE}/drivers?session_key=${sessionKey}`)
  );
}

export async function fetchSessionResults(sessionKey: number) {
  return queueRequest(() =>
    fetchWithRetry(`${API_BASE}/session_result?session_key=${sessionKey}`)
  );
}

export async function fetchStartingGrid(sessionKey: number) {
  return queueRequest(() =>
    fetchWithRetry(`${API_BASE}/starting_grid?session_key=${sessionKey}`)
  );
}

export async function fetchStints(sessionKey: number, driverNumber: number) {
  return queueRequest(() =>
    fetchWithRetry(
      `${API_BASE}/stints?session_key=${sessionKey}&driver_number=${driverNumber}`
    )
  );
}

export async function fetchLaps(sessionKey: number, driverNumber: number) {
  return queueRequest(() =>
    fetchWithRetry(
      `${API_BASE}/laps?session_key=${sessionKey}&driver_number=${driverNumber}`
    )
  );
}

export async function fetchPositions(sessionKey: number, driverNumber: number) {
  return queueRequest(() =>
    fetchWithRetry(
      `${API_BASE}/position?session_key=${sessionKey}&driver_number=${driverNumber}`
    )
  );
}

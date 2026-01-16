/**
 * OpenF1 API Service
 * Fetches real-time and historical Formula 1 data from the OpenF1 API
 * API Documentation: https://openf1.org
 */

const API_BASE = 'https://api.openf1.org/v1';

// Request queue to handle rate limiting
let requestQueue: Array<() => Promise<any>> = [];
let isProcessing = false;
const REQUEST_DELAY = 200; // ms between requests

/**
 * Retry logic for failed requests with exponential backoff
 */
async function fetchWithRetry(url: string, maxRetries = 3): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
        const backoffDelay = Math.pow(2, attempt) * 1000; // Exponential backoff
        const delay = Math.max(retryAfter * 1000, backoffDelay);
        
        console.warn(`Rate limited. Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
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
}

/**
 * Queue a request to be processed sequentially
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
 * Process request queue sequentially with delay
 */
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  
  isProcessing = true;
  while (requestQueue.length > 0) {
    const request = requestQueue.shift();
    if (request) {
      await request();
      // Add delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    }
  }
  isProcessing = false;
}

// Types for OpenF1 API responses
export interface OpenF1Driver {
  broadcast_name: string;
  country_code: string;
  driver_number: number;
  first_name: string;
  full_name: string;
  headshot_url: string;
  last_name: string;
  meeting_key: number;
  name_acronym: string;
  session_key: number;
  team_colour: string;
  team_name: string;
}

export interface OpenF1Meeting {
  circuit_key: number;
  circuit_image: string;
  circuit_short_name: string;
  circuit_type: string;
  country_code: string;
  country_flag: string;
  country_key: number;
  country_name: string;
  date_end: string;
  date_start: string;
  gmt_offset: string;
  location: string;
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  year: number;
}

export interface OpenF1Session {
  circuit_key: number;
  circuit_short_name: string;
  country_code: string;
  country_key: number;
  country_name: string;
  date_end: string;
  date_start: string;
  gmt_offset: string;
  location: string;
  meeting_key: number;
  session_key: number;
  session_name: string;
  session_type: string;
  year: number;
}

export interface OpenF1Stint {
  compound: string;
  driver_number: number;
  lap_end: number;
  lap_start: number;
  meeting_key: number;
  session_key: number;
  stint_number: number;
  tyre_age_at_start: number;
}

export interface OpenF1SessionResult {
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  driver_number: number;
  duration: number;
  gap_to_leader: number | string;
  number_of_laps: number;
  meeting_key: number;
  position: number;
  session_key: number;
}

export interface OpenF1Lap {
  date_start: string;
  driver_number: number;
  duration_sector_1: number;
  duration_sector_2: number;
  duration_sector_3: number;
  i1_speed: number;
  i2_speed: number;
  is_pit_out_lap: boolean;
  lap_duration: number;
  lap_number: number;
  meeting_key: number;
  segments_sector_1: number[];
  segments_sector_2: number[];
  segments_sector_3: number[];
  session_key: number;
  st_speed: number;
}

/**
 * Fetch meetings (races) for a specific year
 */
export async function getMeetingsByYear(year: number): Promise<OpenF1Meeting[]> {
  try {
    const data = await fetchWithRetry(`${API_BASE}/meetings?year=${year}`);
    return data;
  } catch (error) {
    console.error('Failed to fetch meetings:', error);
    return [];
  }
}

/**
 * Fetch all sessions for a specific meeting
 */
export async function getSessionsByMeeting(
  meetingKey: number
): Promise<OpenF1Session[]> {
  try {
    const data = await fetchWithRetry(`${API_BASE}/sessions?meeting_key=${meetingKey}`);
    return data;
  } catch (error) {
    console.error('Failed to fetch sessions:', error);
    return [];
  }
}

/**
 * Fetch drivers for a specific session
 */
export async function getDriversBySession(
  sessionKey: number
): Promise<OpenF1Driver[]> {
  try {
    const data = await fetchWithRetry(`${API_BASE}/drivers?session_key=${sessionKey}`);
    return data;
  } catch (error) {
    console.error('Failed to fetch drivers:', error);
    return [];
  }
}

/**
 * Fetch session results (final standings)
 */
export async function getSessionResults(
  sessionKey: number
): Promise<OpenF1SessionResult[]> {
  try {
    const data = await fetchWithRetry(`${API_BASE}/session_result?session_key=${sessionKey}`);
    return data;
  } catch (error) {
    console.error('Failed to fetch session results:', error);
    return [];
  }
}

/**
 * Fetch starting grid for a session
 */
export async function getStartingGrid(
  sessionKey: number
): Promise<any[]> {
  try {
    const data = await fetchWithRetry(`${API_BASE}/starting_grid?session_key=${sessionKey}`);
    return data;
  } catch (error) {
    console.error('Failed to fetch starting grid:', error);
    return [];
  }
}

/**
 * Fetch tyre stints for a driver in a session
 */
export async function getStints(
  sessionKey: number,
  driverNumber: number
): Promise<OpenF1Stint[]> {
  try {
    const data = await fetchWithRetry(
      `${API_BASE}/stints?session_key=${sessionKey}&driver_number=${driverNumber}`
    );
    return data;
  } catch (error) {
    console.error('Failed to fetch stints:', error);
    return [];
  }
}

/**
 * Fetch laps for a driver in a session
 */
export async function getLaps(
  sessionKey: number,
  driverNumber: number
): Promise<OpenF1Lap[]> {
  try {
    const data = await fetchWithRetry(
      `${API_BASE}/laps?session_key=${sessionKey}&driver_number=${driverNumber}`
    );
    return data;
  } catch (error) {
    console.error('Failed to fetch laps:', error);
    return [];
  }
}

/**
 * Fetch position data for a driver in a session
 */
export async function getPositionData(
  sessionKey: number,
  driverNumber: number
): Promise<any[]> {
  try {
    const data = await fetchWithRetry(
      `${API_BASE}/position?session_key=${sessionKey}&driver_number=${driverNumber}`
    );
    return data;
  } catch (error) {
    console.error('Failed to fetch position data:', error);
    return [];
  }
}

/**
 * Get the latest race session
 */
export async function getLatestRace(): Promise<OpenF1Session | null> {
  try {
    const currentYear = new Date().getFullYear();
    const meetings = await getMeetingsByYear(currentYear);
    
    if (meetings.length === 0) {
      return null;
    }

    // Get sessions for the latest meeting
    const latestMeeting = meetings[meetings.length - 1];
    const sessions = await getSessionsByMeeting(latestMeeting.meeting_key);
    
    // Find the race session (not practice or qualifying)
    const raceSession = sessions.find(
      (s) =>
        s.session_type === 'Race' ||
        s.session_type === 'Sprint' ||
        s.session_name?.includes('Race')
    );

    return raceSession || null;
  } catch (error) {
    console.error('Failed to get latest race:', error);
    return null;
  }
}

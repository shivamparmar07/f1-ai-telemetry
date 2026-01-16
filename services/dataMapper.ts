/**
 * Data Mapper Service
 * Converts OpenF1 API responses to internal app data structures
 */

import { Driver, Race, RaceResult, TelemetryPoint, TyreCompound, TyreStint } from '../types';
import {
  OpenF1Driver,
  OpenF1Meeting,
  OpenF1Session,
  OpenF1SessionResult,
  OpenF1Stint,
  OpenF1Lap,
} from './openF1Service';
import { TEAMS, TYRE_COLORS } from '../constants';

/**
 * Map OpenF1 driver to internal Driver type
 */
export function mapOpenF1Driver(openF1Driver: OpenF1Driver): Driver {
  return {
    id: `driver_${openF1Driver.driver_number}`,
    name: openF1Driver.full_name,
    number: openF1Driver.driver_number,
    team: openF1Driver.team_name,
    teamColor: `#${openF1Driver.team_colour}`,
    portraitUrl: openF1Driver.headshot_url,
  };
}

/**
 * Map OpenF1 meeting to internal Race type
 */
export function mapOpenF1Meeting(meeting: OpenF1Meeting): Race {
  return {
    id: `race_${meeting.meeting_key}`,
    name: meeting.meeting_name,
    date: meeting.date_start.split('T')[0], // Extract date part
    location: meeting.location,
    circuitName: meeting.circuit_short_name,
  };
}

/**
 * Convert tyre compound string to TyreCompound enum
 */
function mapTyreCompound(compound: string): TyreCompound {
  const compoundMap: { [key: string]: TyreCompound } = {
    SOFT: TyreCompound.SOFT,
    MEDIUM: TyreCompound.MEDIUM,
    HARD: TyreCompound.HARD,
    INTERMEDIATE: TyreCompound.INTER,
    WET: TyreCompound.WET,
  };
  return compoundMap[compound.toUpperCase()] || TyreCompound.HARD;
}

/**
 * Get tyre color based on compound
 */
function getTyreColor(compound: TyreCompound): string {
  const colorMap: { [key in TyreCompound]: string } = {
    [TyreCompound.SOFT]: TYRE_COLORS.Soft,
    [TyreCompound.MEDIUM]: TYRE_COLORS.Medium,
    [TyreCompound.HARD]: TYRE_COLORS.Hard,
    [TyreCompound.INTER]: TYRE_COLORS.Intermediate,
    [TyreCompound.WET]: TYRE_COLORS.Wet,
  };
  return colorMap[compound];
}

/**
 * Convert lap time in seconds to "M:SS.mmm" format
 */
function formatLapTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
  return `${minutes}:${secs.padStart(6, '0')}`;
}

/**
 * Map OpenF1 laps to telemetry points
 * Requires position data to be provided separately
 */
export function mapLapsToTelemetry(
  laps: OpenF1Lap[],
  positionHistory: Map<number, number>
): TelemetryPoint[] {
  return laps.map((lap) => {
    const position = positionHistory.get(lap.lap_number) || 20; // Default to position 20 if not found

    return {
      lap: lap.lap_number,
      position: position,
      lapTime: formatLapTime(lap.lap_duration),
      gapToLeader: 0, // Will be calculated later from session results
    };
  });
}

/**
 * Calculate pit stops count from laps data
 */
export function calculatePitStops(laps: OpenF1Lap[]): number {
  return laps.filter((lap) => lap.is_pit_out_lap).length;
}

/**
 * Calculate fastest lap time from laps data
 */
export function calculateFastestLap(laps: OpenF1Lap[]): string {
  if (laps.length === 0) return '0:00.000';
  
  const validLaps = laps.filter((lap) => lap.lap_duration && lap.lap_duration > 0);
  if (validLaps.length === 0) return '0:00.000';
  
  const fastestLapDuration = Math.min(...validLaps.map((lap) => lap.lap_duration));
  return formatLapTime(fastestLapDuration);
}

/**
 * Map OpenF1 stints to tyre strategy
 */
export function mapStintsToStrategy(stints: OpenF1Stint[]): TyreStint[] {
  return stints
    .sort((a, b) => a.stint_number - b.stint_number)
    .map((stint) => {
      const compound = mapTyreCompound(stint.compound);
      return {
        compound: compound,
        startLap: stint.lap_start,
        endLap: stint.lap_end,
        color: getTyreColor(compound),
      };
    });
}

/**
 * Create a RaceResult from session data
 */
export function createRaceResult(
  driverId: string,
  raceId: string,
  gridPosition: number,
  finishPosition: number,
  sessionResult: OpenF1SessionResult,
  tyreStrategy: TyreStint[],
  telemetry: TelemetryPoint[]
): RaceResult {
  // Determine status
  let status = 'Finished';
  if (sessionResult.dnf) status = 'DNF';
  if (sessionResult.dns) status = 'DNS';
  if (sessionResult.dsq) status = 'DSQ';

  // Extract points from position (F1 points system: 25, 18, 15, 12, 10, 8, 6, 4, 2, 1)
  const pointsMap: { [key: number]: number } = {
    1: 25,
    2: 18,
    3: 15,
    4: 12,
    5: 10,
    6: 8,
    7: 6,
    8: 4,
    9: 2,
    10: 1,
  };
  const points = pointsMap[finishPosition] || 0;

  return {
    driverId,
    raceId,
    gridPosition,
    finishPosition,
    status,
    points,
    tyreStrategy,
    telemetry,
  };
}

/**
 * Build a position history map from position data points
 * Correlates position timestamps with lap data
 * Fills in positions for all laps even if no update exists for that lap
 */
export function buildPositionHistory(
  positionData: any[],
  laps: OpenF1Lap[] = []
): Map<number, number> {
  const positionHistory = new Map<number, number>();

  // If no laps provided, use old behavior
  if (laps.length === 0) {
    positionData.forEach((point) => {
      if (point.lap_number !== undefined && point.lap_number !== null) {
        positionHistory.set(point.lap_number, point.position);
      }
    });
    return positionHistory;
  }

  // Sort position data by date to process chronologically
  const sortedPositions = [...positionData].sort((a, b) => {
    const timeA = new Date(a.date).getTime();
    const timeB = new Date(b.date).getTime();
    return timeA - timeB;
  });

  // Create array of laps sorted by lap number
  const sortedLaps = [...laps].sort((a, b) => a.lap_number - b.lap_number);

  // For each lap, find the most recent position update at or before that lap's start time
  sortedLaps.forEach((lap) => {
    if (!lap.date_start) {
      // For pit out laps without date_start, try to use the next lap's position if available
      return;
    }

    const lapTime = new Date(lap.date_start).getTime();
    let positionForLap = 20; // Default fallback

    // Find the most recent position update at or before this lap's start time
    for (const posUpdate of sortedPositions) {
      const posTime = new Date(posUpdate.date).getTime();
      if (posTime <= lapTime) {
        positionForLap = posUpdate.position;
      } else {
        // Position updates are sorted chronologically, so we can stop here
        break;
      }
    }

    positionHistory.set(lap.lap_number, positionForLap);
  });

  // Fill in any remaining gaps: if a lap has no position, use the previous lap's position
  if (sortedLaps.length > 0) {
    let lastKnownPosition = 20;
    for (const lap of sortedLaps) {
      if (positionHistory.has(lap.lap_number)) {
        lastKnownPosition = positionHistory.get(lap.lap_number)!;
      } else {
        positionHistory.set(lap.lap_number, lastKnownPosition);
      }
    }
  }

  return positionHistory;
}

/**
 * Race Reconstruction and Intelligence Types
 */

import { TyreCompound } from '../types';

export type DataConfidence = 'MEASURED' | 'INTERPOLATED' | 'MISSING';

export type DriverRaceStatus = 'RUNNING' | 'OUT_LAP' | 'IN_LAP' | 'RETIRED' | 'DNS' | 'DSQ';

export type OvertakeType = 'ON_TRACK' | 'PIT_OVERTAKE' | 'RETIREMENT_GAIN';

export interface DriverLapTimelinePoint {
  driverNumber: number;
  lapNumber: number;
  position: number | null;
  positionConfidence: DataConfidence;
  lapDuration: number | null; // duration in seconds
  lapDurationFormatted: string; // "1:23.456" or "MISSING"
  gapToLeader: number | null; // seconds
  gapToLeaderFormatted: string; // "+1.234s" or "LEADER" or "MISSING"
  intervalToAhead: number | null; // gap to car in front
  intervalFormatted: string;
  compound: TyreCompound;
  tyreAge: number;
  isPitLap: boolean;
  pitStopDuration?: number | null; // stationary time in seconds
  pitLaneDuration?: number | null; // total pit lane time
  status: DriverRaceStatus;
  missingFields: string[]; // explicit list of unmeasured attributes
}

export interface OvertakeEvent {
  lap: number;
  overtakingDriverNumber: number;
  overtakenDriverNumber: number;
  fromPosition: number;
  toPosition: number;
  type: OvertakeType;
  timestamp?: string;
  contextMessage?: string; // e.g. "Pitted under Safety Car" or "Turn 1 pass"
}

export interface TrackConditionEvent {
  lap: number;
  timestamp: string;
  category: 'SafetyCar' | 'Flag' | 'Drs' | 'Incident' | 'Other';
  status: 'SC' | 'VSC' | 'YELLOW' | 'DOUBLE_YELLOW' | 'RED' | 'GREEN' | 'CHEQUERED';
  message: string;
  scope?: string;
  driverNumber?: number | null;
}

export interface PitEvent {
  driverNumber: number;
  lapNumber: number;
  timestamp: string;
  pitDuration: number | null; // total pit lane time
  stopDuration: number | null; // stationary service time
  compoundBefore: TyreCompound;
  compoundAfter: TyreCompound;
  tyreAgeBefore: number;
}

export interface DriverGainStats {
  driverNumber: number;
  driverName: string;
  team: string;
  teamColor: string;
  gridPosition: number;
  finishPosition: number;
  netGain: number; // positive = gained, negative = lost
  overtakesCompleted: number;
  timesOvertaken: number;
  cleanPaceAvgSeconds: number | null;
}

export interface ReconstructedRaceTimeline {
  sessionKey: number;
  meetingKey?: number;
  totalLaps: number;
  drivers: Record<
    number,
    {
      driverNumber: number;
      name: string;
      broadcastName: string;
      team: string;
      teamColor: string;
      gridPosition: number;
      finishPosition: number;
      status: string;
    }
  >;
  laps: Array<{
    lapNumber: number;
    leaderDriverNumber: number | null;
    driverStates: Record<number, DriverLapTimelinePoint>;
    trackEvents: TrackConditionEvent[];
    overtakes: OvertakeEvent[];
    pitStops: PitEvent[];
  }>;
  driverGainStats: DriverGainStats[];
  dataQualityAudit: {
    totalPoints: number;
    measuredCount: number;
    interpolatedCount: number;
    missingCount: number;
    measuredPercentage: number;
  };
}

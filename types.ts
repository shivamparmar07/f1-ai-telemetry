export interface Driver {
  id: string;
  name: string;
  number: number;
  team: string;
  teamColor: string;
  portraitUrl: string;
}

export interface Race {
  id: string;
  name: string;
  date: string;
  location: string;
  circuitName: string;
}

export enum TyreCompound {
  SOFT = 'Soft',
  MEDIUM = 'Medium',
  HARD = 'Hard',
  INTER = 'Intermediate',
  WET = 'Wet'
}

export interface TyreStint {
  compound: TyreCompound;
  startLap: number;
  endLap: number;
  color: string;
}

export interface TelemetryPoint {
  lap: number;
  position: number;
  lapTime: string; // "1:23.456"
  gapToLeader: number; // seconds
}

export interface RaceResult {
  driverId: string;
  raceId: string;
  gridPosition: number;
  finishPosition: number;
  status: string; // "Finished", "DNF"
  points: number;
  tyreStrategy: TyreStint[];
  telemetry: TelemetryPoint[];
}

// AI Analysis Response Structure
export interface AIAnalysisResult {
  summary: string;
  rating: number; // 1-10
  paceIndex: number; // 0-100
  keyMoment: string;
  positives: string[];
  negatives: string[];
}
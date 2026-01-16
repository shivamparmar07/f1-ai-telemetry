import { Driver, Race, RaceResult, TyreCompound, TelemetryPoint } from './types';
import { TEAMS, TYRE_COLORS } from './constants';

export const MOCK_DRIVERS: Driver[] = [
  {
    id: 'max_verstappen',
    name: 'Max Verstappen',
    number: 1,
    team: TEAMS.RBR.name,
    teamColor: TEAMS.RBR.color,
    portraitUrl: 'https://picsum.photos/seed/max/200/200'
  },
  {
    id: 'sergio_perez',
    name: 'Sergio Perez',
    number: 11,
    team: TEAMS.RBR.name,
    teamColor: TEAMS.RBR.color,
    portraitUrl: 'https://picsum.photos/seed/checo/200/200'
  },
  {
    id: 'lewis_hamilton',
    name: 'Lewis Hamilton',
    number: 44,
    team: TEAMS.MER.name,
    teamColor: TEAMS.MER.color,
    portraitUrl: 'https://picsum.photos/seed/lewis/200/200'
  },
  {
    id: 'george_russell',
    name: 'George Russell',
    number: 63,
    team: TEAMS.MER.name,
    teamColor: TEAMS.MER.color,
    portraitUrl: 'https://picsum.photos/seed/george/200/200'
  },
  {
    id: 'charles_leclerc',
    name: 'Charles Leclerc',
    number: 16,
    team: TEAMS.FER.name,
    teamColor: TEAMS.FER.color,
    portraitUrl: 'https://picsum.photos/seed/charles/200/200'
  },
  {
    id: 'carlos_sainz',
    name: 'Carlos Sainz',
    number: 55,
    team: TEAMS.FER.name,
    teamColor: TEAMS.FER.color,
    portraitUrl: 'https://picsum.photos/seed/carlos/200/200'
  },
  {
    id: 'lando_norris',
    name: 'Lando Norris',
    number: 4,
    team: TEAMS.MCL.name,
    teamColor: TEAMS.MCL.color,
    portraitUrl: 'https://picsum.photos/seed/lando/200/200'
  },
  {
    id: 'oscar_piastri',
    name: 'Oscar Piastri',
    number: 81,
    team: TEAMS.MCL.name,
    teamColor: TEAMS.MCL.color,
    portraitUrl: 'https://picsum.photos/seed/oscar/200/200'
  },
  {
    id: 'fernando_alonso',
    name: 'Fernando Alonso',
    number: 14,
    team: TEAMS.AST.name,
    teamColor: TEAMS.AST.color,
    portraitUrl: 'https://picsum.photos/seed/fernando/200/200'
  }
];

export const MOCK_RACES: Race[] = [
  {
    id: 'bahrain_2024',
    name: 'Bahrain Grand Prix',
    date: '2024-03-02',
    location: 'Sakhir',
    circuitName: 'Bahrain International Circuit'
  },
  {
    id: 'miami_2024',
    name: 'Miami Grand Prix',
    date: '2024-05-05',
    location: 'Miami',
    circuitName: 'Miami International Autodrome'
  },
  {
    id: 'silverstone_2024',
    name: 'British Grand Prix',
    date: '2024-07-07',
    location: 'Silverstone',
    circuitName: 'Silverstone Circuit'
  },
  {
    id: 'monza_2024',
    name: 'Italian Grand Prix',
    date: '2024-09-01',
    location: 'Monza',
    circuitName: 'Autodromo Nazionale Monza'
  }
];

// Helper to generate realistic telemetry curves with pit stops
const generateTelemetry = (
  startPos: number, 
  finishPos: number, 
  laps: number,
  pitLaps: number[]
): TelemetryPoint[] => {
  const data: TelemetryPoint[] = [];
  let currentPos = startPos;
  
  // Calculate average improvement/decline per lap (excluding pit noise)
  const posDiff = finishPos - startPos;
  // A slight curve factor to make it look organic (fast start or fast finish)
  const curveFactor = Math.random() > 0.5 ? 1.2 : 0.8; 

  for (let i = 1; i <= laps; i++) {
    const progress = i / laps;
    
    // Base trend calculation
    let targetPosForLap = startPos + (posDiff * Math.pow(progress, curveFactor));
    
    // Add noise (battling, errors)
    let noise = (Math.random() - 0.5) * 1.5;
    
    // Pit stop logic: Drop positions significantly, then recover
    let pitEffect = 0;
    
    // Check if we are in a "pit window" (lap of pit or shortly after)
    pitLaps.forEach(pitLap => {
        if (i === pitLap) {
            pitEffect = 4 + Math.random() * 2; // Lost positions entering pits
        } else if (i > pitLap && i < pitLap + 4) {
             // Recovery phase (fresh tyres)
             const recoveryProgress = (i - pitLap) / 4;
             pitEffect = (4 - (recoveryProgress * 4)); 
        }
    });

    // Apply pit effect to the target position
    currentPos = targetPosForLap + noise + pitEffect;

    // Additional logic: Undercut/Overcut simulation
    // If it's the middle of the race, adding some variation for other cars pitting
    if (!pitLaps.includes(i) && i > 15 && i < laps - 10 && Math.random() > 0.85) {
        currentPos -= 1; // Gain a spot as others pit
    }

    // Clamp values
    currentPos = Math.max(1, Math.min(20, currentPos));
    
    // Lap time generation (Base ~1:30.000 + fuel effect + tyre deg)
    // Fuel load burns off -> faster lap times (-0.05s per lap)
    // Tyre degradation -> slower lap times (+0.08s per lap on old tyres)
    const baseTime = 90; // 1:30 in seconds
    const fuelEffect = -0.05 * i;
    const tyreAge = i % 20; // Rough approximation of tyre stint age
    const degEffect = 0.08 * tyreAge;
    const randomVar = (Math.random() - 0.5); // +/- 0.5s variance
    
    const lapTimeSeconds = baseTime + fuelEffect + degEffect + randomVar;
    const min = Math.floor(lapTimeSeconds / 60);
    const sec = (lapTimeSeconds % 60).toFixed(3);
    const lapTimeStr = `${min}:${sec.padStart(6, '0')}`;

    // Gap to leader calculation
    // If leader (pos 1), gap is 0. Else grows over time.
    const gap = currentPos === 1 ? 0 : (i * 0.8) + ((currentPos - 1) * 2) + Math.random();

    data.push({
      lap: i,
      position: Number(currentPos.toFixed(1)), // Keep 1 decimal for smoothness in chart, UI can round
      lapTime: lapTimeStr,
      gapToLeader: gap
    });
  }
  
  // Force exact finish position on last lap
  data[data.length - 1].position = finishPos;
  
  return data;
};

// Generate Mock Result based on Driver ID
export const getMockRaceResult = (driverId: string, raceId: string): RaceResult => {
  const totalLaps = 52; // Standard F1 race length approx
  let grid = 10;
  let finish = 10;
  let status = 'Finished';
  let points = 0;
  let strategy = [
      { compound: TyreCompound.MEDIUM, startLap: 1, endLap: 24, color: TYRE_COLORS.Medium },
      { compound: TyreCompound.HARD, startLap: 25, endLap: 52, color: TYRE_COLORS.Hard }
  ];
  let pitLaps = [25];

  switch (driverId) {
    case 'max_verstappen':
      grid = 1; finish = 1; points = 25;
      strategy = [
        { compound: TyreCompound.SOFT, startLap: 1, endLap: 18, color: TYRE_COLORS.Soft },
        { compound: TyreCompound.HARD, startLap: 19, endLap: 42, color: TYRE_COLORS.Hard },
        { compound: TyreCompound.SOFT, startLap: 43, endLap: 52, color: TYRE_COLORS.Soft }
      ];
      pitLaps = [19, 43];
      break;
      
    case 'sergio_perez':
      grid = 5; finish = 4; points = 12;
      strategy = [
        { compound: TyreCompound.MEDIUM, startLap: 1, endLap: 22, color: TYRE_COLORS.Medium },
        { compound: TyreCompound.HARD, startLap: 23, endLap: 52, color: TYRE_COLORS.Hard }
      ];
      pitLaps = [23];
      break;

    case 'lewis_hamilton':
      grid = 8; finish = 5; points = 10;
      strategy = [
        { compound: TyreCompound.MEDIUM, startLap: 1, endLap: 20, color: TYRE_COLORS.Medium },
        { compound: TyreCompound.HARD, startLap: 21, endLap: 45, color: TYRE_COLORS.Hard },
        { compound: TyreCompound.SOFT, startLap: 46, endLap: 52, color: TYRE_COLORS.Soft }
      ];
      pitLaps = [21, 46];
      break;

    case 'george_russell':
      grid = 3; finish = 7; points = 6;
      strategy = [
        { compound: TyreCompound.SOFT, startLap: 1, endLap: 15, color: TYRE_COLORS.Soft },
        { compound: TyreCompound.HARD, startLap: 16, endLap: 52, color: TYRE_COLORS.Hard }
      ];
      pitLaps = [16];
      break;

    case 'charles_leclerc':
      grid = 2; finish = 3; points = 15;
      strategy = [
        { compound: TyreCompound.MEDIUM, startLap: 1, endLap: 20, color: TYRE_COLORS.Medium },
        { compound: TyreCompound.HARD, startLap: 21, endLap: 52, color: TYRE_COLORS.Hard }
      ];
      pitLaps = [21];
      break;

    case 'carlos_sainz':
      grid = 4; finish = 2; points = 18;
      strategy = [
        { compound: TyreCompound.MEDIUM, startLap: 1, endLap: 24, color: TYRE_COLORS.Medium },
        { compound: TyreCompound.HARD, startLap: 25, endLap: 52, color: TYRE_COLORS.Hard }
      ];
      pitLaps = [25];
      break;

    case 'lando_norris':
      grid = 6; finish = 2; points = 18;
      strategy = [
        { compound: TyreCompound.MEDIUM, startLap: 1, endLap: 28, color: TYRE_COLORS.Medium },
        { compound: TyreCompound.SOFT, startLap: 29, endLap: 52, color: TYRE_COLORS.Soft }
      ];
      pitLaps = [29];
      break;

    case 'oscar_piastri':
      grid = 7; finish = 8; points = 4;
      strategy = [
        { compound: TyreCompound.MEDIUM, startLap: 1, endLap: 22, color: TYRE_COLORS.Medium },
        { compound: TyreCompound.HARD, startLap: 23, endLap: 52, color: TYRE_COLORS.Hard }
      ];
      pitLaps = [23];
      break;

    case 'fernando_alonso':
      grid = 9; finish = 6; points = 8;
      strategy = [
        { compound: TyreCompound.HARD, startLap: 1, endLap: 30, color: TYRE_COLORS.Hard },
        { compound: TyreCompound.MEDIUM, startLap: 31, endLap: 52, color: TYRE_COLORS.Medium }
      ];
      pitLaps = [31];
      break;

    default:
      grid = 15; finish = 15; points = 0;
  }

  return {
    driverId,
    raceId,
    gridPosition: grid,
    finishPosition: finish,
    status,
    points,
    tyreStrategy: strategy,
    telemetry: generateTelemetry(grid, finish, totalLaps, pitLaps)
  };
};

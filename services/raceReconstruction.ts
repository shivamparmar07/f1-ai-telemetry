/**
 * Race Reconstruction Engine
 * Fuses disparate OpenF1 streams (laps, positions, intervals, pit stops, stints, race control)
 * into a chronologically consistent, multi-driver race timeline with overtaking detection,
 * event correlation, and explicit missing-data tracking.
 */

import { TyreCompound } from '../types';
import {
  DataConfidence,
  DriverLapTimelinePoint,
  DriverGainStats,
  OvertakeEvent,
  PitEvent,
  ReconstructedRaceTimeline,
  TrackConditionEvent,
} from '../types/reconstruction';

export interface RawReconstructionInput {
  sessionKey: number;
  meetingKey?: number;
  drivers: any[];
  sessionResults: any[];
  startingGrid: any[];
  laps: any[];
  positions: any[];
  intervals?: any[];
  stints: any[];
  pitStops?: any[];
  raceControl?: any[];
}

/**
 * Format lap duration in seconds to "M:SS.mmm"
 */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds <= 0) {
    return 'MISSING';
  }
  const minutes = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(3);
  return `${minutes}:${secs.padStart(6, '0')}`;
}

/**
 * Format gap to leader
 */
export function formatGap(gap: number | null | undefined, isLeader: boolean): string {
  if (isLeader) return 'LEADER';
  if (gap === null || gap === undefined || isNaN(gap)) return 'MISSING';
  return `+${gap.toFixed(3)}s`;
}

/**
 * Convert string compound to TyreCompound enum
 */
export function parseTyreCompound(compoundStr: string | null | undefined): TyreCompound {
  if (!compoundStr) return TyreCompound.HARD;
  const upper = compoundStr.toUpperCase();
  if (upper.includes('SOFT')) return TyreCompound.SOFT;
  if (upper.includes('MEDIUM')) return TyreCompound.MEDIUM;
  if (upper.includes('HARD')) return TyreCompound.HARD;
  if (upper.includes('INTER')) return TyreCompound.INTER;
  if (upper.includes('WET')) return TyreCompound.WET;
  return TyreCompound.HARD;
}

/**
 * Normalize and reconstruct the full race timeline
 */
export function reconstructRace(input: RawReconstructionInput): ReconstructedRaceTimeline {
  const {
    sessionKey,
    meetingKey,
    drivers = [],
    sessionResults = [],
    startingGrid = [],
    laps = [],
    positions = [],
    intervals = [],
    stints = [],
    pitStops = [],
    raceControl = [],
  } = input;

  // 1. Build Driver Metadata Map & Grid Positions
  const driverMetaMap: Record<
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
      finalLap: number;
      dnf: boolean;
      dns: boolean;
      dsq: boolean;
    }
  > = {};

  // Index starting grid
  const gridMap = new Map<number, number>();
  startingGrid.forEach((g) => {
    if (g.driver_number !== undefined && g.position !== undefined) {
      gridMap.set(g.driver_number, g.position);
    }
  });

  // Index session results
  const resultMap = new Map<number, any>();
  let maxCompletedLaps = 0;
  sessionResults.forEach((res) => {
    if (res.driver_number !== undefined) {
      resultMap.set(res.driver_number, res);
      if (res.number_of_laps && res.number_of_laps > maxCompletedLaps) {
        maxCompletedLaps = res.number_of_laps;
      }
    }
  });

  // Also check max lap from laps array
  laps.forEach((l) => {
    if (l.lap_number && l.lap_number > maxCompletedLaps) {
      maxCompletedLaps = l.lap_number;
    }
  });

  const totalLaps = maxCompletedLaps > 0 ? maxCompletedLaps : 1;

  drivers.forEach((d) => {
    const num = d.driver_number;
    const res = resultMap.get(num);
    const gridPos = gridMap.get(num) ?? (res ? res.position : 20);

    const isDnf = res?.dnf ?? false;
    const isDns = res?.dns ?? false;
    const isDsq = res?.dsq ?? false;
    let status = 'Finished';
    if (isDnf) status = 'DNF';
    if (isDns) status = 'DNS';
    if (isDsq) status = 'DSQ';

    driverMetaMap[num] = {
      driverNumber: num,
      name: d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim() || `Driver #${num}`,
      broadcastName: d.broadcast_name || d.name_acronym || `#${num}`,
      team: d.team_name || 'F1 Team',
      teamColor: d.team_colour ? `#${d.team_colour}` : '#E10600',
      gridPosition: gridPos,
      finishPosition: res ? res.position : gridPos,
      status,
      finalLap: res?.number_of_laps ?? totalLaps,
      dnf: isDnf,
      dns: isDns,
      dsq: isDsq,
    };
  });

  // 2. Index Laps by (driverNumber, lapNumber)
  const lapsMap = new Map<string, any>();
  laps.forEach((lap) => {
    if (lap.driver_number !== undefined && lap.lap_number !== undefined) {
      const key = `${lap.driver_number}_${lap.lap_number}`;
      lapsMap.set(key, lap);
    }
  });

  // 3. Index Stints by driver
  const driverStintsMap = new Map<number, any[]>();
  stints.forEach((stint) => {
    if (stint.driver_number !== undefined) {
      if (!driverStintsMap.has(stint.driver_number)) {
        driverStintsMap.set(stint.driver_number, []);
      }
      driverStintsMap.get(stint.driver_number)!.push(stint);
    }
  });

  // Sort stints per driver by stint_number or lap_start
  driverStintsMap.forEach((stintList) => {
    stintList.sort((a, b) => (a.stint_number ?? a.lap_start) - (b.stint_number ?? b.lap_start));
  });

  // 4. Index Pit Stops
  const pitStopsByDriverAndLap = new Map<string, any>();
  const pitStopsByLap = new Map<number, PitEvent[]>();

  pitStops.forEach((p) => {
    if (p.driver_number !== undefined && p.lap_number !== undefined) {
      const key = `${p.driver_number}_${p.lap_number}`;
      pitStopsByDriverAndLap.set(key, p);

      const driverStints = driverStintsMap.get(p.driver_number) || [];
      // Find stint transition
      let compoundBefore = TyreCompound.HARD;
      let compoundAfter = TyreCompound.HARD;
      let tyreAgeBefore = 0;

      for (let i = 0; i < driverStints.length; i++) {
        const s = driverStints[i];
        if (p.lap_number >= s.lap_start && p.lap_number <= s.lap_end) {
          compoundBefore = parseTyreCompound(s.compound);
          tyreAgeBefore = (s.tyre_age_at_start || 0) + (p.lap_number - s.lap_start);
          if (driverStints[i + 1]) {
            compoundAfter = parseTyreCompound(driverStints[i + 1].compound);
          } else {
            compoundAfter = compoundBefore;
          }
          break;
        }
      }

      const event: PitEvent = {
        driverNumber: p.driver_number,
        lapNumber: p.lap_number,
        timestamp: p.date || '',
        pitDuration: typeof p.pit_duration === 'number' ? p.pit_duration : null,
        stopDuration: typeof p.stop_duration === 'number' ? p.stop_duration : null,
        compoundBefore,
        compoundAfter,
        tyreAgeBefore,
      };

      if (!pitStopsByLap.has(p.lap_number)) {
        pitStopsByLap.set(p.lap_number, []);
      }
      pitStopsByLap.get(p.lap_number)!.push(event);
    }
  });

  // 5. Index Position Samples chronologically
  const sortedPositions = [...positions].sort((a, b) => {
    const tA = a.date ? new Date(a.date).getTime() : 0;
    const tB = b.date ? new Date(b.date).getTime() : 0;
    return tA - tB;
  });

  // Group positions by driver
  const driverPositionsMap = new Map<number, any[]>();
  sortedPositions.forEach((pos) => {
    if (pos.driver_number !== undefined) {
      if (!driverPositionsMap.has(pos.driver_number)) {
        driverPositionsMap.set(pos.driver_number, []);
      }
      driverPositionsMap.get(pos.driver_number)!.push(pos);
    }
  });

  // 6. Index Intervals chronologically by driver and lap
  const intervalsByDriverAndLap = new Map<string, { gapToLeader: number; interval: number }>();
  intervals.forEach((inv) => {
    if (inv.driver_number !== undefined && inv.date) {
      // Look for explicit gap_to_leader or interval
      const gap = typeof inv.gap_to_leader === 'number' ? inv.gap_to_leader : parseFloat(inv.gap_to_leader);
      const intervalVal = typeof inv.interval === 'number' ? inv.interval : parseFloat(inv.interval);

      if (!isNaN(gap)) {
        // Will be matched temporally or per lap
        const key = `${inv.driver_number}_${inv.lap_number ?? ''}`;
        intervalsByDriverAndLap.set(key, {
          gapToLeader: gap,
          interval: !isNaN(intervalVal) ? intervalVal : 0,
        });
      }
    }
  });

  // 7. Parse Race Control Events
  const raceControlEventsByLap = new Map<number, TrackConditionEvent[]>();
  raceControl.forEach((rc) => {
    let flagStatus: TrackConditionEvent['status'] = 'GREEN';
    const flag = (rc.flag || '').toUpperCase();
    const category = rc.category || 'Other';
    const msg = rc.message || '';
    const upperMsg = msg.toUpperCase();

    if (upperMsg.includes('VIRTUAL SAFETY CAR') || upperMsg.includes('VSC')) {
      flagStatus = 'VSC';
    } else if (category === 'SafetyCar' || upperMsg.includes('SAFETY CAR') || upperMsg.includes('SC DEPLOYED')) {
      flagStatus = 'SC';
    } else if (flag === 'RED' || upperMsg.includes('RED FLAG')) {
      flagStatus = 'RED';
    } else if (flag === 'CHEQUERED' || upperMsg.includes('CHEQUERED')) {
      flagStatus = 'CHEQUERED';
    } else if (flag === 'DOUBLE YELLOW' || upperMsg.includes('DOUBLE YELLOW')) {
      flagStatus = 'DOUBLE_YELLOW';
    } else if (flag === 'YELLOW' || upperMsg.includes('YELLOW')) {
      flagStatus = 'YELLOW';
    } else if (flag === 'GREEN' || upperMsg.includes('TRACK CLEAR')) {
      flagStatus = 'GREEN';
    }

    const eventLap = rc.lap_number || rc.lap || 1;
    const trackEvt: TrackConditionEvent = {
      lap: eventLap,
      timestamp: rc.date || '',
      category,
      status: flagStatus,
      message: msg,
      scope: rc.scope,
      driverNumber: rc.driver_number,
    };

    if (!raceControlEventsByLap.has(eventLap)) {
      raceControlEventsByLap.set(eventLap, []);
    }
    raceControlEventsByLap.get(eventLap)!.push(trackEvt);
  });

  // 8. Reconstruct Lap by Lap Timeline
  const reconstructedLaps: ReconstructedRaceTimeline['laps'] = [];
  let prevLapPositions: Map<number, number> = new Map();

  // Initialize previous positions with starting grid
  Object.values(driverMetaMap).forEach((d) => {
    prevLapPositions.set(d.driverNumber, d.gridPosition);
  });

  // Quality metrics counters
  let totalPointsCount = 0;
  let measuredCount = 0;
  let interpolatedCount = 0;
  let missingCount = 0;

  for (let lapNum = 1; lapNum <= totalLaps; lapNum++) {
    const currentLapDriverStates: Record<number, DriverLapTimelinePoint> = {};
    const lapOvertakes: OvertakeEvent[] = [];
    const lapTrackEvents = raceControlEventsByLap.get(lapNum) || [];
    const lapPitStops = pitStopsByLap.get(lapNum) || [];

    // Track active drivers in this lap to determine leader and calculate intervals
    const activeDriverList: Array<{ driverNumber: number; position: number }> = [];

    // Process each driver for this lap
    Object.keys(driverMetaMap).forEach((driverNumStr) => {
      const driverNum = parseInt(driverNumStr, 10);
      const meta = driverMetaMap[driverNum];
      const missingFields: string[] = [];

      totalPointsCount++;

      // Check if driver retired before this lap
      if (meta.dnf && lapNum > meta.finalLap) {
        currentLapDriverStates[driverNum] = {
          driverNumber: driverNum,
          lapNumber: lapNum,
          position: null,
          positionConfidence: 'MISSING',
          lapDuration: null,
          lapDurationFormatted: 'RETIRED',
          gapToLeader: null,
          gapToLeaderFormatted: 'RETIRED',
          intervalToAhead: null,
          intervalFormatted: 'RETIRED',
          compound: TyreCompound.HARD,
          tyreAge: 0,
          isPitLap: false,
          status: 'RETIRED',
          missingFields: ['position', 'lapDuration', 'gapToLeader'],
        };
        missingCount++;
        return;
      }

      // Check if driver DNS
      if (meta.dns) {
        currentLapDriverStates[driverNum] = {
          driverNumber: driverNum,
          lapNumber: lapNum,
          position: null,
          positionConfidence: 'MISSING',
          lapDuration: null,
          lapDurationFormatted: 'DNS',
          gapToLeader: null,
          gapToLeaderFormatted: 'DNS',
          intervalToAhead: null,
          intervalFormatted: 'DNS',
          compound: TyreCompound.HARD,
          tyreAge: 0,
          isPitLap: false,
          status: 'DNS',
          missingFields: ['position', 'lapDuration', 'gapToLeader'],
        };
        missingCount++;
        return;
      }

      // Find lap data
      const lapKey = `${driverNum}_${lapNum}`;
      const lapData = lapsMap.get(lapKey);
      const isPitLap = lapData?.is_pit_out_lap ?? pitStopsByDriverAndLap.has(lapKey);

      // Determine Compound & Tyre Age
      const driverStints = driverStintsMap.get(driverNum) || [];
      let currentCompound = TyreCompound.HARD;
      let currentTyreAge = lapNum;

      for (const s of driverStints) {
        if (lapNum >= s.lap_start && (s.lap_end === null || s.lap_end === undefined || lapNum <= s.lap_end)) {
          currentCompound = parseTyreCompound(s.compound);
          currentTyreAge = (s.tyre_age_at_start || 0) + (lapNum - s.lap_start);
          break;
        }
      }

      // Determine Position & Confidence
      let position: number | null = null;
      let confidence: DataConfidence = 'MEASURED';

      // Method A: Check explicit position in lap record if present
      if (lapData?.position !== undefined && lapData?.position !== null) {
        position = lapData.position;
      } else {
        // Method B: Find closest position sample in driver positions
        const dPositions = driverPositionsMap.get(driverNum) || [];
        if (lapData?.date_start && dPositions.length > 0) {
          const lapStartTime = new Date(lapData.date_start).getTime();
          for (let i = dPositions.length - 1; i >= 0; i--) {
            const pTime = new Date(dPositions[i].date).getTime();
            if (pTime <= lapStartTime + 5000) {
              position = dPositions[i].position;
              break;
            }
          }
        }

        // Method C: Check position samples matching lap_number
        if (position === null) {
          const matchedPos = dPositions.find((p) => p.lap_number === lapNum);
          if (matchedPos && matchedPos.position !== undefined) {
            position = matchedPos.position;
          }
        }
      }

      // Method D: Interpolate from previous known position
      if (position === null) {
        const prev = prevLapPositions.get(driverNum);
        if (prev !== undefined) {
          position = prev;
          confidence = 'INTERPOLATED';
          interpolatedCount++;
        } else {
          position = meta.gridPosition;
          confidence = 'MISSING';
          missingFields.push('position');
          missingCount++;
        }
      } else {
        measuredCount++;
      }

      // Pit Stop Duration if applicable
      const pitRecord = pitStopsByDriverAndLap.get(lapKey);
      const pitStopDuration = pitRecord?.stop_duration ?? null;
      const pitLaneDuration = pitRecord?.pit_duration ?? null;

      // Lap Duration
      const lapDuration = lapData?.lap_duration ?? null;
      if (lapDuration === null) {
        missingFields.push('lapDuration');
      }

      // Gap to leader
      let gapToLeader: number | null = null;
      if (position === 1) {
        gapToLeader = 0;
      } else {
        const inv = intervalsByDriverAndLap.get(lapKey);
        if (inv) {
          gapToLeader = inv.gapToLeader;
        } else if (lapData?.gap_to_leader !== undefined) {
          gapToLeader = typeof lapData.gap_to_leader === 'number' ? lapData.gap_to_leader : parseFloat(lapData.gap_to_leader);
        }
      }

      if (gapToLeader === null && position !== 1) {
        missingFields.push('gapToLeader');
      }

      let status: DriverLapTimelinePoint['status'] = 'RUNNING';
      if (isPitLap) status = 'OUT_LAP';

      currentLapDriverStates[driverNum] = {
        driverNumber: driverNum,
        lapNumber: lapNum,
        position,
        positionConfidence: confidence,
        lapDuration,
        lapDurationFormatted: formatLapTime(lapDuration),
        gapToLeader,
        gapToLeaderFormatted: formatGap(gapToLeader, position === 1),
        intervalToAhead: null, // calculated in second pass below
        intervalFormatted: '0.000s',
        compound: currentCompound,
        tyreAge: currentTyreAge,
        isPitLap,
        pitStopDuration,
        pitLaneDuration,
        status,
        missingFields,
      };

      if (position !== null) {
        activeDriverList.push({ driverNumber: driverNum, position });
      }
    });

    // Sort active drivers by position to calculate intervals and detect leader
    activeDriverList.sort((a, b) => a.position - b.position);
    const leaderDriverNumber = activeDriverList.length > 0 ? activeDriverList[0].driverNumber : null;

    // Calculate interval to ahead
    for (let i = 0; i < activeDriverList.length; i++) {
      const curDriverNum = activeDriverList[i].driverNumber;
      const curState = currentLapDriverStates[curDriverNum];

      if (i === 0) {
        curState.intervalToAhead = 0;
        curState.intervalFormatted = 'LEADER';
      } else {
        const aheadDriverNum = activeDriverList[i - 1].driverNumber;
        const aheadState = currentLapDriverStates[aheadDriverNum];

        if (curState.gapToLeader !== null && aheadState.gapToLeader !== null) {
          const delta = Math.max(0, curState.gapToLeader - aheadState.gapToLeader);
          curState.intervalToAhead = Math.round(delta * 1000) / 1000;
          curState.intervalFormatted = `+${curState.intervalToAhead.toFixed(3)}s`;
        } else {
          curState.intervalToAhead = null;
          curState.intervalFormatted = 'MISSING';
        }
      }
    }

    // 9. Overtaking Detection
    // Compare positions between prevLapPositions and currentLapDriverStates
    const currentPositions = new Map<number, number>();
    Object.values(currentLapDriverStates).forEach((state) => {
      if (state.position !== null && state.status !== 'RETIRED' && state.status !== 'DNS') {
        currentPositions.set(state.driverNumber, state.position);
      }
    });

    // Check all pairs of active drivers
    const activeDriverNums = Array.from(currentPositions.keys());
    for (let i = 0; i < activeDriverNums.length; i++) {
      for (let j = i + 1; j < activeDriverNums.length; j++) {
        const d1 = activeDriverNums[i];
        const d2 = activeDriverNums[j];

        const prevPos1 = prevLapPositions.get(d1);
        const prevPos2 = prevLapPositions.get(d2);
        const currPos1 = currentPositions.get(d1)!;
        const currPos2 = currentPositions.get(d2)!;

        if (prevPos1 !== undefined && prevPos2 !== undefined) {
          let overtaking: number | null = null;
          let overtaken: number | null = null;
          let fromPos = 0;
          let toPos = 0;

          // d1 overtook d2: was behind (prevPos1 > prevPos2), now ahead (currPos1 < currPos2)
          if (prevPos1 > prevPos2 && currPos1 < currPos2) {
            overtaking = d1;
            overtaken = d2;
            fromPos = prevPos1;
            toPos = currPos1;
          } else if (prevPos2 > prevPos1 && currPos2 < currPos1) {
            // d2 overtook d1
            overtaking = d2;
            overtaken = d1;
            fromPos = prevPos2;
            toPos = currPos2;
          }

          if (overtaking !== null && overtaken !== null) {
            const overtakenPitted = currentLapDriverStates[overtaken]?.isPitLap;
            const overtakenRetired = currentLapDriverStates[overtaken]?.status === 'RETIRED';

            let type: OvertakeEvent['type'] = 'ON_TRACK';
            let context = 'On-track overtake';

            if (overtakenRetired) {
              type = 'RETIREMENT_GAIN';
              context = `Gained position due to retirement of #${overtaken}`;
            } else if (overtakenPitted) {
              type = 'PIT_OVERTAKE';
              context = `Gained position while #${overtaken} was in pit lane`;
            }

            // Check if active Safety Car or Yellow Flag occurred
            const scEvent = lapTrackEvents.find((e) => e.status === 'SC' || e.status === 'VSC');
            if (scEvent) {
              context += ` (${scEvent.status} active)`;
            }

            lapOvertakes.push({
              lap: lapNum,
              overtakingDriverNumber: overtaking,
              overtakenDriverNumber: overtaken,
              fromPosition: fromPos,
              toPosition: toPos,
              type,
              contextMessage: context,
            });
          }
        }
      }
    }

    // Save current positions for next lap comparison
    prevLapPositions = currentPositions;

    reconstructedLaps.push({
      lapNumber: lapNum,
      leaderDriverNumber,
      driverStates: currentLapDriverStates,
      trackEvents: lapTrackEvents,
      overtakes: lapOvertakes,
      pitStops: lapPitStops,
    });
  }

  // 10. Compute Aggregate Position Gain and Overtaking Statistics
  const driverGainStats: DriverGainStats[] = Object.values(driverMetaMap).map((driver) => {
    const num = driver.driverNumber;
    const gridPos = driver.gridPosition;
    const finishPos = driver.finishPosition;
    const netGain = gridPos - finishPos; // positive = gained places, negative = dropped

    let overtakesCompleted = 0;
    let timesOvertaken = 0;

    reconstructedLaps.forEach((lap) => {
      lap.overtakes.forEach((o) => {
        if (o.overtakingDriverNumber === num) overtakesCompleted++;
        if (o.overtakenDriverNumber === num) timesOvertaken++;
      });
    });

    // Clean lap pace calculation (exclude pit in/out laps, exclude yellow/SC laps)
    const cleanLaps: number[] = [];
    reconstructedLaps.forEach((lap) => {
      const state = lap.driverStates[num];
      const hasNeutralization = lap.trackEvents.some(
        (e) => e.status === 'SC' || e.status === 'VSC' || e.status === 'RED'
      );

      if (
        state &&
        state.lapDuration &&
        state.lapDuration > 0 &&
        !state.isPitLap &&
        !hasNeutralization &&
        state.status === 'RUNNING'
      ) {
        cleanLaps.push(state.lapDuration);
      }
    });

    const cleanPaceAvgSeconds =
      cleanLaps.length > 0
        ? Math.round((cleanLaps.reduce((a, b) => a + b, 0) / cleanLaps.length) * 1000) / 1000
        : null;

    return {
      driverNumber: num,
      driverName: driver.name,
      team: driver.team,
      teamColor: driver.teamColor,
      gridPosition: gridPos,
      finishPosition: finishPos,
      netGain,
      overtakesCompleted,
      timesOvertaken,
      cleanPaceAvgSeconds,
    };
  });

  // Sort gain stats by finish position
  driverGainStats.sort((a, b) => a.finishPosition - b.finishPosition);

  const measuredPercentage =
    totalPointsCount > 0 ? Math.round((measuredCount / totalPointsCount) * 1000) / 10 : 100;

  return {
    sessionKey,
    meetingKey,
    totalLaps,
    drivers: driverMetaMap,
    laps: reconstructedLaps,
    driverGainStats,
    dataQualityAudit: {
      totalPoints: totalPointsCount,
      measuredCount,
      interpolatedCount,
      missingCount,
      measuredPercentage,
    },
  };
}

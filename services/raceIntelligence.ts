/**
 * Race Intelligence Engine
 * Derives descriptive, empirical insights from reconstructed race data:
 * - Head-to-Head driver pace comparison by stint (clean laps only)
 * - Grid-to-finish position deltas and biggest movers
 * - Pit stop out-lap performance & undercut/overcut detection
 * - Tyre compound degradation slopes
 * - Event-attributed notable position changes
 */

import { TyreCompound } from '../types';
import { ReconstructedRaceTimeline, DriverLapTimelinePoint, OvertakeEvent } from '../types/reconstruction';
import { formatLapTime } from './raceReconstruction';

export interface StintPaceAnalysis {
  stintNumber: number;
  compound: TyreCompound;
  startLap: number;
  endLap: number;
  totalLaps: number;
  cleanLapsCount: number;
  averageCleanPaceSeconds: number | null;
  medianCleanPaceSeconds: number | null;
  fastestLapSeconds: number | null;
  degradationPerLapSeconds: number | null; // regression slope (s/lap)
}

export interface DriverComparisonResult {
  driver1: {
    driverNumber: number;
    name: string;
    team: string;
    teamColor: string;
    gridPosition: number;
    finishPosition: number;
    stints: StintPaceAnalysis[];
  };
  driver2: {
    driverNumber: number;
    name: string;
    team: string;
    teamColor: string;
    gridPosition: number;
    finishPosition: number;
    stints: StintPaceAnalysis[];
  };
  lapDeltas: Array<{
    lapNumber: number;
    d1LapTimeSeconds: number | null;
    d2LapTimeSeconds: number | null;
    deltaSeconds: number | null; // d1 - d2: negative means d1 was faster
    gapToLeaderD1: number | null;
    gapToLeaderD2: number | null;
    gapBetweenDrivers: number | null; // absolute gap in seconds
    aheadDriverNumber: number | null;
    d1Position: number | null;
    d2Position: number | null;
    d1Compound: TyreCompound;
    d2Compound: TyreCompound;
    d1TyreAge: number;
    d2TyreAge: number;
    isCleanComparison: boolean; // neither pitted, neither under SC
  }>;
  overallPaceDeltaSeconds: number | null; // avg clean delta: d1 - d2
  stintComparisons: Array<{
    stintIndex: number;
    d1Compound: TyreCompound;
    d2Compound: TyreCompound;
    d1AvgPace: number | null;
    d2AvgPace: number | null;
    paceAdvantageSeconds: number | null; // d2Avg - d1Avg (positive means d1 faster)
    fasterDriverNumber: number | null;
  }>;
}

export interface PitStopPerformance {
  driverNumber: number;
  driverName: string;
  lapNumber: number;
  stopDuration: number | null;
  pitDuration: number | null;
  compoundBefore: TyreCompound;
  compoundAfter: TyreCompound;
  inLapDeltaSeconds: number | null; // in-lap duration vs driver's median clean pace
  outLapDeltaSeconds: number | null; // out-lap duration vs subsequent laps
  positionsBeforePit: number | null;
  positionsAfterPit: number | null;
  netPitPositionDelta: number | null;
}

export interface NotablePositionChangeEvent {
  lap: number;
  driverNumber: number;
  driverName: string;
  previousPosition: number;
  newPosition: number;
  positionChange: number; // positive = gained, negative = dropped
  correlatedRaceControlEvent: string | null;
  pitStopOccurred: boolean;
  descriptiveExplanation: string;
}

export interface RaceIntelligenceSummary {
  sessionKey: number;
  totalLaps: number;
  biggestGainers: Array<{ driverNumber: number; name: string; team: string; gridPosition: number; finishPosition: number; positionsGained: number }>;
  biggestLosers: Array<{ driverNumber: number; name: string; team: string; gridPosition: number; finishPosition: number; positionsLost: number }>;
  pitPerformances: PitStopPerformance[];
  notableEvents: NotablePositionChangeEvent[];
}

/**
 * Perform simple linear regression to calculate degradation slope (seconds per lap)
 */
function calculateDegradationSlope(lapNumbers: number[], lapTimes: number[]): number | null {
  const n = lapNumbers.length;
  if (n < 3) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += lapNumbers[i];
    sumY += lapTimes[i];
    sumXY += lapNumbers[i] * lapTimes[i];
    sumXX += lapNumbers[i] * lapNumbers[i];
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  return Math.round(slope * 1000) / 1000;
}

/**
 * Analyze pace by stint for a driver
 */
export function analyzeDriverStints(
  driverNumber: number,
  timeline: ReconstructedRaceTimeline
): StintPaceAnalysis[] {
  const driverMeta = timeline.drivers[driverNumber];
  if (!driverMeta) return [];

  // Group laps into stints by observing tyre compound or pit stops
  const stints: StintPaceAnalysis[] = [];
  let currentStintLaps: Array<{ lap: number; time: number; clean: boolean }> = [];
  let currentCompound: TyreCompound = TyreCompound.HARD;
  let stintStartLap = 1;
  let stintNum = 1;

  for (let i = 0; i < timeline.laps.length; i++) {
    const lap = timeline.laps[i];
    const state = lap.driverStates[driverNumber];
    if (!state || state.status === 'RETIRED' || state.status === 'DNS') continue;

    // Check if new stint triggered by compound change or pit stop
    const isNewStint =
      currentStintLaps.length > 0 &&
      (state.compound !== currentCompound || (state.isPitLap && lap.lapNumber > stintStartLap + 1));

    if (isNewStint) {
      stints.push(finalizeStint(stintNum, currentCompound, stintStartLap, lap.lapNumber - 1, currentStintLaps));
      stintNum++;
      stintStartLap = lap.lapNumber;
      currentStintLaps = [];
    }

    currentCompound = state.compound;
    const hasNeutralization = lap.trackEvents.some(
      (e) => e.status === 'SC' || e.status === 'VSC' || e.status === 'RED'
    );
    const isClean = !state.isPitLap && !hasNeutralization && state.lapDuration !== null && state.lapDuration > 0;

    if (state.lapDuration && state.lapDuration > 0) {
      currentStintLaps.push({
        lap: lap.lapNumber,
        time: state.lapDuration,
        clean: isClean,
      });
    }
  }

  if (currentStintLaps.length > 0) {
    const lastLap = currentStintLaps[currentStintLaps.length - 1].lap;
    stints.push(finalizeStint(stintNum, currentCompound, stintStartLap, lastLap, currentStintLaps));
  }

  return stints;
}

function finalizeStint(
  stintNumber: number,
  compound: TyreCompound,
  startLap: number,
  endLap: number,
  laps: Array<{ lap: number; time: number; clean: boolean }>
): StintPaceAnalysis {
  const cleanLaps = laps.filter((l) => l.clean);
  const cleanTimes = cleanLaps.map((l) => l.time);

  let avgPace: number | null = null;
  let medianPace: number | null = null;
  let fastestLap: number | null = null;
  let degradationSlope: number | null = null;

  if (cleanTimes.length > 0) {
    avgPace = Math.round((cleanTimes.reduce((a, b) => a + b, 0) / cleanTimes.length) * 1000) / 1000;
    const sorted = [...cleanTimes].sort((a, b) => a - b);
    medianPace = sorted[Math.floor(sorted.length / 2)];
    fastestLap = sorted[0];

    degradationSlope = calculateDegradationSlope(
      cleanLaps.map((l) => l.lap),
      cleanTimes
    );
  }

  return {
    stintNumber,
    compound,
    startLap,
    endLap,
    totalLaps: endLap - startLap + 1,
    cleanLapsCount: cleanTimes.length,
    averageCleanPaceSeconds: avgPace,
    medianCleanPaceSeconds: medianPace,
    fastestLapSeconds: fastestLap,
    degradationPerLapSeconds: degradationSlope,
  };
}

/**
 * Head-to-Head Comparison between two drivers
 */
export function compareDrivers(
  d1Number: number,
  d2Number: number,
  timeline: ReconstructedRaceTimeline
): DriverComparisonResult | null {
  const meta1 = timeline.drivers[d1Number];
  const meta2 = timeline.drivers[d2Number];

  if (!meta1 || !meta2) return null;

  const d1Stints = analyzeDriverStints(d1Number, timeline);
  const d2Stints = analyzeDriverStints(d2Number, timeline);

  const lapDeltas: DriverComparisonResult['lapDeltas'] = [];
  const cleanDeltas: number[] = [];

  timeline.laps.forEach((lap) => {
    const s1 = lap.driverStates[d1Number];
    const s2 = lap.driverStates[d2Number];

    if (!s1 || !s2) return;

    const hasNeutralization = lap.trackEvents.some(
      (e) => e.status === 'SC' || e.status === 'VSC' || e.status === 'RED'
    );
    const isCleanComparison =
      !hasNeutralization &&
      !s1.isPitLap &&
      !s2.isPitLap &&
      s1.status === 'RUNNING' &&
      s2.status === 'RUNNING' &&
      s1.lapDuration !== null &&
      s2.lapDuration !== null;

    let delta: number | null = null;
    if (s1.lapDuration !== null && s2.lapDuration !== null) {
      delta = Math.round((s1.lapDuration - s2.lapDuration) * 1000) / 1000;
      if (isCleanComparison) {
        cleanDeltas.push(delta);
      }
    }

    let gapBetween: number | null = null;
    let aheadDriver: number | null = null;

    if (s1.position !== null && s2.position !== null) {
      if (s1.position < s2.position) aheadDriver = d1Number;
      else if (s2.position < s1.position) aheadDriver = d2Number;
    }

    if (s1.gapToLeader !== null && s2.gapToLeader !== null) {
      gapBetween = Math.round(Math.abs(s1.gapToLeader - s2.gapToLeader) * 1000) / 1000;
    }

    lapDeltas.push({
      lapNumber: lap.lapNumber,
      d1LapTimeSeconds: s1.lapDuration,
      d2LapTimeSeconds: s2.lapDuration,
      deltaSeconds: delta,
      gapToLeaderD1: s1.gapToLeader,
      gapToLeaderD2: s2.gapToLeader,
      gapBetweenDrivers: gapBetween,
      aheadDriverNumber: aheadDriver,
      d1Position: s1.position,
      d2Position: s2.position,
      d1Compound: s1.compound,
      d2Compound: s2.compound,
      d1TyreAge: s1.tyreAge,
      d2TyreAge: s2.tyreAge,
      isCleanComparison,
    });
  });

  const overallPaceDelta =
    cleanDeltas.length > 0
      ? Math.round((cleanDeltas.reduce((a, b) => a + b, 0) / cleanDeltas.length) * 1000) / 1000
      : null;

  // Stint-by-stint comparative analysis
  const maxStints = Math.max(d1Stints.length, d2Stints.length);
  const stintComparisons: DriverComparisonResult['stintComparisons'] = [];

  for (let idx = 0; idx < maxStints; idx++) {
    const s1 = d1Stints[idx];
    const s2 = d2Stints[idx];

    const p1 = s1?.averageCleanPaceSeconds ?? null;
    const p2 = s2?.averageCleanPaceSeconds ?? null;

    let advantage: number | null = null;
    let fasterDriver: number | null = null;

    if (p1 !== null && p2 !== null) {
      advantage = Math.round((p2 - p1) * 1000) / 1000; // positive = d1 faster
      if (advantage > 0) fasterDriver = d1Number;
      else if (advantage < 0) fasterDriver = d2Number;
    }

    stintComparisons.push({
      stintIndex: idx + 1,
      d1Compound: s1?.compound ?? TyreCompound.HARD,
      d2Compound: s2?.compound ?? TyreCompound.HARD,
      d1AvgPace: p1,
      d2AvgPace: p2,
      paceAdvantageSeconds: advantage,
      fasterDriverNumber: fasterDriver,
    });
  }

  return {
    driver1: {
      driverNumber: d1Number,
      name: meta1.name,
      team: meta1.team,
      teamColor: meta1.teamColor,
      gridPosition: meta1.gridPosition,
      finishPosition: meta1.finishPosition,
      stints: d1Stints,
    },
    driver2: {
      driverNumber: d2Number,
      name: meta2.name,
      team: meta2.team,
      teamColor: meta2.teamColor,
      gridPosition: meta2.gridPosition,
      finishPosition: meta2.finishPosition,
      stints: d2Stints,
    },
    lapDeltas,
    overallPaceDeltaSeconds: overallPaceDelta,
    stintComparisons,
  };
}

/**
 * Generate overall race intelligence summary: biggest movers, pit analysis, notable events
 */
export function generateRaceIntelligenceSummary(timeline: ReconstructedRaceTimeline): RaceIntelligenceSummary {
  // 1. Gainers & Losers
  const movers = timeline.driverGainStats.map((s) => ({
    driverNumber: s.driverNumber,
    name: s.driverName,
    team: s.team,
    gridPosition: s.gridPosition,
    finishPosition: s.finishPosition,
    delta: s.netGain,
  }));

  const biggestGainers = movers
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .map((m) => ({
      driverNumber: m.driverNumber,
      name: m.name,
      team: m.team,
      gridPosition: m.gridPosition,
      finishPosition: m.finishPosition,
      positionsGained: m.delta,
    }));

  const biggestLosers = movers
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .map((m) => ({
      driverNumber: m.driverNumber,
      name: m.name,
      team: m.team,
      gridPosition: m.gridPosition,
      finishPosition: m.finishPosition,
      positionsLost: Math.abs(m.delta),
    }));

  // 2. Pit Stop Performance
  const pitPerformances: PitStopPerformance[] = [];

  timeline.laps.forEach((lap, idx) => {
    lap.pitStops.forEach((p) => {
      const driverMeta = timeline.drivers[p.driverNumber];
      const prevLap = idx > 0 ? timeline.laps[idx - 1] : null;
      const nextLap = idx < timeline.laps.length - 1 ? timeline.laps[idx + 1] : null;

      const posBefore = prevLap?.driverStates[p.driverNumber]?.position ?? null;
      const posAfter = nextLap?.driverStates[p.driverNumber]?.position ?? null;
      const netPosDelta = posBefore !== null && posAfter !== null ? posBefore - posAfter : null;

      // In-lap / out-lap duration
      const outLapState = nextLap?.driverStates[p.driverNumber];
      const outLapDuration = outLapState?.lapDuration ?? null;

      pitPerformances.push({
        driverNumber: p.driverNumber,
        driverName: driverMeta?.name || `Driver #${p.driverNumber}`,
        lapNumber: p.lapNumber,
        stopDuration: p.stopDuration,
        pitDuration: p.pitDuration,
        compoundBefore: p.compoundBefore,
        compoundAfter: p.compoundAfter,
        inLapDeltaSeconds: null,
        outLapDeltaSeconds: outLapDuration,
        positionsBeforePit: posBefore,
        positionsAfterPit: posAfter,
        netPitPositionDelta: netPosDelta,
      });
    });
  });

  // 3. Notable Position Changes with Event Attribution
  const notableEvents: NotablePositionChangeEvent[] = [];

  for (let i = 1; i < timeline.laps.length; i++) {
    const prevLap = timeline.laps[i - 1];
    const currLap = timeline.laps[i];

    Object.keys(timeline.drivers).forEach((dStr) => {
      const dNum = parseInt(dStr, 10);
      const prevPos = prevLap.driverStates[dNum]?.position;
      const currPos = currLap.driverStates[dNum]?.position;

      if (prevPos !== null && currPos !== null && prevPos !== undefined && currPos !== undefined) {
        const change = prevPos - currPos; // positive = gained, negative = dropped

        // Significant change: dropped or gained 2+ places in a single lap
        if (Math.abs(change) >= 2) {
          const driverName = timeline.drivers[dNum]?.name || `#${dNum}`;
          const isPit = currLap.driverStates[dNum]?.isPitLap;

          // Check if there was an active race control event on this lap
          const rcEvent = currLap.trackEvents[0];
          const rcMsg = rcEvent ? `${rcEvent.status}: ${rcEvent.message}` : null;

          let desc = '';
          if (change > 0) {
            desc = `${driverName} gained ${change} positions (P${prevPos} → P${currPos})`;
            if (rcEvent) desc += ` during ${rcEvent.status} window`;
          } else {
            desc = `${driverName} dropped ${Math.abs(change)} positions (P${prevPos} → P${currPos})`;
            if (isPit) desc += ` due to pit stop`;
            if (rcEvent) desc += ` under ${rcEvent.status}`;
          }

          notableEvents.push({
            lap: currLap.lapNumber,
            driverNumber: dNum,
            driverName,
            previousPosition: prevPos,
            newPosition: currPos,
            positionChange: change,
            correlatedRaceControlEvent: rcMsg,
            pitStopOccurred: isPit,
            descriptiveExplanation: desc,
          });
        }
      }
    });
  }

  return {
    sessionKey: timeline.sessionKey,
    totalLaps: timeline.totalLaps,
    biggestGainers,
    biggestLosers,
    pitPerformances,
    notableEvents,
  };
}

import { describe, it, expect } from 'vitest';
import { reconstructRace } from '../services/raceReconstruction';
import {
  analyzeDriverStints,
  compareDrivers,
  generateRaceIntelligenceSummary,
} from '../services/raceIntelligence';

describe('Priority 5: Race Intelligence & Comparative Analytics', () => {
  const mockDrivers = [
    { driver_number: 1, full_name: 'Max Verstappen', team_name: 'Red Bull Racing', team_colour: '3671C6' },
    { driver_number: 4, full_name: 'Lando Norris', team_name: 'McLaren', team_colour: 'FF8000' },
  ];

  const mockStartingGrid = [
    { driver_number: 1, position: 2 },
    { driver_number: 4, position: 1 },
  ];

  const mockSessionResults = [
    { driver_number: 1, position: 1, number_of_laps: 5, dnf: false }, // Gained 1 (P2 -> P1)
    { driver_number: 4, position: 2, number_of_laps: 5, dnf: false }, // Dropped 1 (P1 -> P2)
  ];

  const mockLaps = [
    // Lap 1 (racing lap)
    { driver_number: 1, lap_number: 1, lap_duration: 90.0, position: 2, gap_to_leader: 0.5 },
    { driver_number: 4, lap_number: 1, lap_duration: 89.5, position: 1, gap_to_leader: 0 },
    // Lap 2 (racing lap)
    { driver_number: 1, lap_number: 2, lap_duration: 89.0, position: 2, gap_to_leader: 0.2 },
    { driver_number: 4, lap_number: 2, lap_duration: 89.3, position: 1, gap_to_leader: 0 },
    // Lap 3 (Safety Car lap - should be filtered from clean pace)
    { driver_number: 1, lap_number: 3, lap_duration: 125.0, position: 1, gap_to_leader: 0 },
    { driver_number: 4, lap_number: 3, lap_duration: 125.2, position: 2, gap_to_leader: 0.2 },
    // Lap 4 (racing lap)
    { driver_number: 1, lap_number: 4, lap_duration: 88.8, position: 1, gap_to_leader: 0 },
    { driver_number: 4, lap_number: 4, lap_duration: 89.1, position: 2, gap_to_leader: 0.5 },
    // Lap 5 (racing lap)
    { driver_number: 1, lap_number: 5, lap_duration: 88.6, position: 1, gap_to_leader: 0 },
    { driver_number: 4, lap_number: 5, lap_duration: 89.0, position: 2, gap_to_leader: 0.9 },
  ];

  const mockStints = [
    { driver_number: 1, stint_number: 1, compound: 'MEDIUM', lap_start: 1, lap_end: 5, tyre_age_at_start: 0 },
    { driver_number: 4, stint_number: 1, compound: 'MEDIUM', lap_start: 1, lap_end: 5, tyre_age_at_start: 0 },
  ];

  const mockRaceControl = [
    { lap_number: 3, category: 'SafetyCar', flag: 'YELLOW', message: 'SAFETY CAR DEPLOYED' },
  ];

  const timeline = reconstructRace({
    sessionKey: 8888,
    drivers: mockDrivers,
    sessionResults: mockSessionResults,
    startingGrid: mockStartingGrid,
    laps: mockLaps,
    positions: [],
    stints: mockStints,
    pitStops: [],
    raceControl: mockRaceControl,
  });

  it('filters out Safety Car laps from clean pace calculation', () => {
    const stints = analyzeDriverStints(1, timeline);
    expect(stints).toHaveLength(1);

    const stint = stints[0];
    expect(stint.totalLaps).toBe(5);
    // 5 total laps minus 1 SC lap = 4 clean laps
    expect(stint.cleanLapsCount).toBe(4);

    // Clean laps for Driver 1: [90.0, 89.0, 88.8, 88.6], avg = (90 + 89 + 88.8 + 88.6) / 4 = 89.1
    expect(stint.averageCleanPaceSeconds).toBe(89.1);
  });

  it('calculates head-to-head lap deltas and overall pace advantage', () => {
    const comparison = compareDrivers(1, 4, timeline);
    expect(comparison).not.toBeNull();

    expect(comparison?.driver1.driverNumber).toBe(1);
    expect(comparison?.driver2.driverNumber).toBe(4);

    // Laps delta check: Driver 1 vs Driver 2
    expect(comparison?.lapDeltas).toHaveLength(5);

    // Lap 3 was under SC, so isCleanComparison should be false
    const lap3 = comparison?.lapDeltas.find((l) => l.lapNumber === 3);
    expect(lap3?.isCleanComparison).toBe(false);

    // Lap 1 clean comparison
    const lap1 = comparison?.lapDeltas.find((l) => l.lapNumber === 1);
    expect(lap1?.isCleanComparison).toBe(true);

    // Overall clean pace delta: Driver 1 avg (89.1) vs Driver 2 avg (89.225)
    // Driver 1 was faster on average!
    expect(comparison?.overallPaceDeltaSeconds).toBeLessThan(0);
  });

  it('accurately identifies biggest gainers and losers from grid to finish', () => {
    const summary = generateRaceIntelligenceSummary(timeline);

    expect(summary.biggestGainers).toHaveLength(1);
    expect(summary.biggestGainers[0].driverNumber).toBe(1);
    expect(summary.biggestGainers[0].positionsGained).toBe(1); // P2 -> P1

    expect(summary.biggestLosers).toHaveLength(1);
    expect(summary.biggestLosers[0].driverNumber).toBe(4);
    expect(summary.biggestLosers[0].positionsLost).toBe(1); // P1 -> P2
  });
});

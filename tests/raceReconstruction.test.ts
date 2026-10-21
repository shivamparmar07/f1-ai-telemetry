import { describe, it, expect } from 'vitest';
import { reconstructRace } from '../services/raceReconstruction';
import { TyreCompound } from '../types';

describe('Priority 1: Race Reconstruction Engine', () => {
  const mockDrivers = [
    { driver_number: 1, full_name: 'Max Verstappen', team_name: 'Red Bull Racing', team_colour: '3671C6' },
    { driver_number: 4, full_name: 'Lando Norris', team_name: 'McLaren', team_colour: 'FF8000' },
    { driver_number: 16, full_name: 'Charles Leclerc', team_name: 'Ferrari', team_colour: 'E80020' },
    { driver_number: 44, full_name: 'Lewis Hamilton', team_name: 'Mercedes', team_colour: '27F4D2' },
  ];

  const mockStartingGrid = [
    { driver_number: 1, position: 1 },
    { driver_number: 4, position: 2 },
    { driver_number: 16, position: 3 },
    { driver_number: 44, position: 4 },
  ];

  const mockSessionResults = [
    { driver_number: 4, position: 1, number_of_laps: 3, dnf: false },
    { driver_number: 1, position: 2, number_of_laps: 3, dnf: false },
    { driver_number: 16, position: 3, number_of_laps: 3, dnf: false },
    { driver_number: 44, position: 4, number_of_laps: 1, dnf: true }, // Retired on Lap 1!
  ];

  // Out of order timestamps and lap records
  const mockLaps = [
    // Lap 2 Norris (overtook Verstappen on track!)
    { driver_number: 4, lap_number: 2, lap_duration: 88.5, position: 1, gap_to_leader: 0 },
    // Lap 1
    { driver_number: 1, lap_number: 1, lap_duration: 90.0, position: 1, gap_to_leader: 0 },
    { driver_number: 4, lap_number: 1, lap_duration: 90.5, position: 2, gap_to_leader: 0.5 },
    { driver_number: 16, lap_number: 1, lap_duration: 91.0, position: 3, gap_to_leader: 1.0 },
    { driver_number: 44, lap_number: 1, lap_duration: 95.0, position: 4, gap_to_leader: 5.0 },
    // Lap 2 Verstappen
    { driver_number: 1, lap_number: 2, lap_duration: 89.2, position: 2, gap_to_leader: 0.7 },
    // Lap 2 Leclerc (pitted!)
    { driver_number: 16, lap_number: 2, lap_duration: 110.0, position: 3, is_pit_out_lap: true, gap_to_leader: 20.0 },
    // Lap 3
    { driver_number: 4, lap_number: 3, lap_duration: 88.2, position: 1, gap_to_leader: 0 },
    { driver_number: 1, lap_number: 3, lap_duration: 88.6, position: 2, gap_to_leader: 1.1 },
    { driver_number: 16, lap_number: 3, lap_duration: 89.0, position: 3, gap_to_leader: 20.4 },
  ];

  const mockStints = [
    { driver_number: 1, stint_number: 1, compound: 'MEDIUM', lap_start: 1, lap_end: 3, tyre_age_at_start: 0 },
    { driver_number: 4, stint_number: 1, compound: 'MEDIUM', lap_start: 1, lap_end: 3, tyre_age_at_start: 0 },
    { driver_number: 16, stint_number: 1, compound: 'SOFT', lap_start: 1, lap_end: 2, tyre_age_at_start: 3 },
    { driver_number: 16, stint_number: 2, compound: 'HARD', lap_start: 2, lap_end: 3, tyre_age_at_start: 0 },
    { driver_number: 44, stint_number: 1, compound: 'HARD', lap_start: 1, lap_end: 1, tyre_age_at_start: 0 },
  ];

  const mockPitStops = [
    { driver_number: 16, lap_number: 2, stop_duration: 2.4, pit_duration: 21.3, date: '2024-05-05T15:30:00Z' },
  ];

  const mockRaceControl = [
    { lap_number: 2, category: 'SafetyCar', flag: 'YELLOW', message: 'VIRTUAL SAFETY CAR DEPLOYED' },
  ];

  it('reconstructs lap-by-lap timeline with correct leader and intervals', () => {
    const timeline = reconstructRace({
      sessionKey: 9999,
      drivers: mockDrivers,
      sessionResults: mockSessionResults,
      startingGrid: mockStartingGrid,
      laps: mockLaps,
      positions: [],
      stints: mockStints,
      pitStops: mockPitStops,
      raceControl: mockRaceControl,
    });

    expect(timeline.totalLaps).toBe(3);
    expect(timeline.laps).toHaveLength(3);

    // Lap 1: Verstappen leader
    const lap1 = timeline.laps[0];
    expect(lap1.leaderDriverNumber).toBe(1);
    expect(lap1.driverStates[1].position).toBe(1);
    expect(lap1.driverStates[1].gapToLeaderFormatted).toBe('LEADER');
    expect(lap1.driverStates[4].position).toBe(2);

    // Lap 2: Norris took the lead!
    const lap2 = timeline.laps[1];
    expect(lap2.leaderDriverNumber).toBe(4);
    expect(lap2.driverStates[4].position).toBe(1);
    expect(lap2.driverStates[1].position).toBe(2);
  });

  it('detects on-track overtakes and notes active safety car context', () => {
    const timeline = reconstructRace({
      sessionKey: 9999,
      drivers: mockDrivers,
      sessionResults: mockSessionResults,
      startingGrid: mockStartingGrid,
      laps: mockLaps,
      positions: [],
      stints: mockStints,
      pitStops: mockPitStops,
      raceControl: mockRaceControl,
    });

    const lap2 = timeline.laps[1];
    expect(lap2.overtakes.length).toBeGreaterThanOrEqual(1);

    const norrisOvertake = lap2.overtakes.find(
      (o) => o.overtakingDriverNumber === 4 && o.overtakenDriverNumber === 1
    );
    expect(norrisOvertake).toBeDefined();
    expect(norrisOvertake?.fromPosition).toBe(2);
    expect(norrisOvertake?.toPosition).toBe(1);
    expect(norrisOvertake?.type).toBe('ON_TRACK');
    expect(norrisOvertake?.contextMessage).toContain('VSC active');
  });

  it('handles DNF drivers cleanly without creating phantom cars at position 20', () => {
    const timeline = reconstructRace({
      sessionKey: 9999,
      drivers: mockDrivers,
      sessionResults: mockSessionResults,
      startingGrid: mockStartingGrid,
      laps: mockLaps,
      positions: [],
      stints: mockStints,
      pitStops: mockPitStops,
      raceControl: mockRaceControl,
    });

    // Hamilton (driver 44) retired on lap 1
    const lap1Hamilton = timeline.laps[0].driverStates[44];
    expect(lap1Hamilton.status).toBe('RUNNING');

    // On Lap 2 and Lap 3, Hamilton should be marked RETIRED, position null, and flagged in missingFields
    const lap2Hamilton = timeline.laps[1].driverStates[44];
    expect(lap2Hamilton.status).toBe('RETIRED');
    expect(lap2Hamilton.position).toBeNull();
    expect(lap2Hamilton.gapToLeaderFormatted).toBe('RETIRED');
    expect(lap2Hamilton.missingFields).toContain('position');

    const lap3Hamilton = timeline.laps[2].driverStates[44];
    expect(lap3Hamilton.status).toBe('RETIRED');
    expect(lap3Hamilton.position).toBeNull();
  });

  it('tracks pit stops and tyre compound transitions accurately', () => {
    const timeline = reconstructRace({
      sessionKey: 9999,
      drivers: mockDrivers,
      sessionResults: mockSessionResults,
      startingGrid: mockStartingGrid,
      laps: mockLaps,
      positions: [],
      stints: mockStints,
      pitStops: mockPitStops,
      raceControl: mockRaceControl,
    });

    const lap2 = timeline.laps[1];
    const leclercLap2 = lap2.driverStates[16];
    expect(leclercLap2.isPitLap).toBe(true);
    expect(leclercLap2.pitStopDuration).toBe(2.4);
    expect(leclercLap2.pitLaneDuration).toBe(21.3);

    // Pit stops array in lap
    expect(lap2.pitStops).toHaveLength(1);
    expect(lap2.pitStops[0].compoundBefore).toBe(TyreCompound.SOFT);
    expect(lap2.pitStops[0].compoundAfter).toBe(TyreCompound.HARD);
  });

  it('tracks data quality audit metrics instead of silently inventing values', () => {
    const timeline = reconstructRace({
      sessionKey: 9999,
      drivers: mockDrivers,
      sessionResults: mockSessionResults,
      startingGrid: mockStartingGrid,
      laps: mockLaps,
      positions: [],
      stints: mockStints,
      pitStops: mockPitStops,
      raceControl: mockRaceControl,
    });

    expect(timeline.dataQualityAudit).toBeDefined();
    expect(timeline.dataQualityAudit.totalPoints).toBe(12); // 4 drivers * 3 laps
    expect(timeline.dataQualityAudit.missingCount).toBeGreaterThan(0); // due to Hamilton DNF
  });
});

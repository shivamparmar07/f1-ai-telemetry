import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DriverCard } from './components/DriverCard';
import { TyreStrategy } from './components/TyreStrategy';
import { TelemetryChart } from './components/TelemetryChart';
import { AIAnalysis } from './components/AIAnalysis';
import { RaceTimelineReplay } from './components/RaceTimelineReplay';
import { DriverComparison } from './components/DriverComparison';
import { SystemObservability } from './components/SystemObservability';
import { SEASONS } from './constants';
import { generateRaceAnalysis } from './services/geminiService';
import { AIAnalysisResult, Driver, Race, RaceResult } from './types';
import { ReconstructedRaceTimeline } from './types/reconstruction';
import {
  getMeetingsByYear,
  getSessionsByMeeting,
  getDriversBySession,
  getSessionResults,
  getStartingGrid,
  getStints,
  getLaps,
  getPositionData,
  getRaceTimeline,
  connectWebSocket,
} from './services/backendService';
import {
  mapOpenF1Driver,
  mapOpenF1Meeting,
  mapStintsToStrategy,
  mapLapsToTelemetry,
  createRaceResult,
  buildPositionHistory,
  calculatePitStops,
  calculateFastestLap,
} from './services/dataMapper';

export type AppTab = 'telemetry' | 'replay' | 'compare' | 'observability';

const App: React.FC = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<AppTab>('telemetry');

  // Selection State
  const [season, setSeason] = useState(SEASONS[1]);
  const [races, setRaces] = useState<Race[]>([]);
  const [race, setRace] = useState<Race | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driver, setDriver] = useState<Driver | null>(null);

  // Session keys
  const [sessionKey, setSessionKey] = useState<number | null>(null);

  // Data State
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null);
  const [timeline, setTimeline] = useState<ReconstructedRaceTimeline | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WebSocket connection for cache updates
  useEffect(() => {
    const ws = connectWebSocket((message) => {
      console.log('Backend cache update received:', message.type);
      if (message.type === 'timeline_reconstructed' && sessionKey) {
        if (message.data?.sessionKey === sessionKey) {
          setTimeline(message.data.data);
        }
      }
    });

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [sessionKey]);

  // 1. Fetch races for selected season
  useEffect(() => {
    const fetchRaces = async () => {
      setLoading(true);
      setError(null);
      try {
        const meetings = await getMeetingsByYear(parseInt(season, 10));
        const mappedRaces = meetings.map((meeting) => mapOpenF1Meeting(meeting));
        setRaces(mappedRaces);

        if (mappedRaces.length > 0) {
          setRace(mappedRaces[0]);
        } else {
          setError('No races found for this season');
        }
      } catch (err) {
        console.error('Failed to fetch races:', err);
        setError('Failed to load races from OpenF1 API');
      } finally {
        setLoading(false);
      }
    };

    fetchRaces();
  }, [season]);

  // 2. Fetch drivers and sessions for selected race
  useEffect(() => {
    const fetchRaceData = async () => {
      if (!race) return;

      setLoading(true);
      setError(null);
      try {
        const raceId = parseInt(race.id.replace('race_', ''), 10);
        const sessions = await getSessionsByMeeting(raceId);

        const raceSession = sessions.find(
          (s) =>
            s.session_type === 'Race' ||
            s.session_type === 'Sprint' ||
            s.session_name?.includes('Race')
        );

        if (!raceSession) {
          setError('No race session found');
          setDrivers([]);
          setDriver(null);
          setSessionKey(null);
          return;
        }

        setSessionKey(raceSession.session_key);
        (window as any).currentSessionKey = raceSession.session_key;
        (window as any).currentMeetingKey = raceId;
        (window as any).allSessions = sessions;

        // Fetch drivers
        const openF1Drivers = await getDriversBySession(raceSession.session_key);
        const mappedDrivers = openF1Drivers.map((d) => mapOpenF1Driver(d));
        setDrivers(mappedDrivers);

        if (mappedDrivers.length > 0) {
          setDriver(mappedDrivers[0]);
        }

        // Fetch reconstructed race timeline in background
        setLoadingTimeline(true);
        getRaceTimeline(raceSession.session_key)
          .then((tl) => setTimeline(tl))
          .catch((tlErr) => console.warn('Timeline fetch delayed:', tlErr))
          .finally(() => setLoadingTimeline(false));
      } catch (err) {
        console.error('Failed to fetch race data:', err);
        setError('Failed to load race data from OpenF1 API');
      } finally {
        setLoading(false);
      }
    };

    fetchRaceData();
  }, [race]);

  // 3. Fetch race result and telemetry data for selected driver
  useEffect(() => {
    const fetchRaceResult = async () => {
      if (!driver || !race || !sessionKey) return;

      setLoadingAi(true);
      setError(null);
      try {
        const allSessions = (window as any).allSessions;
        const driverNumber = driver.number;

        // Fetch session results
        const results = await getSessionResults(sessionKey);
        const driverResult = results.find((r) => r.driver_number === driverNumber);

        if (!driverResult) {
          setError('No result data found for this driver');
          return;
        }

        // Qualifying grid position
        let gridPosition = 20;
        if (allSessions) {
          const qualSession = allSessions.find((s: any) => s.session_type === 'Qualifying');
          if (qualSession) {
            try {
              const qualResults = await getSessionResults(qualSession.session_key);
              const qualResult = qualResults.find((r: any) => r.driver_number === driverNumber);
              if (qualResult) {
                gridPosition = qualResult.position;
              }
            } catch {
              // fallback to grid endpoint
            }
          }
        }

        if (gridPosition === 20) {
          try {
            const grid = await getStartingGrid(sessionKey);
            if (grid && grid.length > 0) {
              const gridData = grid.find((g: any) => g.driver_number === driverNumber);
              if (gridData) {
                gridPosition = gridData.position;
              }
            }
          } catch {}
        }

        // Stints, Laps, Positions
        const [stints, laps, positionData] = await Promise.all([
          getStints(sessionKey, driverNumber).catch(() => []),
          getLaps(sessionKey, driverNumber).catch(() => []),
          getPositionData(sessionKey, driverNumber).catch(() => []),
        ]);

        const tyreStrategy = mapStintsToStrategy(stints);
        const positionHistory = buildPositionHistory(positionData, laps);
        const telemetry = mapLapsToTelemetry(laps, positionHistory);

        const pitStops = calculatePitStops(laps);
        const fastestLap = calculateFastestLap(laps);

        const result = createRaceResult(
          driver.id,
          race.id,
          gridPosition,
          driverResult.position,
          driverResult,
          tyreStrategy,
          telemetry
        );

        (result as any).pitStops = pitStops;
        (result as any).fastestLap = fastestLap;

        setRaceResult(result);

        // AI Analysis
        try {
          const aiResult = await generateRaceAnalysis(driver, race, result);
          setAiAnalysis(aiResult);
        } catch (e) {
          console.error('AI Generation failed', e);
          setAiAnalysis(null);
        }
      } catch (err) {
        console.error('Failed to fetch race result:', err);
        setError('Failed to load race telemetry data');
      } finally {
        setLoadingAi(false);
      }
    };

    fetchRaceResult();
  }, [driver, race, sessionKey]);

  return (
    <div className="min-h-screen bg-neutral-950 pb-16 selection:bg-red-600 selection:text-white">
      <Header
        currentSeason={season}
        setSeason={setSeason}
        currentRace={race}
        setRace={setRace}
        currentDriver={driver}
        setDriver={setDriver}
        races={races}
        drivers={drivers}
      />

      <main className="max-w-7xl mx-auto px-4 pt-6">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2 bg-neutral-900/90 p-1 rounded-xl border border-neutral-800">
            <button
              id="tab-telemetry-btn"
              onClick={() => setActiveTab('telemetry')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'telemetry'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <span>🏎️</span> Driver Telemetry
            </button>

            <button
              id="tab-replay-btn"
              onClick={() => setActiveTab('replay')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'replay'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <span>⏱️</span> Race Replay & Overtakes
              {timeline && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300 font-mono">
                  {timeline.totalLaps}L
                </span>
              )}
            </button>

            <button
              id="tab-compare-btn"
              onClick={() => setActiveTab('compare')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'compare'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <span>⚔️</span> Head-to-Head Pace
            </button>

            <button
              id="tab-observability-btn"
              onClick={() => setActiveTab('observability')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                activeTab === 'observability'
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
              }`}
            >
              <span>📊</span> System Observability
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>
          </div>

          {/* Quick HUD indicator */}
          <div className="hidden sm:flex items-center gap-3 text-xs font-mono text-neutral-400 bg-neutral-900/60 px-3 py-1.5 rounded-lg border border-neutral-800">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              SingleFlight: Active
            </span>
            <span className="text-neutral-600">|</span>
            <span>Circuit: Closed</span>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-600/60 rounded-xl text-red-400 text-xs">
            <p>{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-neutral-300 font-medium">Connecting to OpenF1 API via Resilient Backend...</p>
              <p className="text-xs text-neutral-500 mt-1">SingleFlight coalescing & SWR caching enabled</p>
            </div>
          </div>
        )}

        {/* Active Tab Views */}
        {!loading && (
          <>
            {/* View 1: Single Driver Telemetry & Strategy */}
            {activeTab === 'telemetry' && race && driver && raceResult && (
              <>
                {/* Top Info Bar */}
                <div className="flex flex-col md:flex-row justify-between items-end mb-6 border-b border-neutral-800 pb-3">
                  <div>
                    <h2 className="text-neutral-400 text-xs font-bold tracking-widest uppercase mb-1">
                      {season} FORMULA 1 WORLD CHAMPIONSHIP
                    </h2>
                    <h1 className="text-3xl md:text-4xl text-white font-black f1-font uppercase tracking-wide">
                      {race.name}
                    </h1>
                  </div>
                  <div className="text-right mt-2 md:mt-0">
                    <div className="text-neutral-400 text-xs font-mono">{race.date}</div>
                    <div className="text-red-500 font-bold uppercase text-xs tracking-wider">{race.circuitName}</div>
                  </div>
                </div>

                {/* Dashboard Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Stats & Strategy */}
                  <div className="lg:col-span-4 flex flex-col gap-6">
                    <DriverCard driver={driver} result={raceResult} />
                    <TyreStrategy stints={raceResult.tyreStrategy} />
                  </div>

                  {/* Center Column: Telemetry */}
                  <div className="lg:col-span-8">
                    <TelemetryChart
                      data={raceResult.telemetry}
                      driverName={driver.name}
                      driverColor={driver.teamColor}
                    />

                    {/* Additional Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                      <div className="bg-neutral-900/80 p-3.5 rounded-xl border border-neutral-800 text-center">
                        <div className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Fastest Lap</div>
                        <div className="text-lg font-mono text-white font-bold mt-0.5">
                          {(raceResult as any).fastestLap || '0:00.000'}
                        </div>
                      </div>
                      <div className="bg-neutral-900/80 p-3.5 rounded-xl border border-neutral-800 text-center">
                        <div className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Pit Stops</div>
                        <div className="text-lg font-mono text-white font-bold mt-0.5">
                          {(raceResult as any).pitStops || 0}
                        </div>
                      </div>
                      <div className="bg-neutral-900/80 p-3.5 rounded-xl border border-neutral-800 text-center">
                        <div className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Points</div>
                        <div className="text-lg font-mono text-amber-400 font-bold mt-0.5">{raceResult.points}</div>
                      </div>
                      <div className="bg-neutral-900/80 p-3.5 rounded-xl border border-neutral-800 text-center">
                        <div className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Status</div>
                        <div className="text-lg font-mono text-emerald-400 font-bold mt-0.5">{raceResult.status}</div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Full Width: AI Analysis */}
                  <div className="lg:col-span-12">
                    <AIAnalysis analysis={aiAnalysis} loading={loadingAi} />
                  </div>
                </div>
              </>
            )}

            {/* View 2: Race Replay & Overtakes */}
            {activeTab === 'replay' && (
              <RaceTimelineReplay timeline={timeline} loading={loadingTimeline} />
            )}

            {/* View 3: Head-to-Head Pace Comparison */}
            {activeTab === 'compare' && (
              <DriverComparison sessionKey={sessionKey} drivers={drivers} />
            )}

            {/* View 4: System Observability & Concurrency */}
            {activeTab === 'observability' && (
              <SystemObservability />
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
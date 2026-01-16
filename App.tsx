import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DriverCard } from './components/DriverCard';
import { TyreStrategy } from './components/TyreStrategy';
import { TelemetryChart } from './components/TelemetryChart';
import { AIAnalysis } from './components/AIAnalysis';
import { SEASONS } from './constants';
import { generateRaceAnalysis } from './services/geminiService';
import { AIAnalysisResult, Driver, Race, RaceResult } from './types';
import {
  getMeetingsByYear,
  getSessionsByMeeting,
  getDriversBySession,
  getSessionResults,
  getStartingGrid,
  getStints,
  getLaps,
  getPositionData,
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

// Helper function to add delay between API calls
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const App: React.FC = () => {
  // State
  const [season, setSeason] = useState(SEASONS[1]);
  const [races, setRaces] = useState<Race[]>([]);
  const [race, setRace] = useState<Race | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driver, setDriver] = useState<Driver | null>(null);

  // Data State
  const [raceResult, setRaceResult] = useState<RaceResult | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // WebSocket connection for cache updates
  useEffect(() => {
    const ws = connectWebSocket((message) => {
      console.log('Backend cache updated:', message.type);
      // Could trigger refetch here if needed
    });

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Fetch races for selected season
  useEffect(() => {
    const fetchRaces = async () => {
      setLoading(true);
      setError(null);
      try {
        const meetings = await getMeetingsByYear(parseInt(season));
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

  // Fetch drivers and sessions for selected race
  useEffect(() => {
    const fetchRaceData = async () => {
      if (!race) return;

      setLoading(true);
      setError(null);
      try {
        // Extract meeting_key from race id
        const raceId = parseInt(race.id.replace('race_', ''));

        // Get sessions for this meeting
        const sessions = await getSessionsByMeeting(raceId);

        // Find the main race session (not practice or qualifying)
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
          return;
        }

        // Fetch drivers for this session
        const openF1Drivers = await getDriversBySession(raceSession.session_key);
        const mappedDrivers = openF1Drivers.map((d) => mapOpenF1Driver(d));
        setDrivers(mappedDrivers);

        if (mappedDrivers.length > 0) {
          setDriver(mappedDrivers[0]);
        }

        // Store session key and meeting key for later use
        (window as any).currentSessionKey = raceSession.session_key;
        (window as any).currentMeetingKey = raceId;
        (window as any).allSessions = sessions;
      } catch (err) {
        console.error('Failed to fetch race data:', err);
        setError('Failed to load race data from OpenF1 API');
      } finally {
        setLoading(false);
      }
    };

    fetchRaceData();
  }, [race]);

  // Fetch race result and telemetry data for selected driver
  useEffect(() => {
    const fetchRaceResult = async () => {
      if (!driver || !race || !((window as any).currentSessionKey)) return;

      setLoadingAi(true);
      setError(null);
      try {
        const sessionKey = (window as any).currentSessionKey;
        const meetingKey = (window as any).currentMeetingKey;
        const allSessions = (window as any).allSessions;
        const driverNumber = driver.number;

        // Fetch session results
        const results = await getSessionResults(sessionKey);
        const driverResult = results.find((r) => r.driver_number === driverNumber);

        if (!driverResult) {
          setError('No result data found for this driver');
          return;
        }

        // Get grid position from qualifying session results
        let gridPosition = 20; // Default fallback
        if (allSessions) {
          const qualSession = allSessions.find((s: any) => s.session_type === 'Qualifying');
          if (qualSession) {
            const qualResults = await getSessionResults(qualSession.session_key);
            const qualResult = qualResults.find((r) => r.driver_number === driverNumber);
            if (qualResult) {
              gridPosition = qualResult.position;
            }
          }
        }

        // Fallback: try starting_grid endpoint (for compatibility)
        if (gridPosition === 20) {
          const grid = await getStartingGrid(sessionKey);
          if (grid && grid.length > 0) {
            const gridData = grid.find((g) => g.driver_number === driverNumber);
            if (gridData) {
              gridPosition = gridData.position;
            }
          }
        }

        // Fetch stints for tyre strategy
        const stints = await getStints(sessionKey, driverNumber);
        const tyreStrategy = mapStintsToStrategy(stints);

        // Fetch laps
        const laps = await getLaps(sessionKey, driverNumber);

        // Fetch position history
        const positionData = await getPositionData(sessionKey, driverNumber);
        const positionHistory = buildPositionHistory(positionData, laps);

        // Map laps to telemetry
        const telemetry = mapLapsToTelemetry(laps, positionHistory);

        // Calculate metrics from laps data
        const pitStops = calculatePitStops(laps);
        const fastestLap = calculateFastestLap(laps);

        // Create race result
        const result = createRaceResult(
          driver.id,
          race.id,
          gridPosition,
          driverResult.position,
          driverResult,
          tyreStrategy,
          telemetry
        );

        // Store metrics in result for display
        (result as any).pitStops = pitStops;
        (result as any).fastestLap = fastestLap;

        setRaceResult(result);

        // Trigger AI analysis
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
  }, [driver, race]);

  return (
    <div className="min-h-screen bg-neutral-900 pb-12 selection:bg-red-600 selection:text-white">
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

      <main className="max-w-7xl mx-auto px-4 pt-8">
        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-600 rounded text-red-400">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center min-h-[60vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600 mx-auto mb-4"></div>
              <p className="text-neutral-400">Loading race data from OpenF1 API...</p>
            </div>
          </div>
        )}

        {/* Main Content */}
        {!loading && race && driver && raceResult && (
          <>
            {/* Top Info Bar */}
            <div className="flex flex-col md:flex-row justify-between items-end mb-6 border-b border-neutral-800 pb-2">
              <div>
                <h2 className="text-neutral-400 text-sm font-bold tracking-widest uppercase mb-1">
                  {season} FORMULA 1 WORLD CHAMPIONSHIP
                </h2>
                <h1 className="text-3xl md:text-4xl text-white font-bold f1-font uppercase">
                  {race.name}
                </h1>
              </div>
              <div className="text-right mt-2 md:mt-0">
                <div className="text-neutral-500 text-sm">{race.date}</div>
                <div className="text-red-500 font-bold uppercase text-sm">{race.circuitName}</div>
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

                {/* Additional Stats Row under chart */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <div className="bg-neutral-800/50 p-3 rounded border border-neutral-700 text-center">
                    <div className="text-[10px] text-neutral-400 uppercase">Fastest Lap</div>
                    <div className="text-lg font-mono text-white">
                      {(raceResult as any).fastestLap || '0:00.000'}
                    </div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded border border-neutral-700 text-center">
                    <div className="text-[10px] text-neutral-400 uppercase">Pit Stops</div>
                    <div className="text-lg font-mono text-white">
                      {(raceResult as any).pitStops || 0}
                    </div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded border border-neutral-700 text-center">
                    <div className="text-[10px] text-neutral-400 uppercase">Points</div>
                    <div className="text-lg font-mono text-white">{raceResult.points}</div>
                  </div>
                  <div className="bg-neutral-800/50 p-3 rounded border border-neutral-700 text-center">
                    <div className="text-[10px] text-neutral-400 uppercase">Status</div>
                    <div className="text-lg font-mono text-green-500">{raceResult.status}</div>
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
      </main>
    </div>
  );
};

export default App;
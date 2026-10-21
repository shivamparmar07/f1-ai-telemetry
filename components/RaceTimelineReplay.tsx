import React, { useState, useEffect, useRef } from 'react';
import { ReconstructedRaceTimeline, DriverLapTimelinePoint, OvertakeEvent, TrackConditionEvent } from '../types/reconstruction';
import { TYRE_COLORS } from '../constants';

interface RaceTimelineReplayProps {
  timeline: ReconstructedRaceTimeline | null;
  loading: boolean;
}

export const RaceTimelineReplay: React.FC<RaceTimelineReplayProps> = ({ timeline, loading }) => {
  const [currentLap, setCurrentLap] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1); // 1 = 1s per lap, 2 = 0.5s per lap, 4 = 0.25s per lap
  const [selectedDriverNumber, setSelectedDriverNumber] = useState<number | null>(null);

  const totalLaps = timeline?.totalLaps || 1;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-play animation loop
  useEffect(() => {
    if (isPlaying) {
      const interval = 1000 / playbackSpeed;
      timerRef.current = setInterval(() => {
        setCurrentLap((prev) => {
          if (prev >= totalLaps) {
            setIsPlaying(false);
            return totalLaps;
          }
          return prev + 1;
        });
      }, interval);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, totalLaps]);

  if (loading || !timeline) {
    return (
      <div className="bg-neutral-800/80 backdrop-blur-md rounded-xl p-8 border border-neutral-700/80 flex flex-col items-center justify-center min-h-[420px]">
        <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-neutral-300 font-medium">Reconstructing race timeline across all drivers...</p>
        <p className="text-xs text-neutral-500 mt-1">Fusing laps, positions, intervals, pit stops, and race control</p>
      </div>
    );
  }

  const currentLapData = timeline.laps.find((l) => l.lapNumber === currentLap) || timeline.laps[0];
  const driverStates = currentLapData ? Object.values(currentLapData.driverStates) : [];

  // Sort drivers for the current lap leaderboard: running drivers by position, then retired
  const sortedDrivers = [...driverStates].sort((a, b) => {
    if (a.status === 'RETIRED' || a.status === 'DNS') return 1;
    if (b.status === 'RETIRED' || b.status === 'DNS') return -1;
    return (a.position ?? 99) - (b.position ?? 99);
  });

  const activeTrackEvents: TrackConditionEvent[] = currentLapData?.trackEvents || [];
  const lapOvertakes: OvertakeEvent[] = currentLapData?.overtakes || [];
  const lapPitStops = currentLapData?.pitStops || [];

  return (
    <div className="bg-neutral-800/90 backdrop-blur-md rounded-xl border border-neutral-700/80 p-6 shadow-2xl">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-700/60 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-600 animate-pulse"></span>
            <h2 className="text-xl font-bold uppercase tracking-wider text-white f1-font">
              Race Reconstruction Replay
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Lap-by-lap field positions, on-track overtakes, pit stops, and safety car events
          </p>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center gap-3">
          <button
            id="replay-play-pause-btn"
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/20'
                : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
            }`}
          >
            {isPlaying ? (
              <>
                <span className="w-2 h-3 border-l-2 border-r-2 border-white inline-block"></span>
                Pause
              </>
            ) : (
              <>
                <span className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-white inline-block"></span>
                Play Replay
              </>
            )}
          </button>

          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentLap(1);
            }}
            className="px-3 py-2 bg-neutral-700/80 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-semibold transition-all"
            title="Reset to Lap 1"
          >
            ⏮ Reset
          </button>

          <div className="flex items-center bg-neutral-900/80 border border-neutral-700 rounded-lg p-1 text-xs">
            {[1, 2, 4].map((speed) => (
              <button
                key={speed}
                onClick={() => setPlaybackSpeed(speed)}
                className={`px-2 py-1 rounded text-[11px] font-mono font-bold transition-all ${
                  playbackSpeed === speed
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lap Slider & Track Status HUD */}
      <div className="mb-6 bg-neutral-900/90 rounded-xl p-5 border border-neutral-700/60">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-white font-mono">
              LAP {currentLap}
            </span>
            <span className="text-xs text-neutral-400 font-mono">
              / {totalLaps}
            </span>
          </div>

          {/* Active Track Flags */}
          <div className="flex items-center gap-2">
            {activeTrackEvents.length === 0 ? (
              <span className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Track Clear
              </span>
            ) : (
              activeTrackEvents.map((evt, idx) => (
                <span
                  key={idx}
                  className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
                    evt.status === 'SC'
                      ? 'bg-amber-950/90 border-amber-500 text-amber-300 animate-pulse'
                      : evt.status === 'VSC'
                      ? 'bg-yellow-950/90 border-yellow-500 text-yellow-300 animate-pulse'
                      : evt.status === 'RED'
                      ? 'bg-red-950/90 border-red-500 text-red-300 animate-pulse'
                      : 'bg-amber-900/60 border-amber-600 text-amber-300'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current"></span>
                  {evt.status}: {evt.message}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Scrubber Range */}
        <input
          id="lap-timeline-slider"
          type="range"
          min={1}
          max={totalLaps}
          value={currentLap}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentLap(parseInt(e.target.value, 10));
          }}
          className="w-full h-2.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none"
        />

        {/* Data Quality Indicator */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-neutral-400">
          <span>Lap 1 (Start)</span>
          <span className="text-neutral-400 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
            Telemetry Measured: {timeline.dataQualityAudit.measuredPercentage}%
            {timeline.dataQualityAudit.missingCount > 0 && (
              <span className="text-amber-400/80">({timeline.dataQualityAudit.missingCount} missing/retired points)</span>
            )}
          </span>
          <span>Lap {totalLaps} (Finish)</span>
        </div>
      </div>

      {/* Main Grid: Leaderboard + Overtakes & Pit Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Real-time Leaderboard */}
        <div className="lg:col-span-2 bg-neutral-900/60 rounded-xl border border-neutral-700/60 p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-3 px-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              Field Standings (Lap {currentLap})
            </h3>
            <span className="text-[11px] text-neutral-400">
              Showing {sortedDrivers.length} Drivers
            </span>
          </div>

          <div className="overflow-x-auto max-h-[460px] overflow-y-auto pr-1">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase text-neutral-400 border-b border-neutral-700/80 sticky top-0 bg-neutral-900 z-10">
                <tr>
                  <th className="py-2 px-2">Pos</th>
                  <th className="py-2 px-2">Driver</th>
                  <th className="py-2 px-2">Interval</th>
                  <th className="py-2 px-2">Gap to Leader</th>
                  <th className="py-2 px-2">Lap Time</th>
                  <th className="py-2 px-2">Tyre</th>
                  <th className="py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {sortedDrivers.map((driverState) => {
                  const meta = timeline.drivers[driverState.driverNumber];
                  const isSelected = selectedDriverNumber === driverState.driverNumber;
                  const isLeader = driverState.position === 1;

                  return (
                    <tr
                      key={driverState.driverNumber}
                      onClick={() =>
                        setSelectedDriverNumber(
                          isSelected ? null : driverState.driverNumber
                        )
                      }
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-red-950/40 border-l-2 border-red-500'
                          : 'hover:bg-neutral-800/60'
                      }`}
                    >
                      <td className="py-2.5 px-2 font-mono font-bold">
                        {driverState.status === 'RETIRED' ? (
                          <span className="text-red-400/80 font-bold">OUT</span>
                        ) : driverState.status === 'DNS' ? (
                          <span className="text-neutral-400 font-bold">DNS</span>
                        ) : (
                          <span className={isLeader ? 'text-amber-400 text-sm' : 'text-neutral-200'}>
                            P{driverState.position ?? '-'}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-1.5 h-4 rounded-full"
                            style={{ backgroundColor: meta?.teamColor || '#666' }}
                          ></span>
                          <div>
                            <span className="font-semibold text-white">
                              {meta?.broadcastName || meta?.name || `#${driverState.driverNumber}`}
                            </span>
                            <span className="text-[10px] text-neutral-400 block truncate max-w-[120px]">
                              {meta?.team || ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 font-mono text-neutral-300">
                        {driverState.intervalFormatted}
                      </td>

                      <td className="py-2.5 px-2 font-mono text-neutral-300">
                        {driverState.gapToLeaderFormatted}
                      </td>

                      <td className="py-2.5 px-2 font-mono">
                        {driverState.lapDurationFormatted === 'MISSING' ? (
                          <span className="text-amber-400/70 border-b border-dashed border-amber-400/40" title="Telemetry data missing for this lap">
                            Missing
                          </span>
                        ) : driverState.status === 'RETIRED' ? (
                          <span className="text-neutral-400">DNF</span>
                        ) : (
                          <span className="text-neutral-200">
                            {driverState.lapDurationFormatted}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-2">
                        {driverState.status !== 'RETIRED' && driverState.status !== 'DNS' ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                              style={{
                                backgroundColor: `${TYRE_COLORS[driverState.compound] || '#888'}22`,
                                color: TYRE_COLORS[driverState.compound] || '#fff',
                                border: `1px solid ${TYRE_COLORS[driverState.compound] || '#888'}66`,
                              }}
                            >
                              {driverState.compound[0]}
                            </span>
                            <span className="text-[10px] text-neutral-400 font-mono">
                              {driverState.tyreAge}L
                            </span>
                          </div>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>

                      <td className="py-2.5 px-2">
                        {driverState.isPitLap ? (
                          <span className="px-2 py-0.5 rounded bg-blue-950/80 border border-blue-500/50 text-blue-400 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                            PIT {driverState.pitStopDuration ? `${driverState.pitStopDuration}s` : ''}
                          </span>
                        ) : driverState.status === 'RETIRED' ? (
                          <span className="px-2 py-0.5 rounded bg-red-950/60 border border-red-500/40 text-red-400 text-[10px] font-bold uppercase">
                            Retired
                          </span>
                        ) : (
                          <span className="text-emerald-400/80 text-[10px] font-semibold">Running</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Lap Events Feed (Overtakes, Pit Stops, Track Warnings) */}
        <div className="flex flex-col gap-4">
          {/* Overtakes Card */}
          <div className="bg-neutral-900/60 rounded-xl border border-neutral-700/60 p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                <span className="text-amber-400">⚡</span> Overtakes on Lap {currentLap}
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-800 rounded text-neutral-400">
                {lapOvertakes.length} passes
              </span>
            </div>

            {lapOvertakes.length === 0 ? (
              <div className="h-28 flex items-center justify-center text-center text-neutral-400 text-xs">
                No positional changes recorded on this lap
              </div>
            ) : (
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                {lapOvertakes.map((o, idx) => {
                  const overtakingDriver = timeline.drivers[o.overtakingDriverNumber];
                  const overtakenDriver = timeline.drivers[o.overtakenDriverNumber];

                  return (
                    <div
                      key={idx}
                      className="p-2.5 bg-neutral-800/70 border border-neutral-700/70 rounded-lg text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-emerald-400">
                          {overtakingDriver?.broadcastName || `#${o.overtakingDriverNumber}`}
                        </span>
                        <span className="text-neutral-400 text-[10px] font-mono">
                          P{o.fromPosition} → P{o.toPosition}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-300">
                        Passed {overtakenDriver?.broadcastName || `#${o.overtakenDriverNumber}`}
                      </p>
                      {o.contextMessage && (
                        <span className="text-[10px] text-neutral-400 italic block mt-0.5">
                          {o.contextMessage}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pit Stops on this Lap */}
          <div className="bg-neutral-900/60 rounded-xl border border-neutral-700/60 p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 mb-3 flex items-center gap-1.5">
              <span className="text-blue-400">🔧</span> Pit Stops on Lap {currentLap}
            </h4>

            {lapPitStops.length === 0 ? (
              <p className="text-neutral-400 text-xs py-2 text-center">
                No drivers pitted on this lap
              </p>
            ) : (
              <div className="space-y-2">
                {lapPitStops.map((p, idx) => {
                  const driver = timeline.drivers[p.driverNumber];
                  return (
                    <div
                      key={idx}
                      className="p-2.5 bg-neutral-800/70 border border-neutral-700/70 rounded-lg text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">
                          {driver?.name || `#${p.driverNumber}`}
                        </span>
                        <span className="font-mono text-blue-400 font-bold">
                          Stop: {p.stopDuration ? `${p.stopDuration}s` : 'Pit In'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400">
                        <span>Compound transition:</span>
                        <span className="font-bold text-neutral-300">{p.compoundBefore}</span>
                        <span>→</span>
                        <span className="font-bold text-white">{p.compoundAfter}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

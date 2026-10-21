import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Driver } from '../types';
import { DriverComparisonResult } from '../services/raceIntelligence';
import { getDriverComparison } from '../services/backendService';
import { formatLapTime } from '../services/raceReconstruction';
import { TYRE_COLORS } from '../constants';

interface DriverComparisonProps {
  sessionKey: number | null;
  drivers: Driver[];
}

export const DriverComparison: React.FC<DriverComparisonProps> = ({ sessionKey, drivers }) => {
  const [driver1Num, setDriver1Num] = useState<number>(drivers[0]?.number || 1);
  const [driver2Num, setDriver2Num] = useState<number>(drivers[1]?.number || 4);
  const [comparison, setComparison] = useState<DriverComparisonResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (drivers.length >= 2) {
      if (!drivers.some((d) => d.number === driver1Num)) setDriver1Num(drivers[0].number);
      if (!drivers.some((d) => d.number === driver2Num)) setDriver2Num(drivers[1].number);
    }
  }, [drivers]);

  useEffect(() => {
    if (!sessionKey || !driver1Num || !driver2Num || driver1Num === driver2Num) {
      return;
    }

    const fetchComparison = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getDriverComparison(sessionKey, driver1Num, driver2Num);
        setComparison(data);
      } catch (err: any) {
        console.error('Failed to load driver comparison:', err);
        setError('Failed to calculate head-to-head comparison');
      } finally {
        setLoading(false);
      }
    };

    fetchComparison();
  }, [sessionKey, driver1Num, driver2Num]);

  if (!sessionKey || drivers.length < 2) {
    return (
      <div className="bg-neutral-800/80 backdrop-blur-md rounded-xl p-8 border border-neutral-700 text-center text-neutral-400">
        Please select a session with multiple drivers to compare head-to-head.
      </div>
    );
  }

  return (
    <div className="bg-neutral-800/90 backdrop-blur-md rounded-xl border border-neutral-700/80 p-6 shadow-2xl">
      {/* Header and Driver Selectors */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-neutral-700/60 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></span>
            <h2 className="text-xl font-bold uppercase tracking-wider text-white f1-font">
              Head-to-Head Driver Pace Intelligence
            </h2>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Compare clean lap times, stint-by-stint degradation, and on-track deltas
          </p>
        </div>

        {/* Dual Selectors */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-neutral-400 mb-1">Driver 1</label>
            <select
              id="compare-driver-1-select"
              value={driver1Num}
              onChange={(e) => setDriver1Num(parseInt(e.target.value, 10))}
              className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-red-500"
            >
              {drivers.map((d) => (
                <option key={d.number} value={d.number} disabled={d.number === driver2Num}>
                  #{d.number} {d.name} ({d.team})
                </option>
              ))}
            </select>
          </div>

          <span className="text-neutral-400 font-black text-sm pt-4">VS</span>

          <div className="flex flex-col">
            <label className="text-[10px] uppercase font-bold text-neutral-400 mb-1">Driver 2</label>
            <select
              id="compare-driver-2-select"
              value={driver2Num}
              onChange={(e) => setDriver2Num(parseInt(e.target.value, 10))}
              className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-blue-500"
            >
              {drivers.map((d) => (
                <option key={d.number} value={d.number} disabled={d.number === driver1Num}>
                  #{d.number} {d.name} ({d.team})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="py-16 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-xs text-neutral-400">Computing clean stint lap paces and regressions...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-500/60 rounded-lg text-red-400 text-xs">
          {error}
        </div>
      )}

      {comparison && !loading && (
        <div className="space-y-6">
          {/* Top Summary Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Driver 1 Card */}
            <div className="p-4 bg-neutral-900/80 rounded-xl border border-neutral-700/80 relative overflow-hidden">
              <div
                className="absolute top-0 left-0 bottom-0 w-1.5"
                style={{ backgroundColor: comparison.driver1.teamColor }}
              ></div>
              <div className="pl-2">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                  {comparison.driver1.team}
                </span>
                <h3 className="text-lg font-black text-white">
                  {comparison.driver1.name}
                </h3>
                <div className="mt-2 flex items-center gap-4 text-xs font-mono">
                  <span className="text-neutral-300">
                    Grid: <strong className="text-white">P{comparison.driver1.gridPosition}</strong>
                  </span>
                  <span>→</span>
                  <span className="text-neutral-300">
                    Finish: <strong className="text-white">P{comparison.driver1.finishPosition}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Delta Comparison Summary */}
            <div className="p-4 bg-neutral-900/90 rounded-xl border border-neutral-700/80 flex flex-col justify-center items-center text-center">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider mb-1">
                Net Clean Pace Delta
              </span>
              {comparison.overallPaceDeltaSeconds !== null ? (
                <div>
                  <span
                    className={`text-2xl font-black font-mono ${
                      comparison.overallPaceDeltaSeconds < 0 ? 'text-emerald-400' : 'text-blue-400'
                    }`}
                  >
                    {Math.abs(comparison.overallPaceDeltaSeconds).toFixed(3)}s
                  </span>
                  <p className="text-[11px] text-neutral-400 mt-1">
                    {comparison.overallPaceDeltaSeconds < 0
                      ? `${comparison.driver1.name} was faster per clean lap`
                      : `${comparison.driver2.name} was faster per clean lap`}
                  </p>
                </div>
              ) : (
                <span className="text-xs text-neutral-400">No overlapping clean racing laps</span>
              )}
            </div>

            {/* Driver 2 Card */}
            <div className="p-4 bg-neutral-900/80 rounded-xl border border-neutral-700/80 relative overflow-hidden">
              <div
                className="absolute top-0 right-0 bottom-0 w-1.5"
                style={{ backgroundColor: comparison.driver2.teamColor }}
              ></div>
              <div className="pr-2 text-right">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                  {comparison.driver2.team}
                </span>
                <h3 className="text-lg font-black text-white">
                  {comparison.driver2.name}
                </h3>
                <div className="mt-2 flex items-center justify-end gap-4 text-xs font-mono">
                  <span className="text-neutral-300">
                    Grid: <strong className="text-white">P{comparison.driver2.gridPosition}</strong>
                  </span>
                  <span>→</span>
                  <span className="text-neutral-300">
                    Finish: <strong className="text-white">P{comparison.driver2.finishPosition}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stint-by-Stint Pace Comparison Table */}
          <div className="bg-neutral-900/70 rounded-xl border border-neutral-700/80 p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 mb-4 flex items-center gap-2">
              <span>📊</span> Clean Pace by Tyre Stint (Excluding Out/In & SC Laps)
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase text-neutral-400 border-b border-neutral-700 pb-2">
                  <tr>
                    <th className="py-2 px-2">Stint</th>
                    <th className="py-2 px-2">{comparison.driver1.name} Compound</th>
                    <th className="py-2 px-2">{comparison.driver1.name} Clean Pace</th>
                    <th className="py-2 px-2">{comparison.driver2.name} Compound</th>
                    <th className="py-2 px-2">{comparison.driver2.name} Clean Pace</th>
                    <th className="py-2 px-2">Stint Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {comparison.stintComparisons.map((stint) => (
                    <tr key={stint.stintIndex} className="hover:bg-neutral-800/40">
                      <td className="py-3 px-2 font-mono font-bold text-white">
                        Stint {stint.stintIndex}
                      </td>

                      <td className="py-3 px-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: `${TYRE_COLORS[stint.d1Compound] || '#888'}22`,
                            color: TYRE_COLORS[stint.d1Compound] || '#fff',
                            border: `1px solid ${TYRE_COLORS[stint.d1Compound] || '#888'}66`,
                          }}
                        >
                          {stint.d1Compound}
                        </span>
                      </td>

                      <td className="py-3 px-2 font-mono text-neutral-200">
                        {formatLapTime(stint.d1AvgPace)}
                      </td>

                      <td className="py-3 px-2">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: `${TYRE_COLORS[stint.d2Compound] || '#888'}22`,
                            color: TYRE_COLORS[stint.d2Compound] || '#fff',
                            border: `1px solid ${TYRE_COLORS[stint.d2Compound] || '#888'}66`,
                          }}
                        >
                          {stint.d2Compound}
                        </span>
                      </td>

                      <td className="py-3 px-2 font-mono text-neutral-200">
                        {formatLapTime(stint.d2AvgPace)}
                      </td>

                      <td className="py-3 px-2 font-mono">
                        {stint.paceAdvantageSeconds !== null ? (
                          <span
                            className={`font-bold ${
                              stint.fasterDriverNumber === comparison.driver1.driverNumber
                                ? 'text-emerald-400'
                                : 'text-blue-400'
                            }`}
                          >
                            {stint.fasterDriverNumber === comparison.driver1.driverNumber
                              ? `+${Math.abs(stint.paceAdvantageSeconds).toFixed(3)}s (${comparison.driver1.name})`
                              : `+${Math.abs(stint.paceAdvantageSeconds).toFixed(3)}s (${comparison.driver2.name})`}
                          </span>
                        ) : (
                          <span className="text-neutral-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lap Time Delta Chart */}
          <div className="bg-neutral-900/70 rounded-xl border border-neutral-700/80 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  Lap-by-Lap Delta ({comparison.driver1.name} vs {comparison.driver2.name})
                </h4>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Negative values = {comparison.driver1.name} faster | Positive values = {comparison.driver2.name} faster
                </p>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparison.lapDeltas} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis
                    dataKey="lapNumber"
                    stroke="#666"
                    tick={{ fill: '#888', fontSize: 10 }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#666"
                    tick={{ fill: '#888', fontSize: 10 }}
                    tickLine={false}
                    tickFormatter={(val) => `${val > 0 ? '+' : ''}${val.toFixed(1)}s`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#171717', borderColor: '#444', borderRadius: '6px' }}
                    labelStyle={{ color: '#888', fontSize: '11px', marginBottom: '4px' }}
                    formatter={(value: any, name: any, item: any) => {
                      const delta = parseFloat(value);
                      const isClean = item.payload.isCleanComparison;
                      return [
                        `${delta > 0 ? '+' : ''}${delta.toFixed(3)}s ${!isClean ? '(Neutralized/Pit)' : ''}`,
                        'Lap Delta',
                      ];
                    }}
                  />
                  <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="deltaSeconds"
                    stroke="#E10600"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#E10600' }}
                    activeDot={{ r: 6, fill: '#fff', stroke: '#E10600' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { SEASONS } from '../constants';
import { Driver, Race } from '../types';

interface HeaderProps {
  currentSeason: string;
  setSeason: (s: string) => void;
  currentRace: Race | null;
  setRace: (r: Race) => void;
  currentDriver: Driver | null;
  setDriver: (d: Driver) => void;
  races: Race[];
  drivers: Driver[];
}

export const Header: React.FC<HeaderProps> = ({
  currentSeason,
  setSeason,
  currentRace,
  setRace,
  currentDriver,
  setDriver,
  races,
  drivers,
}) => {
  return (
    <header className="bg-neutral-900 border-b-4 border-red-600 shadow-xl sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
        
        {/* Branding */}
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-red-600 skew-x-[-15deg] flex items-center justify-center">
             <span className="text-white font-bold skew-x-[15deg]">F1</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tighter f1-font text-white">
            AI TELEMETRY <span className="text-red-500 text-sm font-normal ml-2">RACE EXPLAINER</span>
          </h1>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-center">
          
          <select 
            value={currentSeason} 
            onChange={(e) => setSeason(e.target.value)}
            className="bg-neutral-800 text-white border border-neutral-700 px-3 py-1.5 rounded text-sm focus:border-red-500 outline-none uppercase font-semibold tracking-wider"
          >
            {SEASONS.map(s => <option key={s} value={s}>{s} SEASON</option>)}
          </select>

          <select 
            value={currentRace?.id || ''} 
            onChange={(e) => {
              const r = races.find(race => race.id === e.target.value);
              if(r) setRace(r);
            }}
            className="bg-neutral-800 text-white border border-neutral-700 px-3 py-1.5 rounded text-sm focus:border-red-500 outline-none uppercase font-semibold tracking-wider"
            disabled={races.length === 0}
          >
            <option value="">Select Race</option>
            {races.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <select 
            value={currentDriver?.id || ''} 
            onChange={(e) => {
              const d = drivers.find(drv => drv.id === e.target.value);
              if(d) setDriver(d);
            }}
            className="bg-neutral-800 text-white border border-neutral-700 px-3 py-1.5 rounded text-sm focus:border-red-500 outline-none uppercase font-semibold tracking-wider min-w-[150px]"
            disabled={drivers.length === 0}
          >
            <option value="">Select Driver</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>
    </header>
  );
};
import React from 'react';
import { Driver, RaceResult } from '../types';

interface DriverCardProps {
  driver: Driver;
  result: RaceResult;
}

export const DriverCard: React.FC<DriverCardProps> = ({ driver, result }) => {
  const positionChange = result.gridPosition - result.finishPosition;
  const isGain = positionChange > 0;
  const isNeutral = positionChange === 0;

  return (
    <div className="bg-neutral-800/80 backdrop-blur-md rounded-lg p-6 border-l-4 overflow-hidden relative shadow-lg" style={{ borderColor: driver.teamColor }}>
      {/* Background Graphic */}
      <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-white/5 to-transparent skew-x-[-15deg] pointer-events-none" />
      
      <div className="flex items-start justify-between relative z-10">
        <div>
          <div className="text-5xl font-bold text-white/10 absolute -top-4 -left-2 font-mono">{driver.number}</div>
          <div className="text-xs text-neutral-400 font-bold uppercase tracking-widest mb-1">{driver.team}</div>
          <h2 className="text-3xl font-bold text-white f1-font uppercase">{driver.name}</h2>
          
          <div className="mt-6 grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">Start</div>
              <div className="text-2xl font-mono text-white">P{result.gridPosition}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wider">Finish</div>
              <div className="text-2xl font-mono text-white">P{result.finishPosition}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end">
            {/* Position Delta Indicator */}
            <div className={`mt-2 flex items-center gap-2 px-3 py-1 rounded text-sm font-bold ${isGain ? 'text-green-400 bg-green-400/10' : isNeutral ? 'text-gray-400 bg-gray-400/10' : 'text-red-400 bg-red-400/10'}`}>
                {isGain ? '▲' : isNeutral ? '-' : '▼'} 
                {Math.abs(positionChange)} POS
            </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center text-xs text-neutral-400">
        <span className="uppercase">Driver ID: {driver.id.substring(0,6)}</span>
        <span className="bg-neutral-700 text-white px-2 py-0.5 rounded text-[10px]">OFFICIAL TIMING</span>
      </div>
    </div>
  );
};
import React from 'react';
import { TyreStint } from '../types';

interface TyreStrategyProps {
  stints: TyreStint[];
}

export const TyreStrategy: React.FC<TyreStrategyProps> = ({ stints }) => {
  const totalLaps = stints[stints.length - 1].endLap;

  return (
    <div className="bg-neutral-800/80 backdrop-blur-md rounded-lg p-6 shadow-lg border border-neutral-700">
      <h3 className="text-lg font-bold text-white uppercase f1-font mb-4 flex items-center">
        <span className="w-2 h-2 bg-red-600 rounded-full mr-2 animate-pulse"></span>
        Tyre Strategy
      </h3>

      <div className="relative h-16 w-full flex rounded-md overflow-hidden bg-neutral-900 border border-neutral-600">
        {stints.map((stint, idx) => {
          const duration = stint.endLap - stint.startLap + 1;
          const widthPercentage = (duration / totalLaps) * 100;
          
          return (
            <div 
              key={idx}
              style={{ width: `${widthPercentage}%` }}
              className="h-full relative border-r border-neutral-900 group transition-all hover:brightness-110"
            >
              <div className="h-full w-full flex flex-col justify-center items-center relative z-10">
                {/* Tyre Stripe */}
                <div className="absolute top-0 w-full h-1.5" style={{ backgroundColor: stint.color }}></div>
                <div className="absolute bottom-0 w-full h-1.5" style={{ backgroundColor: stint.color }}></div>
                
                <span className="font-bold text-white uppercase text-xs sm:text-sm drop-shadow-md">
                    {stint.compound}
                </span>
                <span className="text-[10px] text-neutral-300">
                    L{stint.startLap}-L{stint.endLap}
                </span>
              </div>
              {/* Background Tint */}
              <div className="absolute inset-0 opacity-20" style={{ backgroundColor: stint.color }}></div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-3 flex justify-between text-xs text-neutral-500 font-mono">
        <span>LAP 1</span>
        <span>LAP {totalLaps}</span>
      </div>
    </div>
  );
};
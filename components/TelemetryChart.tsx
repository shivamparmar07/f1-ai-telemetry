import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { TelemetryPoint } from '../types';

interface TelemetryChartProps {
  data: TelemetryPoint[];
  driverName: string;
  driverColor: string;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ data, driverName, driverColor }) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-neutral-800/80 backdrop-blur-md rounded-lg p-6 shadow-lg border border-neutral-700 h-[400px] flex items-center justify-center">
        <p className="text-neutral-400">No telemetry data available</p>
      </div>
    );
  }

  return (
    <div className="bg-neutral-800/80 backdrop-blur-md rounded-lg p-6 shadow-lg border border-neutral-700 h-[400px]">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-white uppercase f1-font">Position Graph</h3>
        <div className="flex items-center gap-2 text-xs text-neutral-400">
             <span className="w-3 h-1" style={{backgroundColor: driverColor}}></span>
             {driverName}
        </div>
      </div>
      
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis 
                dataKey="lap" 
                stroke="#666" 
                tick={{fill: '#888', fontSize: 10}}
                tickLine={false}
                axisLine={false}
            />
            <YAxis 
                reversed 
                domain={[1, 20]} 
                stroke="#666" 
                tick={{fill: '#888', fontSize: 10}}
                tickLine={false}
                axisLine={false}
                width={30}
            />
            <Tooltip 
                contentStyle={{ backgroundColor: '#171717', borderColor: '#333', borderRadius: '4px' }}
                itemStyle={{ color: '#fff', fontSize: '12px' }}
                labelStyle={{ color: '#888', fontSize: '10px', marginBottom: '4px' }}
            />
            
            <Line 
                type="monotone" 
                dataKey="position" 
                stroke={driverColor} 
                strokeWidth={3} 
                dot={false} 
                activeDot={{ r: 6, fill: driverColor, stroke: '#fff' }}
                animationDuration={1500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
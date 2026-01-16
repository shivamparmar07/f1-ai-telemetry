import React from 'react';
import { AIAnalysisResult } from '../types';

interface AIAnalysisProps {
  analysis: AIAnalysisResult | null;
  loading: boolean;
}

export const AIAnalysis: React.FC<AIAnalysisProps> = ({ analysis, loading }) => {
  if (loading) {
    return (
      <div className="bg-neutral-800/80 backdrop-blur-md rounded-lg p-6 shadow-lg border-t-4 border-red-600 animate-pulse h-full">
        <div className="h-6 bg-neutral-700 w-1/3 mb-4 rounded"></div>
        <div className="space-y-3">
            <div className="h-4 bg-neutral-700 rounded w-full"></div>
            <div className="h-4 bg-neutral-700 rounded w-5/6"></div>
            <div className="h-4 bg-neutral-700 rounded w-4/6"></div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="bg-neutral-800/80 backdrop-blur-md rounded-lg p-6 shadow-lg border-t-4 border-red-600 h-full flex flex-col">
        <div className="flex justify-between items-start mb-6">
            <h3 className="text-xl font-bold text-white uppercase f1-font flex flex-col">
                AI Race Engineer
                <span className="text-[10px] text-neutral-400 font-normal tracking-wide">GEMINI POWERED ANALYSIS</span>
            </h3>
            <div className="flex flex-col items-end">
                <span className="px-2 py-0.5 bg-red-600/20 text-red-500 text-[10px] font-bold uppercase rounded border border-red-600/30 animate-pulse">
                    LIVE ANALYSIS
                </span>
            </div>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-neutral-900/50 p-3 rounded border border-neutral-700 text-center">
                <div className="text-xs text-neutral-400 uppercase mb-1">Driver Rating</div>
                <div className="text-3xl font-bold text-white f1-font">{analysis.rating}<span className="text-sm text-neutral-500">/10</span></div>
                <div className="flex justify-center gap-0.5 mt-1">
                    {[...Array(10)].map((_, i) => (
                        <div key={i} className={`h-1 w-2 rounded-sm ${i < analysis.rating ? 'bg-red-500' : 'bg-neutral-700'}`}></div>
                    ))}
                </div>
            </div>
            <div className="bg-neutral-900/50 p-3 rounded border border-neutral-700 text-center">
                <div className="text-xs text-neutral-400 uppercase mb-1">Pace Index</div>
                <div className="text-3xl font-bold text-white f1-font">{analysis.paceIndex}</div>
                <div className="w-full bg-neutral-700 h-1 mt-2 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full" style={{ width: `${analysis.paceIndex}%` }}></div>
                </div>
            </div>
        </div>

        {/* Narrative */}
        <div className="mb-6">
            <h4 className="text-xs font-bold text-neutral-300 uppercase mb-2 border-b border-neutral-700 pb-1">Summary</h4>
            <p className="text-sm text-neutral-300 leading-relaxed font-light">
                {analysis.summary}
            </p>
        </div>

        {/* Key Moment */}
        <div className="mb-6 bg-neutral-700/20 p-3 rounded border-l-2 border-yellow-500">
            <h4 className="text-xs font-bold text-yellow-500 uppercase mb-1">Defining Moment</h4>
            <p className="text-sm text-neutral-200 italic">"{analysis.keyMoment}"</p>
        </div>

        {/* Lists */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-auto">
            <div>
                <h4 className="text-xs font-bold text-green-500 uppercase mb-2">What Went Right</h4>
                <ul className="space-y-1">
                    {analysis.positives.map((item, i) => (
                        <li key={i} className="text-xs text-neutral-300 flex items-start">
                            <span className="text-green-500 mr-2">✓</span> {item}
                        </li>
                    ))}
                </ul>
            </div>
            <div>
                <h4 className="text-xs font-bold text-red-500 uppercase mb-2">Improvement Areas</h4>
                <ul className="space-y-1">
                    {analysis.negatives.map((item, i) => (
                        <li key={i} className="text-xs text-neutral-300 flex items-start">
                            <span className="text-red-500 mr-2">×</span> {item}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    </div>
  );
};
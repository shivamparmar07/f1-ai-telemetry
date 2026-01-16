import { GoogleGenAI, Type } from "@google/genai";
import { RaceResult, Driver, Race, AIAnalysisResult } from "../types";

// NOTE: This assumes process.env.API_KEY is available.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateRaceAnalysis = async (
  driver: Driver,
  race: Race,
  result: RaceResult
): Promise<AIAnalysisResult> => {
  
  // Construct a prompt context
  const contextData = {
    driver: driver.name,
    team: driver.team,
    race: race.name,
    circuit: race.circuitName,
    grid: result.gridPosition,
    finish: result.finishPosition,
    strategy: result.tyreStrategy.map(s => `${s.compound} (${s.endLap - s.startLap + 1} laps)`).join(' -> '),
  };

  const prompt = `
    You are an expert Formula 1 Race Engineer and Strategist. 
    Analyze the following race performance data and provide a summary.
    
    Data:
    - Driver: ${contextData.driver} (${contextData.team})
    - Race: ${contextData.race} at ${contextData.circuit}
    - Started: P${contextData.grid}
    - Finished: P${contextData.finish}
    - Strategy: ${contextData.strategy}
    
    Provide the output in strict JSON format matching the schema.
    For 'rating', give a score out of 10.
    For 'paceIndex', give a score out of 100 based on consistency and speed relative to result.
    For 'summary', write a concise, professional paragraph explaining the race narrative.
    For 'keyMoment', describe the single most critical event (overtake, pitstop, or error).
    For 'positives' and 'negatives', list 2-3 specific bullet points each.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Good balance of speed and reasoning for text
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            rating: { type: Type.NUMBER },
            paceIndex: { type: Type.NUMBER },
            keyMoment: { type: Type.STRING },
            positives: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            negatives: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["summary", "rating", "paceIndex", "keyMoment", "positives", "negatives"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AIAnalysisResult;
    } else {
      throw new Error("No response text from Gemini");
    }
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    // Fallback if API fails or key is missing
    return {
      summary: "Telemetry analysis unavailable. Please check API configuration.",
      rating: 0,
      paceIndex: 0,
      keyMoment: "Data unavailable",
      positives: [],
      negatives: []
    };
  }
};
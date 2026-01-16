# AI Telemetry - RaceExplainer

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

An advanced F1 telemetry analysis app powered by OpenF1 API and Google's Gemini AI. Get real-time race data, driver analysis, tyre strategies, and AI-powered insights.

**View your app in AI Studio:** https://ai.studio/apps/temp/1

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v16+)
- Gemini API key

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   - Open `.env.local` and set your Gemini API key:
     ```
     VITE_GEMINI_API_KEY=your_gemini_api_key_here
     ```

3. **Run the app:**
   ```bash
   npm run dev
   ```

This starts:
- **Backend:** Express server on `http://localhost:5000`
- **Frontend:** Vite on `http://localhost:5173` (or next available port)

---

## 🏗️ Architecture

### Overview

```
Frontend (React 19 + TypeScript)
    ↓ (HTTP REST + WebSocket)
Backend (Express.js)
    ↓ (Cached, rate-limited polling)
OpenF1 API (max 1 req/second)
```

### Why This Architecture?

**Problem:** Direct frontend API calls resulted in 429 rate-limiting errors
- 8 parallel requests per driver selection
- No caching, repeated requests
- Rapid burst traffic to OpenF1

**Solution:** Backend polling with rate limiting & caching
- ✅ 1 request per second to OpenF1 API
- ✅ In-memory cache with TTL (1hr static, 5min race data)
- ✅ WebSocket for real-time cache updates
- ✅ Exponential backoff retry logic

---

## 📊 Features

### Data Visualization
- **Position Graph** - Real-time driver position changes throughout race
- **Tyre Strategy** - Visualize compound changes and stint timing
- **Fastest Lap** - Extracted from real OpenF1 lap duration data
- **Pit Stops** - Count of actual pit stops during race

### AI Analysis
- Real-time race analysis using Google Gemini
- Performance ratings (1-10)
- Pace index calculation
- Key moments identification
- Positive/negative performance indicators

### Multi-Season Support
- 2025, 2024, 2023 F1 seasons
- Complete driver lineups
- All race sessions

### Data Accuracy
- Grid positions from Qualifying session results
- Position history correlated via timestamp matching
- Real lap times from OpenF1 data

---

## 🔧 API Endpoints

### Backend REST API

All endpoints include built-in caching and rate limiting.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/meetings/:year` | GET | Get all meetings for a season |
| `/api/sessions/:meetingKey` | GET | Get sessions for a meeting |
| `/api/drivers/:sessionKey` | GET | Get drivers in a session |
| `/api/session-results/:sessionKey` | GET | Get final results for session |
| `/api/grid/:sessionKey` | GET | Get starting grid positions |
| `/api/stints/:sessionKey/:driverNumber` | GET | Get tyre stints for driver |
| `/api/laps/:sessionKey/:driverNumber` | GET | Get lap data for driver |
| `/api/positions/:sessionKey/:driverNumber` | GET | Get position history for driver |
| `/health` | GET | Backend health check |

### WebSocket Connection

Frontend connects to `ws://localhost:5000` for real-time cache updates.

---

## 📁 Project Structure

```
.
├── public/
│   └── vite.svg
├── src/
│   ├── components/
│   │   ├── AIAnalysis.tsx          # AI insights display
│   │   ├── DriverCard.tsx          # Driver info panel
│   │   ├── Header.tsx              # Season/race/driver selector
│   │   ├── TelemetryChart.tsx      # Position graph visualization
│   │   └── TyreStrategy.tsx        # Tyre compound timeline
│   ├── services/
│   │   ├── backendService.ts       # API client for backend
│   │   ├── dataMapper.ts           # OpenF1 → App type mapping
│   │   └── geminiService.ts        # AI analysis service
│   ├── App.tsx                     # Main application
│   ├── constants.ts                # Teams, seasons, tyre colors
│   ├── index.tsx                   # Entry point
│   ├── types.ts                    # TypeScript interfaces
│   └── mockData.ts                 # Legacy mock data (for reference)
├── server.ts                       # Express backend with caching
├── openF1Poller.ts                 # Rate-limited request queue
├── cache.ts                        # TTL-based cache
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🔌 Backend Components

### server.ts - Express Backend
- Runs on port 5000
- REST API endpoints for all OpenF1 data
- WebSocket server for cache updates
- Request queue management

### openF1Poller.ts - Rate Limiter
- Sequential request processing (1 per second)
- Exponential backoff retry: 500ms → 1000ms → 2000ms
- 3 retry attempts per request
- Prevents 429 rate-limit errors

### cache.ts - In-Memory Cache
- TTL-based automatic expiration
- Cache keys: `{endpoint}_{params}`
- Default TTLs:
  - Static data: 3600 seconds (1 hour)
  - Race data: 300 seconds (5 minutes)

---

## 📊 Data Accuracy

### Grid Position
- **Source:** Qualifying session results
- **Fallback:** Starting grid endpoint
- **Default:** P20

### Position History
- **Method:** Timestamp-based correlation
- Position updates (has `date`) matched to laps (has `date_start`)
- Carries forward last known position for all laps

### Fastest Lap
- **Calculation:** Minimum lap_duration from all driver laps
- **Source:** OpenF1 laps endpoint
- **Format:** M:SS.mmm

### Pit Stops
- **Calculation:** Count of laps where `is_pit_out_lap` = true
- **Source:** OpenF1 laps endpoint

---

## ⚙️ Configuration

### Rate Limiting

Edit **openF1Poller.ts** to adjust request delays:

```typescript
const REQUEST_DELAY = 1000; // milliseconds between requests
```

Recommendations:
- **1000ms**: Conservative, safe (1 req/sec) - **RECOMMENDED**
- **500ms**: Moderate (2 req/sec)
- **200ms**: Aggressive (5 req/sec)

### Cache TTL

Edit **server.ts** endpoint handlers:

```typescript
// For static data (meetings, sessions)
cache.set(cacheKey, data, 3600); // 1 hour

// For race data (results, grid, telemetry)
cache.set(cacheKey, data, 300); // 5 minutes
```

### Environment Variables

```bash
# .env.local (development)
VITE_GEMINI_API_KEY=your_api_key_here
VITE_BACKEND_URL=http://localhost:5000

# Production should use absolute URLs
VITE_BACKEND_URL=https://api.yourdomain.com
```

---

## 🧪 Testing

### Health Check
```bash
curl http://localhost:5000/health
# Response: {"status":"ok","timestamp":1234567890}
```

### Verify API Connection
```bash
# Get 2025 season races
curl http://localhost:5000/api/meetings/2025
```

### Check WebSocket Connection
Open browser DevTools → Console and look for:
```
✓ Connected to backend WebSocket
```

---

## 🐛 Troubleshooting

### "429 Too Many Requests" Errors
- Increase `REQUEST_DELAY` in openF1Poller.ts
- Clear backend cache (restart server)
- Check OpenF1 API status

### Missing Data for Driver
- Grid position may not exist in Qualifying results
- Will default to P20
- Check browser console for errors

### Graph Shows All Position 20
- Hard refresh browser (Ctrl+Shift+R)
- Check that laps data is being fetched
- Verify timestamp correlation in DevTools

### Backend Not Connecting
- Ensure backend is running: `npm run dev`
- Check `VITE_BACKEND_URL` in environment
- Look for CORS errors in browser console

---

## 📦 Dependencies

### Frontend
- React 19
- TypeScript
- Vite
- Tailwind CSS
- Recharts (charting)

### Backend
- Express.js
- ws (WebSocket)
- tsx (TypeScript execution)
- CORS support

### APIs
- OpenF1 API (F1 telemetry data)
- Google Gemini API (AI analysis)

---

## 🎯 Current Features

✅ Real-time race telemetry from OpenF1 API  
✅ AI-powered race analysis with Gemini  
✅ Multi-season support (2025, 2024, 2023)  
✅ Rate-limited backend polling (no 429 errors)  
✅ In-memory caching with TTL  
✅ WebSocket real-time updates  
✅ Accurate grid positions from Qualifying  
✅ Position history with timestamp correlation  
✅ Real fastest lap calculation  
✅ Actual pit stop counting  
✅ Tyre strategy visualization  
✅ Driver performance ratings  

---

## 🔄 Data Flow Example

**User selects "Max Verstappen" in 2024 Bahrain race:**

1. Frontend requests laps: `GET /api/laps/9472/1`
2. Backend checks cache:
   - ❌ Cache miss
3. Backend adds to queue (1 req/sec)
4. After 1 second, backend fetches: `GET https://api.openf1.org/v1/laps?session_key=9472&driver_number=1`
5. Backend caches result (5-min TTL)
6. Frontend receives 57 laps with durations
7. App calculates fastest lap: `1:31.447`
8. App counts pit stops: `2`
9. WebSocket notifies other connected clients of cache update

---

## 📝 Notes

- OpenF1 API provides lap data but **not gap-to-leader metrics** (requires official FIA timing)
- Fastest lap is calculated from minimum lap_duration (excludes pit laps)
- Pit stops counted from `is_pit_out_lap` flag in lap data
- Position history fills gaps by carrying forward last known position

---

## 🤝 Support

For issues:
1. Check the troubleshooting section
2. Verify environment variables are set
3. Ensure both backend and frontend are running
4. Check browser console for specific errors
5. Verify OpenF1 API availability at https://api.openf1.org/v1

---

## 📄 License

MIT

# 🚀 Quick Start - Backend Polling Architecture

## What Changed?

Your app now has a **proper backend** that prevents rate limiting:

```
❌ BEFORE: Frontend → OpenF1 (8 requests, 200ms apart)
✅ AFTER:  Frontend → Backend (1 request/sec to OpenF1)
```

## Installation & Start

### 1️⃣ Install Dependencies
```bash
npm install
```

### 2️⃣ Start Everything
```bash
npm run dev
```

This automatically starts:
- **Backend**: http://localhost:5000 (Express + WebSocket)
- **Frontend**: http://localhost:5173 (React + Vite)

### 3️⃣ Open Browser
```
http://localhost:5173
```

You should see:
- ✅ "Connected to backend WebSocket" in console
- ✅ No more 429 rate-limit errors
- ✅ Data loads smoothly with caching

---

## How It Works

### Old Architecture (Broken ❌)
```
Frontend calls OpenF1 directly
  ↓
8 parallel API calls
  ↓
429 Too Many Requests error
  ↓
App crashes
```

### New Architecture (Fixed ✅)
```
Frontend makes HTTP request to backend
  ↓
Backend checks in-memory cache
  ↓
Cache hit? Return immediately
  ↓
Cache miss? Queue request (1 per second)
  ↓
Fetch from OpenF1 safely
  ↓
Cache result (5 min TTL)
  ↓
Return to frontend
  ↓
WebSocket broadcasts update to all clients
```

---

## Files Created

| File | Purpose |
|------|---------|
| `server.ts` | Express backend server (port 5000) |
| `cache.ts` | In-memory cache with TTL |
| `openF1Poller.ts` | Rate-limited request queue |
| `services/backendService.ts` | Frontend API client |
| `BACKEND_ARCHITECTURE.md` | Detailed documentation |

---

## Key Features

✅ **Rate Limiting**: 1 request/sec to OpenF1 (no 429 errors)  
✅ **Caching**: In-memory cache with automatic expiration  
✅ **Real-time**: WebSocket streaming for live updates  
✅ **Resilient**: Automatic retries with exponential backoff  
✅ **Scalable**: Easy to upgrade to Redis or database caching  

---

## Troubleshooting

### Backend won't start?
```bash
# Check if port 5000 is in use
npx kill-port 5000
npm run dev
```

### Still seeing 429 errors?
1. Backend needs time to start (wait 2-3 seconds)
2. Check backend console for errors
3. Verify OpenF1 API is responding

### Frontend can't connect to backend?
1. Make sure both backend AND frontend are running
2. Check browser console (F12) for WebSocket errors
3. Verify `http://localhost:5000/health` returns `{"status":"ok"}`

---

## Development

### Stop Everything
```bash
Ctrl+C (twice)
```

### Run Only Frontend (backend not needed)
```bash
npm run dev:frontend
```

### Run Only Backend (for testing)
```bash
npm run dev:backend
```

---

## Production Deployment

### Build Frontend
```bash
npm run build
```

### Deploy Backend
```bash
# Using heroku, render, railway, etc
# Set VITE_BACKEND_URL environment variable in frontend
```

### Environment Variable
```bash
# .env.production or hosting platform settings
VITE_BACKEND_URL=https://your-api.com
```

---

## Architecture Details

See [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) for:
- Detailed API endpoints
- Cache configuration
- Rate limiting settings
- Performance monitoring
- Production checklist

---

## Next Steps

1. ✅ Start with `npm run dev`
2. ✅ Test selecting different races/drivers
3. ✅ Open DevTools (F12) to see WebSocket messages
4. ✅ Check backend console for request logs
5. ✅ Verify no 429 errors occur

**That's it! Your app now handles rate limiting properly.** 🎉

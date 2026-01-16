# AI Telemetry — RaceExplainer

A Formula 1 telemetry analysis application built on the OpenF1 API.
The app reconstructs race data such as driver positions, grid order, pit stops, fastest laps, and tyre strategies, and presents them through interactive visualizations.

---

## 🚀 Quick Start

### Prerequisites

* Node.js (v16+)

### Installation

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**
   Create a `.env.local` file in the project root:

   ```bash
   VITE_BACKEND_URL=http://localhost:5000
   ```

3. **Run the app**

   ```bash
   npm run dev
   ```

This starts:

* **Backend:** [http://localhost:5000](http://localhost:5000)
* **Frontend:** [http://localhost:5173](http://localhost:5173) (or next available port)

---
## 🖼️ Screenshots

Screenshots showcasing key parts of the application UI and data visualizations.

<img width="1867" height="883" alt="image" src="https://github.com/user-attachments/assets/59dfcb63-0746-414c-bef3-dc712df1a425" />
<img width="1847" height="732" alt="image" src="https://github.com/user-attachments/assets/722a5324-8bb7-44ea-af7f-6b2e4099fb01" />
<img width="1857" height="881" alt="image" src="https://github.com/user-attachments/assets/8b0e577a-ebf6-48a5-9913-264cdfee15cb" />


## 🏗️ Architecture

### Overview

```
Frontend (React + TypeScript)
    ↓ HTTP (REST + WebSocket)
Backend (Express.js)
    ↓ Rate-limited polling + cache
OpenF1 API
```

### Why This Architecture?

**Problems**

* OpenF1 enforces strict rate limits
* Parallel frontend requests caused frequent `429 Too Many Requests`
* No shared cache between clients

**Solutions**

* Backend-controlled request queue
* Centralized in-memory caching with TTL
* WebSocket updates for real-time synchronization

**Benefits**

* Stable API usage
* Faster repeated requests
* Consistent data across all clients

---

## 📊 Features

### Telemetry & Race Data

* Driver position history
* Starting grid reconstruction
* Fastest lap calculation
* Pit stop counting
* Tyre compound and stint visualization

### Multi-Season Support

* 2025, 2024, 2023 seasons
* Complete driver lineups
* All race sessions

### Data Accuracy

* Grid positions derived from Qualifying results
* Timestamp-based position reconstruction
* Real lap durations from OpenF1

---

## 🔧 Backend API

All endpoints are cached and rate-limited.

| Endpoint                                   | Method | Description            |
| ------------------------------------------ | ------ | ---------------------- |
| `/api/meetings/:year`                      | GET    | Meetings for a season  |
| `/api/sessions/:meetingKey`                | GET    | Sessions for a meeting |
| `/api/drivers/:sessionKey`                 | GET    | Drivers in a session   |
| `/api/session-results/:sessionKey`         | GET    | Final session results  |
| `/api/grid/:sessionKey`                    | GET    | Starting grid          |
| `/api/stints/:sessionKey/:driverNumber`    | GET    | Tyre stints            |
| `/api/laps/:sessionKey/:driverNumber`      | GET    | Lap data               |
| `/api/positions/:sessionKey/:driverNumber` | GET    | Position history       |
| `/health`                                  | GET    | Health check           |

### WebSocket

Clients connect to:

```
ws://localhost:5000
```

Used for real-time cache update notifications.

---

## 📁 Project Structure

```
.
├── public/
├── src/
│   ├── components/
│   │   ├── DriverCard.tsx
│   │   ├── Header.tsx
│   │   ├── TelemetryChart.tsx
│   │   └── TyreStrategy.tsx
│   ├── services/
│   │   ├── backendService.ts
│   │   └── dataMapper.ts
│   ├── App.tsx
│   ├── constants.ts
│   ├── index.tsx
│   └── types.ts
├── server.ts
├── openF1Poller.ts
├── cache.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🔌 Backend Components

### server.ts

* Express server (port 5000)
* REST API endpoints
* WebSocket server
* Central request queue

### openF1Poller.ts

* Sequential request processing
* Configurable delay between requests
* Exponential backoff retries
* Prevents API throttling

### cache.ts

* In-memory cache with TTL
* Endpoint + parameter-based keys
* Automatic expiration

---

## 📊 Data Processing

### Grid Position

* Source: Qualifying results
* Fallback: Grid endpoint
* Default: P20

### Position History

* Timestamp-based correlation
* Carries forward last known position

### Fastest Lap

* Minimum lap duration across all laps
* Excludes pit anomalies

### Pit Stops

* Count of `is_pit_out_lap === true`

---

## ⚙️ Configuration

### Rate Limiting

In `openF1Poller.ts`:

```ts
const REQUEST_DELAY = 1000; // milliseconds
```

### Cache TTL

```ts
cache.set(key, data, 3600); // static data
cache.set(key, data, 300);  // race data
```

---

## 🧪 Testing

### Health Check

```bash
curl http://localhost:5000/health
```

### Verify API

```bash
curl http://localhost:5000/api/meetings/2025
```

### WebSocket

Browser console should show:

```
Connected to backend WebSocket
```

---

## 🐛 Troubleshooting

### 429 Errors

* Increase request delay
* Restart backend
* Verify OpenF1 API status

### Missing Driver Data

* Qualifying data may be unavailable
* Defaults applied automatically

### Flat Position Graph

* Hard refresh browser
* Verify laps endpoint response

---

## 📦 Dependencies

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* Recharts

### Backend

* Express.js
* ws
* tsx
* CORS

### Data Source

* OpenF1 API

---

## 📄 License

MIT

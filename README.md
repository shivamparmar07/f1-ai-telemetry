# 🏎️ AI Telemetry — RaceExplainer
### High-Performance Formula 1 Race Reconstruction, Concurrency & Race Intelligence Platform

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vitest](https://img.shields.io/badge/Tests-22%20Passed-FCC72B?logo=vitest&logoColor=black)](https://vitest.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An advanced Formula 1 race reconstruction and telemetry analysis platform built on top of the **OpenF1 API**. 

Moving far beyond simple data fetching, the system features a **chronological multi-stream race reconstruction engine**, a **hardened concurrency and caching layer** (SingleFlight coalescing, Bounded Semaphore, Circuit Breaker, Stale-While-Revalidate), **real-time p50/p95/p99 latency observability**, and an **empirical race intelligence module**.

---

## 🖼️ Application Preview

Screenshots showcasing key parts of the application UI and data visualizations:

<img width="1867" height="883" alt="image" src="https://github.com/user-attachments/assets/59dfcb63-0746-414c-bef3-dc712df1a425" />
<img width="1847" height="732" alt="image" src="https://github.com/user-attachments/assets/722a5324-8bb7-44ea-af7f-6b2e4099fb01" />
<img width="1857" height="881" alt="image" src="https://github.com/user-attachments/assets/8b0e577a-ebf6-48a5-9913-264cdfee15cb" />

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Client [Interactive Frontend - React 19 + TypeScript + Vite]
        UI_Telemetry[Single Driver Telemetry & AI]
        UI_Replay[Interactive Lap Replay & Overtake Log]
        UI_H2H[Head-to-Head Stint Pace Intelligence]
        UI_HUD[System Observability & Benchmark HUD]
    end

    subgraph Server [Backend Engine - Express.js + WebSocket]
        Router["/api/race-timeline<br/>/api/intelligence/comparison<br/>/api/metrics<br/>/api/benchmark"]
        
        subgraph ConcurrencyCore [Resilient Concurrency & Caching Core]
            SingleFlight[Request Coalescer - Singleflight]
            Semaphore[Bounded Concurrency Semaphore (Max 3)]
            Breaker[Circuit Breaker & 8s Abort Timeouts]
            APICache[(APICache - SWR + Monotonic LRU)]
        end
        
        subgraph Engines [Analytics & Intelligence Engines]
            ReconstructEngine[Race Reconstruction Engine]
            IntelligenceEngine[Race Intelligence & Pace Analytics]
            MetricsTracker[Reservoir Latency Quantiles (p50/p95/p99)]
        end
    end

    subgraph Upstream [External OpenF1 API Feeds]
        OpenF1["api.openf1.org/v1<br/>/laps, /position, /intervals, /stints, /pit, /race_control"]
    end

    Client -->|REST & WebSocket| Router
    Router --> ReconstructEngine
    Router --> IntelligenceEngine
    Router --> MetricsTracker

    ReconstructEngine --> ConcurrencyCore
    IntelligenceEngine --> ConcurrencyCore

    ConcurrencyCore --> APICache
    ConcurrencyCore --> SingleFlight
    SingleFlight --> Semaphore
    Semaphore --> Breaker
    Breaker -->|Exponential Backoff + Jitter| OpenF1
```

---

## ⚡ Key Highlights & Core Engineering Features

### 1. Chronological Race Reconstruction Engine (`services/raceReconstruction.ts`)
* **Multi-Stream Event Fusion:** Reconstructs the complete state of all 20 cars at every lap and millisecond boundary by correlating `/laps`, `/position`, `/intervals`, `/stints`, `/pit`, and `/race_control`.
* **Permutation-Based Overtaking Detection:** Compares ordered field permutations between Lap $L-1$ and Lap $L$. Accurately distinguishes **on-track passes** from **pit cycle overtakes** and **retirement gains**, automatically annotating active Safety Car (SC) or Virtual Safety Car (VSC) flags.
* **Explicit Data Confidence Audit:** Never invents fake telemetry or defaults. Points are strictly tagged with `MEASURED`, `INTERPOLATED`, or `MISSING`, providing transparency into timing feed drops.
* **Clean DNF Handling:** Drivers who retire (e.g. Hamilton on Lap 1) transition cleanly to `RETIRED` across all subsequent laps rather than persisting as phantom cars at P20.
* **Interactive Lap Scrubber ([RaceTimelineReplay.tsx](file:///c:/Users/shivam/Desktop/ai-telemetry-–-raceexplainer/components/RaceTimelineReplay.tsx)):** Includes 1x/2x/4x animated auto-playback, full-field leaderboard, live overtake feed, and track status indicators.

---

### 2. Robust Concurrency & Caching (`server/concurrency/`)
* **SingleFlight Request Coalescing ([SingleFlight.ts](file:///c:/Users/shivam/Desktop/ai-telemetry-–-raceexplainer/server/concurrency/SingleFlight.ts)):** Implements Go's classic `singleflight.Group` pattern in TypeScript. When 50 concurrent requests hit an uncached resource at the same instant, exactly **1** upstream fetch is triggered; all 50 share the resulting promise.
* **Bounded Concurrency Semaphore ([BoundedSemaphore.ts](file:///c:/Users/shivam/Desktop/ai-telemetry-–-raceexplainer/server/concurrency/BoundedSemaphore.ts)):** Enforces an upper limit (default: 3 concurrent requests) on outgoing upstream calls across different cache misses, queueing excess requests with FIFO fairness.
* **Exponential Backoff with Full Jitter & `Retry-After`:** Adheres strictly to upstream HTTP 429 `Retry-After` headers. Uses full randomized jitter to prevent cluster synchronization and immediately fails fast on permanent 4xx client errors without wasteful retries.
* **Stale-While-Revalidate (SWR) Engine ([cache.ts](file:///c:/Users/shivam/Desktop/ai-telemetry-–-raceexplainer/cache.ts)):** Delivers cached responses within 1ms during the stale window while asynchronously refreshing in the background. Features a monotonic `accessCounter` for strict LRU eviction regardless of system clock resolution.
* **Circuit Breaker ([CircuitBreaker.ts](file:///c:/Users/shivam/Desktop/ai-telemetry-–-raceexplainer/server/concurrency/CircuitBreaker.ts)):** Trips to `OPEN` after 5 consecutive failures, failing fast during cooldown, testing recovery via a `HALF_OPEN` canary, and wrapping requests in an 8-second hard timeout.

---

### 3. Real-Time Observability & Metrics (`server/metrics/metricsService.ts`)
* **Rolling Latency Quantiles:** Reservoir sampling calculating rolling **p50, p95, and p99** API response latencies.
* **Cache & Upstream Telemetry:** Live tracking of cache hit ratios (Fresh vs SWR), deduplicated request counts, and rolling 60-second upstream Requests Per Minute (RPM).
* **Live Instrumentation Endpoints:**
  * `GET /api/metrics`: Real-time JSON telemetry report.
  * `GET /api/benchmark?concurrency=50`: Interactive endpoint demonstrating 50 simultaneous requests coalesced into 1 upstream fetch with 98% deduplication.
  * `GET /api/circuit-status`, `POST /api/circuit/trip`, `POST /api/circuit/reset`.
* **System Observability HUD ([SystemObservability.tsx](file:///c:/Users/shivam/Desktop/ai-telemetry-–-raceexplainer/components/SystemObservability.tsx)):** Live frontend dashboard with latency gauges, cache efficiency meters, and a 1-click benchmark runner.

---

### 4. Empirical Race Intelligence (`services/raceIntelligence.ts`)
* **Clean Stint Pace:** Automatically filters out pit in-laps, pit out-laps, Safety Car, and yellow flag laps to calculate true raw car pace and variance.
* **Tyre Degradation Slope:** Linear regression computing pace degradation (seconds lost per lap of tyre age) across Soft, Medium, and Hard compounds.
* **Head-to-Head Pace Comparison ([DriverComparison.tsx](file:///c:/Users/shivam/Desktop/ai-telemetry-–-raceexplainer/components/DriverComparison.tsx)):** Dual-driver comparison showing stint pace deltas, tyre age comparisons, and an interactive Recharts lap-delta graph.
* **Pit Out-Lap Performance:** Stationary service time vs pit lane traversal, out-lap performance deltas, and undercut/overcut detection.
* **Event-Attributed Position Changes:** Correlates major position swings with race control incidents and pit stops.

---

## 🚀 Quick Start

### Prerequisites
* **Node.js** (v18+ or v20+)
* **npm** (v9+)

### Installation & Local Run

1. **Clone and install dependencies**:
   ```bash
   git clone https://github.com/shivamparmar07/f1-ai-telemetry.git
   cd f1-ai-telemetry
   npm install
   ```

2. **Configure environment**:
   Create a `.env.local` file in the project root:
   ```env
   VITE_BACKEND_URL=http://localhost:5000
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Start the application**:
   ```bash
   npm run dev
   ```
   * **Frontend UI:** [http://localhost:3000](http://localhost:3000) (or next available port)
   * **Backend API & Metrics:** [http://localhost:5000](http://localhost:5000)

---

## 🧪 Testing Suite (Vitest)

The project includes an automated test suite verifying concurrency race conditions, upstream failure recovery, and reconstruction logic.

```bash
npm test
```

### Test Coverage Summary:
```text
 ✓ tests/concurrencyAndCache.test.ts (10 tests)
   • SingleFlight coalescing 50 concurrent requests into 1 execution
   • In-flight promise cleanup & error propagation
   • Bounded semaphore concurrency limits
   • Circuit breaker trip, fail-fast, cooldown, and canary healing
   • Request timeouts & AbortController cancellation
   • 429 Retry-After header parsing and exponential backoff
   • Non-retryable 4xx client error immediate failure
   • SWR stale response serving + background revalidation
   • Strict LRU capacity eviction
 ✓ tests/raceReconstruction.test.ts (5 tests)
   • Lap-by-lap timeline with leader & intervals
   • On-track overtake detection & VSC context
   • Clean DNF handling (no phantom P20)
   • Pit stop compound transitions
   • Data quality audit metrics
 ✓ tests/raceIntelligence.test.ts (3 tests)
   • Outlier filtering: excluding pit in/out & SC laps from clean pace
   • Head-to-head lap deltas and overall pace advantage
   • Grid-to-finish position deltas
 ✓ tests/apiEndpoints.test.ts (4 tests)
   • /api/metrics latency quantiles and cache stats
   • /api/circuit-status trip and reset controls
   • /api/benchmark verifying SingleFlight coalescing
   • /health endpoint check

 Test Files  4 passed (4)
      Tests  22 passed (22)
```

---

## 🔧 Backend REST API Reference

All endpoints are protected by the Bounded Semaphore, SingleFlight Coalescer, and SWR APICache.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/race-timeline/:sessionKey` | `GET` | **Full multi-driver reconstructed race timeline** with overtakes, pit stops, and flags |
| `/api/intelligence/comparison/:sessionKey/:d1/:d2` | `GET` | **Head-to-head stint pace**, lap deltas, and tyre degradation slopes between two drivers |
| `/api/intelligence/summary/:sessionKey` | `GET` | Biggest gainers/losers, pit performance, and event attribution |
| `/api/metrics` | `GET` | **Real-time observability report**: p50/p95/p99 latencies, cache hit ratio, upstream RPM |
| `/api/benchmark?concurrency=50` | `GET` | Live concurrency stress-test proving SingleFlight request coalescing |
| `/api/circuit-status` | `GET` | Circuit breaker status (`CLOSED`, `OPEN`, `HALF_OPEN`) |
| `/api/circuit/trip` | `POST` | Force-trip circuit breaker to test fail-fast behavior |
| `/api/circuit/reset` | `POST` | Reset circuit breaker to normal operational state |
| `/api/meetings/:year` | `GET` | Race calendar meetings for a season |
| `/api/sessions/:meetingKey` | `GET` | Sessions (Practice, Qualifying, Sprint, Race) for a meeting |
| `/api/drivers/:sessionKey` | `GET` | Driver roster with headshots and team colors |
| `/api/session-results/:sessionKey`| `GET` | Official classification standings |
| `/api/grid/:sessionKey` | `GET` | Starting grid positions |
| `/api/stints/:sessionKey/:driverNumber?` | `GET` | Tyre compound stints |
| `/api/laps/:sessionKey/:driverNumber?` | `GET` | Lap times, sector durations, and speeds |
| `/api/positions/:sessionKey/:driverNumber?` | `GET` | Raw position samples |
| `/health` | `GET` | System health check and circuit state |

### WebSocket Streaming
Clients connect to:
```text
ws://localhost:5000
```
Broadcasts real-time cache updates (`timeline_reconstructed`, `sessions`, `stints`) and periodic system metric snapshots.

---

## 🐳 Docker & AWS EC2 Deployment

The project is containerized for deployment on **AWS EC2** using a multi-stage Docker build that compiles the React frontend and serves it directly via the high-performance Express server.

### Deploying to EC2

1. **SSH into your EC2 instance**:
   ```bash
   ssh -i "your-key.pem" ubuntu@<YOUR-EC2-PUBLIC-IP>
   ```

2. **Pull the latest code**:
   ```bash
   cd f1-ai-telemetry
   git pull origin main
   ```

3. **Build & run the Docker container**:
   ```bash
   # Stop previous container if running
   docker stop f1-ai-telemetry || true && docker rm f1-ai-telemetry || true

   # Build container image
   docker build -t f1-ai-telemetry .

   # Run container mapped to port 80
   docker run -d \
     --name f1-ai-telemetry \
     --restart always \
     -p 80:5000 \
     -e PORT=5000 \
     -e GEMINI_API_KEY="your_api_key_here" \
     f1-ai-telemetry
   ```

4. **Verify container logs**:
   ```bash
   docker logs -f f1-ai-telemetry
   ```

---

## 💡 System Design & Technical Interview Topics

This project was engineered to solve real distributed systems and concurrency challenges:

1. **Thundering Herd & Request Coalescing:**
   * *Problem:* When a session starts, 50 client requests for the same uncached driver stint would trigger 50 upstream calls, immediately exhausting OpenF1 rate limits.
   * *Solution:* SingleFlight deduplication registers an in-flight Promise for the cache key. All concurrent callers share the exact same promise, reducing 50 upstream calls to 1.
2. **Resource Exhaustion & Concurrency Bounds:**
   * *Problem:* Multiple distinct cache misses requested at once could flood upstream with 10-20 parallel requests.
   * *Solution:* Bounded Semaphore caps concurrent outbound requests to 3, queueing excess tasks with FIFO fairness.
3. **Resilience & Fault Tolerance:**
   * *Problem:* Intermittent 429 rate limits or upstream stalls can block the Node.js event loop.
   * *Solution:* Full jitter exponential backoff with `Retry-After` adherence, paired with an 8-second hard timeout Circuit Breaker that fails fast during sustained outages.
4. **Data Integrity Over Default Falsification:**
   * *Problem:* Naive telemetry mappers default missing values to position 20 or gap 0, producing flat lines and phantom cars.
   * *Solution:* Multi-stream timestamp normalization, confidence tagging (`MEASURED`, `INTERPOLATED`, `MISSING`), and explicit DNF status handling.

---

## 📦 Tech Stack

* **Frontend:** React 19, TypeScript, Vite, Recharts, Tailwind CSS
* **Backend:** Express.js, WebSockets (`ws`), tsx, Node.js v20+
* **Testing:** Vitest
* **Deployment:** Docker, AWS EC2
* **Data Sources:** OpenF1 API, Google Gemini AI

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).

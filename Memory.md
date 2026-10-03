# Roundtable Project Memory & Implementation Record

## 1. Overview & System Purpose
Roundtable converts multiple nearby personal devices (phones, laptops, tablets) placed on a conference table into a distributed acoustic fusion mesh. Rather than relying on a single distant conference mic or running uncoordinated duplicate speech recognizers on every phone, Roundtable ingests synchronized 16 kHz PCM audio streams across all devices, performs real-time speech transcription via Gemini Live (with acoustic fallback), runs evidence fusion to suppress acoustic duplicate echoes, detects simultaneous speaker overlaps, and renders a single unified evolving transcript stream with hardware-attributed speaker identities.

---

## 2. Implemented Features (Verified Working)

### Backend (Python FastAPI)
- **FastAPI Core & Endpoints**:
  - `GET /health`: Service health check, model version, and Gemini status.
  - `POST /api/sessions`: Creates a real room with a single host participant, custom or 5-character readable join code (excluding ambiguous chars `0/O/1/I`), empty initial transcript, and real telemetry metrics.
  - `GET /api/sessions/{session_id_or_code}`: Resolves session by either session ID or join code.
  - `POST /api/sessions/{session_id_or_code}/join`: Enables multi-device joins with distinct `participant_id`, `device_id`, `display_name`, and connection state.
  - `POST /api/sessions/{session_id}/start`: Transitions session to `LIVE`.
  - `POST /api/sessions/{session_id}/stop`: Gracefully stops session and finalizes telemetry.
  - `GET /api/sessions/{session_id}/evaluation`: Delivers real measured metrics, decision logs, and acoustic breakdown.
- **WebSocket Transport (`/ws/sessions/{session_id}/{participant_id}`)**:
  - Binary frames: Ingests 16 kHz mono signed 16-bit PCM chunks directly from client microphones.
  - Text frames: Ingests control messages (`MIC_STARTED`, `MIC_STOPPED`, `PING`, etc.).
  - Session Synchronization: Emits initial `SESSION_SYNC` payload on connect.
  - Live Broadcasting: Emits provider-neutral events (`PARTICIPANT_JOINED`, `PARTICIPANT_LEFT`, `PARTICIPANT_RECONNECTED`, `DEVICE_QUALITY_CHANGED`, `CAPTION_CREATED`, `CAPTION_UPDATED`, `CAPTION_FINAL`, `OVERLAP_DETECTED`).
- **Real Audio Analysis (`backend/audio/quality.py`)**:
  - Direct time-domain RMS calculation: `sqrt(sum(sample**2) / N)`.
  - Genuine clipping ratio measurement: samples exceeding peak threshold `|sample| >= 32700`.
  - Honest tier classification: `GOOD`, `FAIR`, `POOR`, `OFFLINE` with numerical score `0-100`. (No fake SNR claims).
- **Speech Provider Layer (`backend/speech/`)**:
  - Abstract base interface: `SpeechProvider` with `open_session`, `send_audio`, `close_session`.
  - `GeminiLiveSpeechProvider`: Connects bidirectional streaming session via Google GenAI SDK (`google.genai.Client`) with model `gemini-2.0-flash`.
  - Resilient Fallback: If `GEMINI_API_KEY` is not configured or in an offline sandbox, falls back cleanly to local acoustic VAD speech provider keyed to actual microphone energy so the entire pipeline runs without external blockers.
  - `SpeechNormalizer`: Strips markdown, quotes, prompt echoes, and calculates word set similarity.
- **Practical Multi-Device Fusion (`backend/fusion/`)**:
  - **In-Place Segment Revision**: `SegmentTracker` tracks active provisional segments per speaker. Successive speech updates edit the same `segment_id` in-place (`CAPTION_UPDATED`), avoiding duplicate transcript rows.
  - **Duplicate Echo Suppression (`backend/fusion/dedupe.py`)**: Evaluates utterances across nearby devices within a rolling temporal window (`DUPLICATE_TIME_WINDOW_MS = 2500ms`) using sequence similarity (`DUPLICATE_SIMILARITY_THRESHOLD = 0.70`). Suppresses cross-device room reflections, attributes to primary observation, increments corroboration counter, and writes real decision log.
  - **Simultaneous Overlap Detection (`backend/fusion/overlap.py`)**: Detects distinct concurrent speakers within `OVERLAP_TIME_WINDOW_MS = 1800ms`. Generates `overlapGroupId`, sets `overlap=True`, and broadcasts `OVERLAP_DETECTED`.
  - **Categorical Confidence Estimator (`backend/fusion/confidence.py`)**: Determines `high`, `medium`, or `low` confidence using acoustic RMS quality, corroboration count, and finality.
  - **Real Decision Logging**: Logs timestamp, involved devices, text snippet, similarity rating, and rationale to the session's ledger.
- **Heartbeat & Reconnect Resilience (`backend/realtime/heartbeat.py`)**:
  - Automatic detection of connection dropouts.
  - Marks participant as `TEMPORARILY_LOST` if no traffic received within 35s.
  - When client reconnects with the same `participant_id`, identity and spatial geometry are restored.

### Frontend (Vite + React + TypeScript + Tailwind CSS)
- **Real Browser Microphone Pipeline (`src/lib/audio/microphone.ts`)**:
  - Clean `getUserMedia` stream acquisition with echo cancellation, noise suppression, and auto-gain control.
  - Direct downsampling from browser input sample rate (44.1 kHz / 48 kHz) to 16,000 Hz mono PCM16 buffer.
  - True time-domain RMS calculation using `Float32Array` buffer analysis (fixed former frequency-bin average bug).
  - True hardware muting: when muted, disables tracks and ceases audio chunk transmission over the network.
- **Realtime Client (`src/lib/realtime/client.ts`)**:
  - Manages WebSocket lifecycle, ping heartbeat, and exponential reconnection.
  - Streams binary PCM16 chunks to `/ws/sessions/{sessionId}/{participantId}`.
- **Real Scannable QR Code (`src/components/JoinCodeModal.tsx`)**:
  - Replaced former pseudo-matrix with real `qrcode` generation encoding the full room join URL (`?room=CODE`). Scannable by any mobile camera.
- **Mode Separation (LIVE vs DEMO)**:
  - Clear visual badge and toggle in `RoomHeader`: `LIVE MODE (Mesh)` vs `DEMO MODE (Sim)`.
  - Live Mode: Powered strictly by real devices, real WebSocket audio transport, real fusion, and genuine measured telemetry.
  - Demo Mode: Rich scripted multi-turn conversational scenario for demonstration fallbacks.
- **Watertight Component State Updates**:
  - Converted `LiveRoomPage` updates to functional state updates `(prev => ...)`, completely eliminating the stale closure state clobbering bug.
  - Fixed interval cleanup leak in `AudioCheckModal`.
- **Honest Evaluation & Telemetry (`src/pages/EvaluatePage.tsx`)**:
  - Displays real measured median and P95 latency (or "Not measured" if no speech turns recorded yet).
  - Clearly labels theoretical comparative benchmarks: *"Illustrative demo scenario · Not an experimental measurement"*.
  - Renders live decision logs from backend in Live Mode.

---

## 3. Architecture Actually Used
```text
Browser Client A (Host)          Browser Client B (Mobile Phone)
  [Microphone / 16kHz PCM]         [Microphone / 16kHz PCM]
            │                                 │
            ▼                                 ▼
   WebSocket Binary                  WebSocket Binary
            │                                 │
            └──────────────┬──────────────────┘
                           ▼
               FastAPI WebSocket Endpoint
          (/ws/sessions/{session_id}/{participant_id})
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
       Audio Router               Speech Provider
    (RMS, Quality, VAD)      (Gemini Live / Acoustic VAD)
             │                           │
             └─────────────┬─────────────┘
                           ▼
                  Fusion Engine
        ├── Deduplication (Echo Suppression)
        ├── Overlap Detection (Concurrent Speakers)
        ├── In-Place Segment Revision
        └── Telemetry & Decision Logging
                           │
                           ▼
               Realtime Manager Broadcast
        (CAPTION_CREATED / UPDATED / FINAL,
         DEVICE_QUALITY_CHANGED, OVERLAP_DETECTED)
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
     Browser Client A            Browser Client B
  [LiveTranscript Render]     [LiveTranscript Render]
```

---

## 4. Current Environment Setup & Running Commands

### Prerequisites
- Node.js (v18+)
- Python 3.11+ (Python 3.14 tested and verified)

### Python Backend Setup & Run
```powershell
# 1. Install backend dependencies
pip install -r requirements.txt

# 2. Run FastAPI Backend (runs on http://localhost:8000)
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend Setup & Run
```powershell
# 1. Install frontend dependencies
npm install

# 2. Run Vite Frontend (runs on http://localhost:3000, proxies /api and /ws to backend)
npm run dev
```

### Automated End-to-End Verification Test
```powershell
python test_system.py
```
*Validates health check, host creation, multi-client joining, 16kHz PCM transmission, caption broadcasting, simultaneous speech overlap isolation, disconnect detection, reconnect restoration, and telemetry logging.*

---

## 5. What is Real vs Demo / Simulated

| Feature | In Live Mode | In Demo Mode |
|---|---|---|
| Room Sessions | Real FastAPI server in-memory room | In-memory mock session |
| Audio Capture | Real browser mic downsampled to 16 kHz PCM16 | Scripted audio levels |
| Realtime Transport | Real WebSockets (`ws://...`) | React interval timers |
| Speech Engine | Real Gemini Live API (or local VAD fallback) | Scripted turn script |
| Fusion Engine | Real dedupe & overlap detection algorithms | Scripted turns |
| Telemetry & Latencies | Real measured clock latencies ("Not measured" if 0) | Benchmark figures |
| QR Code | Real scannable QR code encoding actual join URL | Real scannable QR code |

---

## 6. Known Limitations
1. In environments without an active `GEMINI_API_KEY` or without external internet access to Google GenAI live endpoints, the system gracefully operates in acoustic VAD transcription mode. To enable full Gemini Live transcription, provide `GEMINI_API_KEY="AIzaSy..."` in `.env` or system environment.
2. The in-memory store persists sessions for the duration of the server process. If the server process restarts, rooms are re-created cleanly.

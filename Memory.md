# Roundtable Project Memory & Implementation Record

## 1. Overview & System Purpose
Roundtable converts multiple nearby personal devices (phones, laptops, tablets) placed on a conference table into a distributed acoustic fusion mesh. Rather than relying on a single distant conference mic or running uncoordinated duplicate speech recognizers on every phone, Roundtable ingests synchronized 16 kHz mono PCM16 audio streams across all devices, performs real-time speech transcription via Gemini Live (using `inputAudioTranscription`), runs evidence fusion to suppress acoustic duplicate echoes, detects simultaneous speaker overlaps, tracks concurrent conversation threads with rolling AI summaries, and renders a single unified evolving transcript stream with hardware-attributed speaker identities and corroborating device counts.

---

## 2. Implemented Features (Verified Working)

### Backend (Python FastAPI)
- **FastAPI Core & Endpoints (`backend/routes/`)**:
  - `GET /health`: Service health check, model version (`gemini-3.5-transcribe-live`), and Gemini client status.
  - `POST /api/sessions`: Creates a real room with a single host participant, 5-character readable join code (excluding ambiguous chars `0/O/1/I`), empty initial transcript, and real telemetry metrics.
  - `GET /api/sessions/{session_id_or_code}`: Resolves session by either session ID or join code.
  - `POST /api/sessions/{session_id_or_code}/join`: Enables multi-device joins with distinct `participant_id`, `device_id`, `display_name`, and connection state.
  - `POST /api/sessions/{session_id}/pause`: Real room pause; broadcasts `SESSION_PAUSED` and freezes capture.
  - `POST /api/sessions/{session_id}/resume`: Resumes paused room; broadcasts `SESSION_RESUMED`.
  - `POST /api/sessions/{session_id}/stop`: Gracefully stops session and finalizes telemetry snapshot.
  - `GET /api/sessions/{session_id}/evaluation`: Delivers real measured metrics, decision logs, and acoustic breakdown.
- **WebSocket Transport (`/ws/sessions/{session_id}/{participant_id}`)**:
  - Binary frames: Ingests 16 kHz mono signed 16-bit PCM chunks directly from client microphones.
  - Text frames: Ingests control messages (`MIC_STARTED`, `MIC_STOPPED`, `SESSION_PAUSED`, `SESSION_RESUMED`, `SESSION_STOPPED`, `SPEECH_CHUNK`, `PING`).
  - Session Synchronization: Emits initial `SESSION_SYNC` payload on connect.
  - Live Broadcasting: Emits provider-neutral events (`PARTICIPANT_JOINED`, `PARTICIPANT_LEFT`, `PARTICIPANT_RECONNECTED`, `DEVICE_QUALITY_CHANGED`, `CAPTION_CREATED`, `CAPTION_UPDATED`, `CAPTION_FINAL`, `OVERLAP_DETECTED`, `SESSION_PAUSED`, `SESSION_RESUMED`, `CONVERSATION_THREADS_UPDATED`).
- **Real Audio Analysis (`backend/audio/quality.py`)**:
  - Direct time-domain RMS calculation: `sqrt(sum(sample**2) / N)`.
  - Genuine clipping ratio measurement: samples exceeding peak threshold `|sample| >= 32700`.
  - Honest tier classification: `GOOD`, `FAIR`, `POOR`, `OFFLINE` with numerical score `0-100`.
- **Speech Provider Layer (`backend/speech/gemini_live.py`)**:
  - `GeminiLiveSpeechProvider`: Connects bidirectional streaming session via Google GenAI SDK (`google.genai.Client`) with model `gemini-3.5-transcribe-live` (configured with `input_audio_transcription=types.AudioTranscriptionConfig()`).
  - Streams binary chunks with `live_session.send_realtime_input(audio=types.Blob(data=pcm_data, mime_type="audio/pcm;rate=16000"))`.
  - Ingestion loop processes `server_content.input_transcription` and `interim_input_transcription` events for low latency.
  - No fake phrase fabrication: If Gemini Live is unavailable or key is unconfigured, zero fake text is generated. Relies on explicitly labeled `LOCAL_FALLBACK` from browser speech.
- **Multi-Device Evidence Fusion (`backend/fusion/`)**:
  - **In-Place Segment Revision**: `SegmentTracker` tracks active provisional segments per speaker. Successive speech updates edit the same `segment_id` in-place (`CAPTION_UPDATED`), avoiding duplicate transcript rows.
  - **Multi-Device Corroboration & Echo Suppression (`backend/fusion/dedupe.py`)**: Evaluates utterances across nearby devices within a rolling temporal window (`DUPLICATE_TIME_WINDOW_MS = 2500ms`) using sequence similarity (`DUPLICATE_SIMILARITY_THRESHOLD = 0.70`). Attributes transcript to clearest RMS observation, tracks list of corroborating device IDs, increments corroboration counter (`X devices corroborating`), and logs decision.
  - **Simultaneous Overlap Detection (`backend/fusion/overlap.py`)**: Detects distinct concurrent speakers within `OVERLAP_TIME_WINDOW_MS = 1800ms`. Generates `overlapGroupId`, sets `overlap=True`, and broadcasts `OVERLAP_DETECTED`.
  - **Categorical Confidence Estimator (`backend/fusion/confidence.py`)**: Determines `high`, `medium`, or `low` confidence using acoustic RMS quality, corroboration count, and finality.
  - **Conversation Threading & Side Discussions (`backend/fusion/threading.py`)**: Groups segments into `MAIN_CONVERSATION`, `SIDE_CONVERSATION`, `OVERLAP`, and `UNKNOWN` based on temporal proximity, speaker continuity, and topic similarity.
  - **Rolling Summaries (`backend/fusion/summarizer.py`)**: Asynchronously generates concise, factual 1-sentence rolling summaries of concurrent side discussions using fast Gemini model (`gemini-2.5-flash`), batching finalized segments.
- **Heartbeat & Reconnect Resilience (`backend/realtime/heartbeat.py`)**:
  - Automatic detection of connection dropouts.
  - Marks participant as `TEMPORARILY_LOST` if no traffic received within 35s.
  - When client reconnects with the same `participant_id`, identity and spatial geometry are restored.

### Frontend (Vite + React + TypeScript + Tailwind CSS)
- **Real Browser Microphone Pipeline (`src/lib/audio/microphone.ts`)**:
  - Clean `getUserMedia` stream acquisition with echo cancellation, noise suppression, and auto-gain control.
  - Downsampling from browser input sample rate (44.1 kHz / 48 kHz) to 16,000 Hz mono PCM16 buffer.
  - True time-domain RMS calculation using `Float32Array` buffer analysis.
  - True hardware muting: when muted, disables tracks and ceases audio chunk transmission over the network.
  - Mute and Session Pause cleanly suppress audio transmission and speech processing.
- **Realtime Client (`src/lib/realtime/client.ts`)**:
  - Manages WebSocket lifecycle, ping heartbeat, and exponential reconnection.
  - Streams binary PCM16 chunks to `/ws/sessions/{sessionId}/{participantId}`.
  - Handles `SESSION_PAUSED`, `SESSION_RESUMED`, `CONVERSATION_THREADS_UPDATED`.
- **UI Components & Aesthetics**:
  - Editorial `#FFEDBF` warm palette and typography preserved.
  - `RoomHeader`: Displays `STATUS` (LIVE / PAUSED), active `ENGINE` (`GEMINI LIVE` or `LOCAL FALLBACK`), room code, timer, and controls.
  - `CaptionSegmentItem`: Displays speaker, source device, timestamp, status (`provisional`, `refined`, `final`), engine tag, and `X devices corroborating` badge.
  - `ConversationThreadsCard`: Displays concurrent side conversations and rolling summaries without cluttering the main transcript.
  - `RoundtableVisualizer`: Physical table geometry and active speaker node map.
  - `LatencyIndicator` & `SessionStats`: Latency breakdown and telemetry metrics.
- **Concluded Session & Evaluation Flow**:
  - `handleEndSession()`: Marks session as `STOPPED`, archives to localStorage, preserves session snapshot, and immediately navigates to `EvaluatePage`.
  - `EvaluatePage`: Accessible during LIVE (via "Acoustic Telemetry" button) and after session ends. Handles 0 events cleanly with friendly empty states. Displays connected nodes, median/P95 latencies, in-place revisions, overlaps, decision ledger, and JSON export.
- **Landing Page Refinement**:
  - Removed "Previous Sessions" from hero CTA and footer. Focuses on Create Session, Join Session, and How Roundtable Works.

---

## 3. Architecture Actually Used
```text
Browser Device A (Host)          Browser Device B (Mobile)        Browser Device C (Mobile)
  [Microphone / 16kHz PCM]         [Microphone / 16kHz PCM]         [Microphone / 16kHz PCM]
            │                                │                                │
            ▼                                ▼                                ▼
     WebSocket Binary                 WebSocket Binary                 WebSocket Binary
            │                                │                                │
            └────────────────────────────────┼────────────────────────────────┘
                                             ▼
                               FastAPI WebSocket Endpoint
                      (/ws/sessions/{session_id}/{participant_id})
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼                                           ▼
                 Audio Router                               Speech Provider
              (RMS, Quality, VAD)                     (Gemini Live inputAudioTranscription)
                       │                                           │
                       └─────────────────────┬─────────────────────┘
                                             ▼
                                    Evidence Fusion Engine
                         ├── Cross-Device Corroboration & Dedupe
                         ├── Speaker Attribution (Highest RMS observation)
                         ├── Simultaneous Overlap Detection
                         ├── In-Place Segment Revision
                         └── Conversation Threading & Rolling Summaries
                                             │
                                             ▼
                                 Realtime Manager Broadcast
                          ├── CAPTION_CREATED / UPDATED / FINAL (with corroboratingDevices)
                          ├── CONVERSATION_THREADS_UPDATED (Side conversations & summaries)
                          ├── SESSION_PAUSED / SESSION_RESUMED
                          ├── DEVICE_QUALITY_CHANGED
                          └── OVERLAP_DETECTED
                                             │
                       ┌─────────────────────┼─────────────────────┐
                       ▼                     ▼                     ▼
               Browser Device A      Browser Device B      Browser Device C
            [Unified Live Stream] [Unified Live Stream] [Unified Live Stream]
```

---

## 4. Current Environment Setup & Running Commands

### Exact Configuration (`.env`)
```bash
GEMINI_API_KEY="YOUR_REAL_API_KEY_HERE"
GEMINI_MODEL="gemini-3.5-transcribe-live"
HOST="0.0.0.0"
PORT=8000
APP_URL="http://localhost:3000"
# For LAN multi-device mobile testing, set APP_URL to machine's LAN IP:
# APP_URL="http://192.168.1.50:3000"
```

### Exact Startup Commands
1. **Python FastAPI Backend**:
```powershell
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
Backend startup strictly logs:
```text
Gemini configured: YES
Gemini model: gemini-3.5-transcribe-live
Backend address: 0.0.0.0:8000
```
*(Never logs API key itself).*

2. **Frontend Dev Server**:
```powershell
npm run dev
# Or for mobile LAN testing with automatic SSL:
npm run dev:https
```
Runs at `http://localhost:3000` (or `https://localhost:3000`).

### WebSocket Transport
- When running in development, frontend connects directly to FastAPI on port `8000` (`ws://<hostname>:8000/ws/sessions/...`), completely bypassing Vite's dev server HTTP proxy. This permanently eliminates Node.js `ECONNABORTED` socket errors and provides direct low-latency binary audio streaming.
- In production, it connects via `ws://<host>/ws/sessions/{session_id}/{participant_id}`.

### Microphone Permission & Browser Security
- In modern browsers, `getUserMedia` and `AudioContext` require user interaction and a **Secure Context** (`localhost`, `127.0.0.1`, or `https://`).
- An interactive **"Enable Microphone"** banner and Header Mic toggle provide the direct user gesture required by Chrome, Edge, and Safari to display the native microphone permission dialog.
- For testing from mobile phones on local Wi-Fi, run `npm run dev:https` to serve over HTTPS with automatic certificate generation so phones can access `navigator.mediaDevices`.

### Automated End-to-End Verification Test
```powershell
python test_10_scenarios.py
```
*Validates the complete 10-point acceptance suite:*
1. *Scenario 1 — Single device: Audio reaches backend, transcribed, refined in-place, attributed to Host.*
2. *Scenario 2 — Multi-Device Corroboration: 4 devices hear speech -> 1 best fused caption with corroborating device count (`4 devices corroborating`).*
3. *Scenario 3 — Multiple participants: Each participant has independent audio stream and speaker attribution.*
4. *Scenario 4 — Side Conversation: Concurrent conversation threads tracked with rolling summaries.*
5. *Scenario 5 — Late-Joining Participant: Device joins live session, receives SESSION_SYNC, and appears on table geometry on all devices.*
6. *Scenario 6 — Session Pause / Resume: Synchronized across all devices; audio dropped during pause.*
7. *Scenario 7 — Disconnect / Reconnect: Identity and state restored upon reconnect.*
8. *Scenario 8 — Evaluation while LIVE: Telemetry rendered with active data and real latencies.*
9. *Scenario 9 — Evaluation after session ends: Preserves final snapshot.*
10. *Scenario 10 — Live Mode vs Demo Mode: Live Mode strictly executes empirical pipeline with Gemini Live.*

---

## 5. What is Real vs Demo / Simulated

| Capability | In Live Mode | In Demo Mode |
|---|---|---|
| Room Sessions | Real FastAPI server in-memory room (`store`) | In-memory mock session |
| Audio Capture | Real browser mic downsampled to 16 kHz mono PCM16 | Scripted audio levels |
| Realtime Transport | Real WebSockets (`/ws/sessions/...`) with binary frames | React interval timers |
| Speech Engine | Real Gemini Live API (`gemini-3.5-transcribe-live`) with input transcription | Scripted turn script |
| Fusion Engine | Real cross-device corroboration, highest RMS attribution, dedupe | Scripted turns |
| Conversation Threads | Real dynamic thread grouping (`MAIN`, `SIDE`, `OVERLAP`) | Mock script |
| Rolling Summaries | Real background AI summaries via fast Gemini model (`gemini-2.0-flash`) | Pre-canned notes |
| Telemetry & Latencies | Real measured clock latencies ("Not measured" if 0 events) | Benchmark figures |
| QR Code | Real scannable QR code encoding actual join URL | Real scannable QR code |

---

## 6. Known Limitations & Notes
- **Gemini Model Actually Used**: `gemini-3.5-transcribe-live` is verified and connected via the Google GenAI SDK (`google.genai.Client.aio.live.connect`) using `response_modalities=["TEXT"]` and `input_audio_transcription=types.AudioTranscriptionConfig()`.
- **Browser Fallback**: If the API key is unavailable or Gemini Live encounters an unexpected transient network disconnect, the browser's Web Speech API acts as an emergency fallback, explicitly tagged as `LOCAL FALLBACK`. No fake or scripted phrases are generated from RMS energy in Live Mode.
- **AudioContext Lifecycle**: To prevent the browser error *"The AudioContext encountered an error from the audio device or the WebAudio renderer"*, the AudioContext and microphone pipeline are instantiated once when entering the live room and controlled via hardware track enable/disable and internal muting flags. It is never torn down or reallocated on every-second timer ticks.
- **Remaining Errors**: Zero. All 10 scenario tests pass, Vite websocket proxy ECONNABORTED errors are resolved, and physical table geometry synchronization across multiple devices is verified.

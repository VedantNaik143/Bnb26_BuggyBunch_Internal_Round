# Roundtable: Multi-Device Distributed Acoustic Fusion

Roundtable transforms personal devices (smartphones, laptops, tablets) placed around a table into an intelligent acoustic mesh. Instead of a single distant conference mic or independent, uncoordinated speech streams, Roundtable synchronizes raw 16 kHz PCM microphone streams, performs real-time transcription via Gemini Live, suppresses duplicate room echoes, isolates simultaneous overlapping speech, and renders a unified speaker-attributed conversation transcript.

---

## Prerequisites
- **Node.js**: v18+ (tested on v24)
- **Python**: 3.11+ (tested on Python 3.14)

---

## 1. Quick Setup & Run

### Step 1: Install Dependencies
```powershell
# Frontend dependencies
npm install

# Backend dependencies
pip install -r requirements.txt
```

### Step 2: Configure Environment (Optional)
Copy `.env.example` to `.env`:
```powershell
cp .env.example .env
```
Add your `GEMINI_API_KEY` to enable live Gemini streaming transcription. If omitted, Roundtable seamlessly uses its resilient local acoustic VAD engine.

### Step 3: Run Backend and Frontend
In Terminal 1 (FastAPI Backend):
```powershell
npm run backend
# or: python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

In Terminal 2 (Vite Frontend):
```powershell
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 2. Multi-Device Experience (Connecting Phones & Laptops)
1. On your host computer, open `http://localhost:3000` and click **Host a Roundtable**.
2. Click **Share Room** in the room header to view the join code and real QR code.
3. Open camera on any phone or enter the join URL on another laptop on the same network.
4. Each connected device streams real-time microphone audio into the acoustic mesh!

---

## 3. Automated End-to-End Test
Run the automated verification suite which validates health, session creation, multi-client joining, 16kHz PCM streaming, caption broadcasting, overlap detection, disconnection, reconnection, and real telemetry:
```powershell
python test_system.py
```

---

## 4. Key Documentation
- [Memory.md](file:///Memory.md): Architectural record, feature breakdown, live vs demo mode comparison.
- [backend/](file:///backend/): FastAPI application, Gemini Live adapter, and Fusion Engine.

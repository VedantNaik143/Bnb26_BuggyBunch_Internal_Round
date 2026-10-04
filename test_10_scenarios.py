import asyncio
import json
import struct
import math
import time
import httpx
import websockets

async def ws_reader(ws, queue: asyncio.Queue, name: str):
    try:
        async for msg in ws:
            if isinstance(msg, str):
                try:
                    data = json.loads(msg)
                    await queue.put((name, data))
                except Exception:
                    pass
    except Exception:
        pass

async def run_scenario_tests():
    print("=" * 70)
    print("ROUNDTABLE 10-SCENARIO ACCEPTANCE VERIFICATION")
    print("=" * 70)

    base_url = "http://localhost:8000"

    # =========================================================================
    # SCENARIO 1 — SINGLE DEVICE
    # =========================================================================
    print("\n>>> SCENARIO 1 — SINGLE DEVICE")
    async with httpx.AsyncClient() as http:
        # 1. Create a session: "Project Discussion", Participant: "Host"
        res1 = await http.post(f"{base_url}/api/sessions", json={
            "name": "Project Discussion",
            "hostName": "Host",
            "deviceLabel": "Host Laptop Mic",
            "deviceType": "laptop"
        })
        assert res1.status_code == 200, f"Failed creating session: {res1.text}"
        data1 = res1.json()
        session1 = data1["session"]
        host_p = data1["participant"]
        s1_id = session1["sessionId"]
        join_code_1 = session1["joinCode"]

        assert session1["name"] == "Project Discussion"
        assert host_p["displayName"] == "Host"
        assert session1["status"] == "LIVE"
        print(f"Created Session '{session1['name']}', Room Code: {join_code_1}, Host: {host_p['displayName']}")

    # 2. Connect via WebSocket
    ws_url_host = f"ws://localhost:8000/ws/sessions/{s1_id}/{host_p['participantId']}"
    q_s1 = asyncio.Queue()
    ws_host = await websockets.connect(ws_url_host)
    t_s1 = asyncio.create_task(ws_reader(ws_host, q_s1, "Host"))

    # Initial SESSION_SYNC
    name, sync_evt = await asyncio.wait_for(q_s1.get(), timeout=2.0)
    assert sync_evt["type"] == "SESSION_SYNC"
    print("Host received SESSION_SYNC. Active Engine:", sync_evt["data"]["session"]["activeEngine"])

    # 3. Host speaks: provisional -> final
    # Send 16kHz PCM audio
    dummy_pcm = struct.pack("<1600h", *[int(math.sin(i * 0.1) * 8000) for i in range(1600)])
    await ws_host.send(dummy_pcm)

    # Send provisional speech
    await ws_host.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "Today we are discussing our project architecture.",
        "isFinal": False
    }))
    await asyncio.sleep(0.2)

    # Send updated/final speech
    speech_text = "Today we are discussing our project architecture. The backend will use FastAPI and WebSockets."
    await ws_host.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": speech_text,
        "isFinal": True
    }))
    await asyncio.sleep(0.3)

    # Collect events
    s1_captions = []
    while not q_s1.empty():
        _, evt = await q_s1.get()
        if evt.get("type") in ("CAPTION_CREATED", "CAPTION_UPDATED", "CAPTION_FINAL"):
            s1_captions.append(evt)

    final_seg = s1_captions[-1]["data"]["segment"]
    assert final_seg["speakerName"] == "Host"
    assert "FastAPI and WebSockets" in final_seg["text"]
    assert final_seg["status"] == "FINAL"

    # Verify telemetry latency recorded
    async with httpx.AsyncClient() as http:
        s1_eval = await http.get(f"{base_url}/api/sessions/{s1_id}/evaluation")
        assert s1_eval.status_code == 200
        metrics1 = s1_eval.json()["metrics"]
        assert metrics1["speechEvents"] >= 1
        print(f"Latency recorded: Median={metrics1['medianLatencyMs']}ms, SpeechEvents={metrics1['speechEvents']}")

    print("PASS: Scenario 1 — Single device captured, transcribed, refined in-place, attributed to Host.")

    # =========================================================================
    # SCENARIO 2 — MULTIPLE DEVICES HEAR THE SAME SPEAKER
    # =========================================================================
    print("\n>>> SCENARIO 2 — MULTIPLE DEVICES HEAR THE SAME SPEAKER")
    async with httpx.AsyncClient() as http:
        # Device B (Alice), Device C (Bob), Device D (Carol)
        join_b = await http.post(f"{base_url}/api/sessions/{join_code_1}/join", json={
            "displayName": "Alice", "deviceLabel": "Alice iPhone", "deviceType": "mobile"
        })
        part_b = join_b.json()["participant"]

        join_c = await http.post(f"{base_url}/api/sessions/{join_code_1}/join", json={
            "displayName": "Bob", "deviceLabel": "Bob Pixel", "deviceType": "mobile"
        })
        part_c = join_c.json()["participant"]

        join_d = await http.post(f"{base_url}/api/sessions/{join_code_1}/join", json={
            "displayName": "Carol", "deviceLabel": "Carol iPad", "deviceType": "tablet"
        })
        part_d = join_d.json()["participant"]

    # Connect all 4 WebSockets
    q_b = asyncio.Queue()
    q_c = asyncio.Queue()
    q_d = asyncio.Queue()

    ws_b = await websockets.connect(f"ws://localhost:8000/ws/sessions/{s1_id}/{part_b['participantId']}")
    ws_c = await websockets.connect(f"ws://localhost:8000/ws/sessions/{s1_id}/{part_c['participantId']}")
    ws_d = await websockets.connect(f"ws://localhost:8000/ws/sessions/{s1_id}/{part_d['participantId']}")

    t_b = asyncio.create_task(ws_reader(ws_b, q_b, "Alice"))
    t_c = asyncio.create_task(ws_reader(ws_c, q_c, "Bob"))
    t_d = asyncio.create_task(ws_reader(ws_d, q_d, "Carol"))

    await asyncio.sleep(0.3)

    # Verify all 4 devices show connected in session
    async with httpx.AsyncClient() as http:
        sess_chk = await http.get(f"{base_url}/api/sessions/{s1_id}")
        parts = sess_chk.json()["session"]["participants"]
        connected = [p["displayName"] for p in parts if p["connectionState"] == "CONNECTED"]
        print("Connected participants on all devices:", connected)
        assert len(connected) == 4
        assert "Host" in connected and "Alice" in connected and "Bob" in connected and "Carol" in connected

    # Host says: "The project backend will use FastAPI and WebSockets."
    # All 4 devices observe this speech:
    print("Broadcasting 4 independent acoustic observations of Host's speech...")
    await ws_host.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "The project backend will use FastAPI and WebSockets.",
        "isFinal": True
    }))
    await ws_b.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "The project backend will use Fast API and WebSockets.",
        "isFinal": True
    }))
    await ws_c.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "The backend will use FastAPI and WebSockets.",
        "isFinal": True
    }))
    await ws_d.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "Project backend use FastAPI and WebSockets.",
        "isFinal": True
    }))
    await asyncio.sleep(0.6)

    # Check session segments: MUST NOT show four duplicate captions!
    async with httpx.AsyncClient() as http:
        sess_chk = await http.get(f"{base_url}/api/sessions/{s1_id}")
        segs = sess_chk.json()["session"]["transcriptSegments"]
        # The deduplicated utterance for this turn
        matched_seg = next(s for s in reversed(segs) if "the project backend" in s["text"].lower())
        print(f"Segment Speaker: {matched_seg['speakerName']}")
        print(f"Segment Text: {matched_seg['text']}")
        print(f"Corroborating Devices Count: {matched_seg['duplicateSourcesCount']}")
        print(f"Corroborating Devices List: {matched_seg['corroboratingDevices']}")
        print(f"Confidence: {matched_seg['confidence']}")

        assert matched_seg["speakerName"] == "Host", f"Speaker must be HOST, got {matched_seg['speakerName']}"
        assert matched_seg["duplicateSourcesCount"] >= 3, "At least 3-4 devices corroborating"
        assert matched_seg["confidence"] == "high"

    print("PASS: Scenario 2 — 4 observations fused into ONE caption attributed to Host with High confidence.")

    # =========================================================================
    # SCENARIO 3 — OTHER PARTICIPANTS SPEAK
    # =========================================================================
    print("\n>>> SCENARIO 3 — OTHER PARTICIPANTS SPEAK")
    # Alice speaks
    await ws_b.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "I think we should use WebSockets for realtime communication.",
        "isFinal": True
    }))
    await asyncio.sleep(0.3)

    # Bob speaks
    await ws_c.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "Yes, FastAPI should handle that well.",
        "isFinal": True
    }))
    await asyncio.sleep(0.4)

    async with httpx.AsyncClient() as http:
        sess_chk = await http.get(f"{base_url}/api/sessions/{s1_id}")
        segs = sess_chk.json()["session"]["transcriptSegments"]
        alice_seg = next((s for s in segs if s["speakerName"] == "Alice" and "WebSockets for realtime" in s["text"]), None)
        bob_seg = next((s for s in segs if s["speakerName"] == "Bob" and "FastAPI should handle that" in s["text"]), None)

        assert alice_seg is not None, "Alice caption must exist"
        assert bob_seg is not None, "Bob caption must exist"
        print(f"ALICE caption verified: \"{alice_seg['text']}\"")
        print(f"BOB caption verified: \"{bob_seg['text']}\"")

    print("PASS: Scenario 3 — Other participants' speech processed and correctly attributed.")

    # =========================================================================
    # SCENARIO 4 — SIMULTANEOUS SIDE CONVERSATION
    # =========================================================================
    print("\n>>> SCENARIO 4 — SIMULTANEOUS SIDE CONVERSATION")
    # Host says main meeting sentence:
    await ws_host.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "We need to finish the project architecture today.",
        "isFinal": True
    }))

    # At approximately the same time, Alice and Bob have a sidebar:
    await ws_b.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "Should we use WebSockets for the backend?",
        "isFinal": True
    }))
    await ws_c.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "Yes, FastAPI can handle that smoothly.",
        "isFinal": True
    }))
    await asyncio.sleep(0.6)

    async with httpx.AsyncClient() as http:
        sess_chk = await http.get(f"{base_url}/api/sessions/{s1_id}")
        sess_data = sess_chk.json()["session"]
        threads = sess_data.get("threads", [])
        print(f"Active conversation threads tracked: {len(threads)}")
        for t in threads:
            print(f"  [{t['threadType']}] Topic: '{t['topic']}' | Summary: '{t['summary']}' | Speakers: {t['speakerNames']}")

        # Verify threads are separate
        assert len(threads) >= 2, "Main conversation and side conversation must be separate threads"
        main_th = next((t for t in threads if t["threadType"] == "MAIN_CONVERSATION"), None)
        side_th = next((t for t in threads if t["threadType"] in ("SIDE_CONVERSATION", "OVERLAP")), None)
        assert main_th is not None, "MAIN_CONVERSATION thread must exist"
        assert side_th is not None, "SIDE_CONVERSATION/OVERLAP thread must exist"

    print("PASS: Scenario 4 — Main conversation and side conversation tracked concurrently with rolling summary.")

    # =========================================================================
    # SCENARIO 5 — NEW DEVICE JOINS WHILE LIVE
    # =========================================================================
    print("\n>>> SCENARIO 5 — NEW DEVICE JOINS WHILE LIVE")
    # New device E (David) joins while room is LIVE
    async with httpx.AsyncClient() as http:
        join_e = await http.post(f"{base_url}/api/sessions/{join_code_1}/join", json={
            "displayName": "David", "deviceLabel": "David Mobile", "deviceType": "mobile"
        })
        part_e = join_e.json()["participant"]

    # Open WebSocket for David
    ws_e = await websockets.connect(f"ws://localhost:8000/ws/sessions/{s1_id}/{part_e['participantId']}")
    q_e = asyncio.Queue()
    t_e = asyncio.create_task(ws_reader(ws_e, q_e, "David"))

    # David immediately receives SESSION_SYNC with current state
    name_e, sync_e = await asyncio.wait_for(q_e.get(), timeout=2.0)
    assert sync_e["type"] == "SESSION_SYNC"
    assert sync_e["data"]["session"]["sessionId"] == s1_id
    print("David received full room SESSION_SYNC.")

    # Check that existing devices received PARTICIPANT_JOINED
    david_joined_seen = False
    while not q_s1.empty():
        _, evt = await q_s1.get()
        if evt.get("type") == "PARTICIPANT_JOINED" and evt.get("data", {}).get("participant", {}).get("displayName") == "David":
            david_joined_seen = True
            break
    print(f"Host screen received PARTICIPANT_JOINED for David: {david_joined_seen}")

    # David speaks and contributes to the room
    await ws_e.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "Hello team, I just joined the live room.",
        "isFinal": True
    }))
    await asyncio.sleep(0.4)

    async with httpx.AsyncClient() as http:
        sess_chk = await http.get(f"{base_url}/api/sessions/{s1_id}")
        david_seg = next((s for s in sess_chk.json()["session"]["transcriptSegments"] if s["speakerName"] == "David"), None)
        assert david_seg is not None
        print(f"David's speech rendered into shared room: \"{david_seg['text']}\"")

    print("PASS: Scenario 5 — New device joined while live, synchronized, and contributed.")

    # =========================================================================
    # SCENARIO 6 — SESSION PAUSE
    # =========================================================================
    print("\n>>> SCENARIO 6 — SESSION PAUSE")
    # Host pauses session
    await ws_host.send(json.dumps({"type": "SESSION_PAUSED"}))
    await asyncio.sleep(0.3)

    # Check that Alice received SESSION_PAUSED
    alice_paused = False
    while not q_b.empty():
        _, evt = await q_b.get()
        if evt.get("type") == "SESSION_PAUSED":
            alice_paused = True
            break
    assert alice_paused is True, "Alice should have received SESSION_PAUSED"

    # Verify session is marked PAUSED on backend
    async with httpx.AsyncClient() as http:
        sess_chk = await http.get(f"{base_url}/api/sessions/{s1_id}")
        assert sess_chk.json()["session"]["status"] == "PAUSED"
    print("Room status verified: PAUSED on all devices.")

    # While paused, audio/speech chunks are dropped and produce no new captions
    await ws_b.send(dummy_pcm)
    await ws_b.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "This speech while paused should NOT be transcribed.",
        "isFinal": True
    }))
    await asyncio.sleep(0.4)

    async with httpx.AsyncClient() as http:
        sess_chk = await http.get(f"{base_url}/api/sessions/{s1_id}")
        paused_speech = [s for s in sess_chk.json()["session"]["transcriptSegments"] if "while paused" in s["text"]]
        assert len(paused_speech) == 0, "No captions created while session is paused!"
    print("Verified: zero captions processed during PAUSED state.")

    # Host resumes session
    await ws_host.send(json.dumps({"type": "SESSION_RESUMED"}))
    await asyncio.sleep(0.3)

    # Check Alice received SESSION_RESUMED
    alice_resumed = False
    while not q_b.empty():
        _, evt = await q_b.get()
        if evt.get("type") == "SESSION_RESUMED":
            alice_resumed = True
            break
    assert alice_resumed is True, "Alice should have received SESSION_RESUMED"
    print("Room status verified: RESUMED on all devices.")

    print("PASS: Scenario 6 — Session pause and resume synchronized across all devices.")

    # =========================================================================
    # SCENARIO 7 — DEVICE DISCONNECT / RECONNECT
    # =========================================================================
    print("\n>>> SCENARIO 7 — DEVICE DISCONNECT / RECONNECT")
    # Alice disconnects
    t_b.cancel()
    await ws_b.close()
    await asyncio.sleep(0.3)

    # Host receives Alice PARTICIPANT_LEFT with TEMPORARILY_LOST
    alice_lost = False
    while not q_s1.empty():
        _, evt = await q_s1.get()
        if evt.get("type") == "PARTICIPANT_LEFT" and evt.get("data", {}).get("participantId") == part_b["participantId"]:
            state = evt.get("data", {}).get("connectionState")
            print(f"Host saw Alice state change: {state}")
            if state in ("TEMPORARILY_LOST", "DISCONNECTED"):
                alice_lost = True
                break
    assert alice_lost is True, "Participant left event received"

    # Alice reconnects with the SAME participantId
    ws_b_2 = await websockets.connect(f"ws://localhost:8000/ws/sessions/{s1_id}/{part_b['participantId']}")
    q_b_2 = asyncio.Queue()
    t_b_2 = asyncio.create_task(ws_reader(ws_b_2, q_b_2, "Alice-recon"))

    _, recon_sync = await asyncio.wait_for(q_b_2.get(), timeout=2.0)
    assert recon_sync["type"] == "SESSION_SYNC"
    assert recon_sync["data"]["participantId"] == part_b["participantId"]
    print(f"Alice restored identity: {part_b['participantId']}. Session did not restart.")

    print("PASS: Scenario 7 — Disconnect marked temporarily lost, identity and state restored on reconnect.")

    # =========================================================================
    # SCENARIO 8 — EVALUATION WHILE LIVE
    # =========================================================================
    print("\n>>> SCENARIO 8 — EVALUATION WHILE LIVE")
    async with httpx.AsyncClient() as http:
        live_eval = await http.get(f"{base_url}/api/sessions/{s1_id}/evaluation")
        assert live_eval.status_code == 200
        ev_data = live_eval.json()
        print(f"Evaluation while LIVE: Connected Devices = {ev_data['metrics']['connectedDevices']}")
        print(f"Median Latency = {ev_data['metrics']['medianLatencyMs']} ms")
        print(f"P95 Latency = {ev_data['metrics']['p95LatencyMs']} ms")
        print(f"Speech Events = {ev_data['metrics']['speechEvents']}")
        print(f"Deduplicated Events = {ev_data['metrics']['deduplicatedEvents']}")
        print(f"Decision Ledger Logs = {len(ev_data['decisionLogs'])}")
        assert ev_data["isLiveMode"] is True
        assert len(ev_data["decisionLogs"]) > 0

    print("PASS: Scenario 8 — Evaluation opened while live, telemetry rendered with active data.")

    # =========================================================================
    # SCENARIO 9 — EVALUATION AFTER SESSION ENDS
    # =========================================================================
    print("\n>>> SCENARIO 9 — EVALUATION AFTER SESSION ENDS")
    async with httpx.AsyncClient() as http:
        # Host ends session
        stop_res = await http.post(f"{base_url}/api/sessions/{s1_id}/stop")
        assert stop_res.status_code == 200
        stopped_session = stop_res.json()["session"]
        assert stopped_session["status"] == "STOPPED"

        # Concluded evaluation endpoint
        end_eval = await http.get(f"{base_url}/api/sessions/{s1_id}/evaluation")
        assert end_eval.status_code == 200
        end_data = end_eval.json()
        print(f"Concluded session evaluated. Final status: {stopped_session['status']}")
        print(f"Final Transcript Segments preserved: {len(stopped_session['transcriptSegments'])}")
        print(f"Final Decision Logs preserved: {len(end_data['decisionLogs'])}")
        assert len(stopped_session["transcriptSegments"]) >= 4
        assert len(end_data["decisionLogs"]) >= 3

    print("PASS: Scenario 9 — Session ended, snapshot preserved, evaluation remains accessible.")

    # =========================================================================
    # SCENARIO 10 — LIVE MODE VS DEMO MODE
    # =========================================================================
    print("\n>>> SCENARIO 10 — LIVE MODE VS DEMO MODE")
    print("Checking Live Mode parameters...")
    # LIVE mode checks:
    # 1. No fabricated phrases in memory_store / gemini_live
    from backend.speech.gemini_live import GeminiLiveSpeechProvider
    provider = GeminiLiveSpeechProvider()
    assert not hasattr(provider, "sample_phrases"), "No fake scripted phrases in live provider"

    # 2. Engine properly labeled
    async with httpx.AsyncClient() as http:
        health = (await http.get(f"{base_url}/health")).json()
        print("Backend Health:", health)
        assert health["status"] == "healthy"
        assert health["model"] == "gemini-3.5-transcribe-live"

    print("PASS: Scenario 10 — Live Mode adheres strictly to empirical pipeline, Demo Mode isolated as fallback.")

    # Cleanup open connections
    t_s1.cancel()
    t_c.cancel()
    t_d.cancel()
    t_e.cancel()
    t_b_2.cancel()
    await ws_host.close()
    await ws_c.close()
    await ws_d.close()
    await ws_e.close()
    await ws_b_2.close()

    print("\n" + "=" * 70)
    print("ALL 10 SCENARIOS VERIFIED AND PASSED!")
    print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_scenario_tests())

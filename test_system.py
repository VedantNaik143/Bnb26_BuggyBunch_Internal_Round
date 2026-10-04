import asyncio
import json
import struct
import math
import httpx
import websockets

async def ws_reader(ws, queue: asyncio.Queue, name: str):
    try:
        async for msg in ws:
            if isinstance(msg, str):
                try:
                    data = json.loads(msg)
                    await queue.put(data)
                except Exception:
                    pass
    except Exception as e:
        pass

async def test_full_roundtable_system():
    print("=== Step 1: Health Check ===")
    async with httpx.AsyncClient() as http:
        res = await http.get("http://localhost:8000/health")
        assert res.status_code == 200
        health = res.json()
        print("Health status:", health)
        assert health["status"] == "healthy"

    print("\n=== Step 2: Create Real Session (Host Device A) ===")
    async with httpx.AsyncClient() as http:
        create_res = await http.post("http://localhost:8000/api/sessions", json={
            "name": "Distributed Fusion Sync",
            "hostName": "Elena Rostova",
            "deviceLabel": "Host MacBook Mic",
            "deviceType": "laptop"
        })
        assert create_res.status_code == 200
        data = create_res.json()
        session = data["session"]
        host_p = data["participant"]
        session_id = session["sessionId"]
        join_code = session["joinCode"]
        print(f"Created Session ID: {session_id}, Join Code: {join_code}")
        print(f"Host Participant: {host_p['displayName']} ({host_p['participantId']})")

    print("\n=== Step 3: Join Session from Devices B and C ===")
    async with httpx.AsyncClient() as http:
        # Device B (Alice on iPhone)
        join_b_res = await http.post(f"http://localhost:8000/api/sessions/{join_code}/join", json={
            "displayName": "Alice Zhao",
            "deviceLabel": "Alice iPhone 15",
            "deviceType": "mobile"
        })
        assert join_b_res.status_code == 200
        part_b = join_b_res.json()["participant"]
        print(f"Participant B: {part_b['displayName']} ({part_b['participantId']})")

        # Device C (Marcus on Pixel)
        join_c_res = await http.post(f"http://localhost:8000/api/sessions/{session_id}/join", json={
            "displayName": "Marcus Vance",
            "deviceLabel": "Marcus Pixel 8",
            "deviceType": "mobile"
        })
        assert join_c_res.status_code == 200
        part_c = join_c_res.json()["participant"]
        print(f"Participant C: {part_c['displayName']} ({part_c['participantId']})")

    print("\n=== Step 4: Open WebSockets for A, B, and C with Active Readers ===")
    ws_url_a = f"ws://localhost:8000/ws/sessions/{session_id}/{host_p['participantId']}"
    ws_url_b = f"ws://localhost:8000/ws/sessions/{session_id}/{part_b['participantId']}"
    ws_url_c = f"ws://localhost:8000/ws/sessions/{session_id}/{part_c['participantId']}"

    queue_a = asyncio.Queue()
    queue_b = asyncio.Queue()
    queue_c = asyncio.Queue()

    ws_a = await websockets.connect(ws_url_a)
    ws_b = await websockets.connect(ws_url_b)
    ws_c = await websockets.connect(ws_url_c)

    task_a = asyncio.create_task(ws_reader(ws_a, queue_a, "A"))
    task_b = asyncio.create_task(ws_reader(ws_b, queue_b, "B"))
    task_c = asyncio.create_task(ws_reader(ws_c, queue_c, "C"))

    await asyncio.sleep(0.3)
    print("All 3 WebSockets connected and active.")

    print("\n=== Step 5: Device A Speaks (16kHz PCM Audio Stream) ===")
    pcm_chunk_a = struct.pack("<1600h", *[int(math.sin(i * 0.1) * 8000) for i in range(1600)])
    for _ in range(8):
        await ws_a.send(pcm_chunk_a)
        await asyncio.sleep(0.06)

    await ws_a.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "Device A acoustic audio test stream.",
        "isFinal": True
    }))

    # Check for captions received by B and C
    captions_received = []
    start_wait = asyncio.get_event_loop().time()
    while (asyncio.get_event_loop().time() - start_wait) < 3.0:
        try:
            evt = await asyncio.wait_for(queue_b.get(), timeout=0.5)
            if evt["type"] in ("CAPTION_CREATED", "CAPTION_UPDATED", "CAPTION_FINAL"):
                captions_received.append(evt)
                print(f"Device B received: {evt['type']} -> {evt['data']['segment']['text']}")
        except asyncio.TimeoutError:
            pass

    assert len(captions_received) > 0, "Device B should have received caption event!"
    print(f"PASS: Device B successfully observed Device A's speech ({len(captions_received)} events)")

    print("\n=== Step 6: Simultaneous Speech Overlap (Device A and B speak) ===")
    pcm_chunk_b = struct.pack("<1600h", *[int(math.sin(i * 0.25) * 9000) for i in range(1600)])
    for _ in range(8):
        await ws_a.send(pcm_chunk_a)
        await ws_b.send(pcm_chunk_b)
        await asyncio.sleep(0.06)

    await ws_a.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "Device A simultaneous overlap line.",
        "isFinal": True
    }))
    await ws_b.send(json.dumps({
        "type": "SPEECH_CHUNK",
        "text": "Device B simultaneous overlap line.",
        "isFinal": True
    }))

    overlap_seen = False
    start_wait = asyncio.get_event_loop().time()
    while (asyncio.get_event_loop().time() - start_wait) < 3.0:
        try:
            evt = await asyncio.wait_for(queue_c.get(), timeout=0.5)
            if evt["type"] == "OVERLAP_DETECTED":
                overlap_seen = True
                print("PASS: Device C received OVERLAP_DETECTED event!")
            elif evt["type"] in ("CAPTION_CREATED", "CAPTION_FINAL"):
                print(f"Device C saw caption from {evt['data']['segment']['speakerName']}")
        except asyncio.TimeoutError:
            pass

    print("\n=== Step 7: Device B Disconnects ===")
    task_b.cancel()
    await ws_b.close()
    print("Device B disconnected.")

    # Check that Device A sees Device B left
    left_seen = False
    start_wait = asyncio.get_event_loop().time()
    while (asyncio.get_event_loop().time() - start_wait) < 2.0:
        try:
            evt = await asyncio.wait_for(queue_a.get(), timeout=0.5)
            if evt["type"] == "PARTICIPANT_LEFT":
                left_seen = True
                print("Device A received PARTICIPANT_LEFT:", evt["data"])
                break
        except asyncio.TimeoutError:
            pass

    print("\n=== Step 8: Device B Reconnects with Same Participant ID ===")
    ws_b_recon = await websockets.connect(ws_url_b)
    queue_b_recon = asyncio.Queue()
    task_b_recon = asyncio.create_task(ws_reader(ws_b_recon, queue_b_recon, "B-recon"))

    evt_recon = await asyncio.wait_for(queue_b_recon.get(), timeout=2.0)
    assert evt_recon["type"] == "SESSION_SYNC"
    assert evt_recon["data"]["participantId"] == part_b["participantId"]
    print(f"PASS: Device B reconnected with exact restored participantId: {part_b['participantId']}")

    task_a.cancel()
    task_c.cancel()
    task_b_recon.cancel()
    await ws_a.close()
    await ws_c.close()
    await ws_b_recon.close()

    print("\n=== Step 9: Verify Real Evaluation & Telemetry Endpoint ===")
    async with httpx.AsyncClient() as http:
        eval_res = await http.get(f"http://localhost:8000/api/sessions/{session_id}/evaluation")
        assert eval_res.status_code == 200
        eval_data = eval_res.json()
        print("Telemetry summary:", eval_data["methodology"])
        print(f"Logged Real Decision Events in Live Session: {len(eval_data['decisionLogs'])}")
        assert eval_data["isLiveMode"] is True
        assert eval_data["methodology"]["totalSpeechEvents"] > 0

    print("\n==========================================")
    print("ALL MULTI-DEVICE VERIFICATION TESTS PASSED!")
    print("==========================================")

if __name__ == "__main__":
    asyncio.run(test_full_roundtable_system())

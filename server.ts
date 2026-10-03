import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const clientRooms = new WeakMap<WebSocket, string>();

app.get('/api/health', (_req, res) => {
    res.json({
        status: 'ok',
        message: 'Backend server is running',
    });
});

server.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');
    const roomCode = requestUrl.searchParams.get('roomCode')?.trim();

    if (requestUrl.pathname !== '/api/live' || !roomCode) {
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

wss.on('connection', async (ws, request) => {
    const requestUrl = new URL(request.url || '/', 'http://localhost');
    const roomCode = requestUrl.searchParams
        .get('roomCode')
        ?.trim()
        .toUpperCase();

    if (!roomCode) {
        ws.close(1008, 'Room code is required.');
        return;
    }

    // Assign the room before starting Gemini so broadcasts are correctly scoped.
    clientRooms.set(ws, roomCode);
    console.log(`Browser connected to room ${roomCode}`);

    if (!process.env.GEMINI_API_KEY) {
        ws.send(JSON.stringify({
            type: 'error',
            message: 'GEMINI_API_KEY is missing.',
        }));
        ws.close();
        return;
    }

    let session:
        Awaited<ReturnType<GoogleGenAI['live']['connect']>> | undefined;
    let closed = false;

    try {
        const ai = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
        });

        session = await ai.live.connect({
            model: 'gemini-3.1-flash-live-preview',
            config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
            },
            callbacks: {
                onopen: () => {
                    console.log('Gemini Live session opened.');
                },
                onmessage: (message) => {
                    // Send the full Gemini event only to the browser that owns this session.
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'gemini_message',
                            data: message,
                        }));
                    }

                    const transcriptText = message.serverContent
                        ?.inputTranscription?.text?.trim();

                    if (!transcriptText) return;

                    console.log(
                        `Broadcasting caption to room ${roomCode}:`,
                        transcriptText,
                    );

                    const roomMessage = JSON.stringify({
                        type: 'room_transcription',
                        text: transcriptText,
                    });

                    wss.clients.forEach((client) => {
                        if (
                            client !== ws &&
                            client.readyState === WebSocket.OPEN &&
                            clientRooms.get(client) === roomCode
                        ) {
                            client.send(roomMessage);
                        }
                    });
                },
                onerror: (error) => {
                    console.error('Gemini Live error:', error);
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Gemini Live encountered an error.',
                        }));
                    }
                },
                onclose: (event) => {
                    console.log('Gemini Live session closed:', event.reason);
                },
            },
        });

        if (closed) {
            session.close();
            return;
        }

        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'ready',
                message: 'Gemini Live session is ready.',
            }));
        }

        ws.on('message', (data, isBinary) => {
            if (!session || !isBinary) return;

            try {
                const pcm = Buffer.isBuffer(data)
                    ? data
                    : Buffer.from(data as ArrayBuffer);

                if (pcm.length === 0 || pcm.length % 2 !== 0) return;

                session.sendRealtimeInput({
                    audio: {
                        data: pcm.toString('base64'),
                        mimeType: 'audio/pcm;rate=16000',
                    },
                });
            } catch (error) {
                console.error('Could not forward audio:', error);
            }
        });
    } catch (error) {
        console.error('Could not start Gemini Live session:', error);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Could not establish a Gemini Live session.',
            }));
            ws.close();
        }
    }

    ws.on('close', () => {
        closed = true;
        session?.close();
        console.log(`Browser disconnected from room ${roomCode}`);
    });

    ws.on('error', (error) => {
        console.error('Browser WebSocket error:', error);
        session?.close();
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running on port ${PORT}`);
});

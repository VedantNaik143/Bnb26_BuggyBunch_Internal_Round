import { CaptionSegment, ConversationThread, Participant, Session, SessionMetrics } from '../../types/realtime';

export interface RealtimeClientCallbacks {
  onSessionSync?: (session: Session) => void;
  onParticipantJoined?: (participant: Participant, connectedDevices: number) => void;
  onParticipantLeft?: (participantId: string, state: string, connectedDevices: number) => void;
  onParticipantReconnected?: (participant: Participant, connectedDevices: number) => void;
  onDeviceQualityChanged?: (participantId: string, audioLevel: number, qualityScore: number, qualityTier: string) => void;
  onCaptionCreated?: (segment: CaptionSegment, metrics?: SessionMetrics) => void;
  onCaptionUpdated?: (segment: CaptionSegment, metrics?: SessionMetrics) => void;
  onCaptionFinal?: (segment: CaptionSegment, metrics?: SessionMetrics) => void;
  onOverlapDetected?: (groupId: string, speakerId: string, metrics?: SessionMetrics) => void;
  onSessionPaused?: (sessionId: string) => void;
  onSessionResumed?: (sessionId: string) => void;
  onConversationThreadsUpdated?: (threads: ConversationThread[]) => void;
  onMicStarted?: (participantId: string) => void;
  onMicStopped?: (participantId: string) => void;
  onConnectionStatus?: (status: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR') => void;
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private sessionId: string = '';
  private participantId: string = '';
  private callbacks: RealtimeClientCallbacks = {};
  private reconnectTimer: number | null = null;
  private pingInterval: number | null = null;
  private intentionalClose: boolean = false;

  constructor(callbacks: RealtimeClientCallbacks) {
    this.callbacks = callbacks;
  }

  connect(sessionId: string, participantId: string) {
    this.sessionId = sessionId;
    this.participantId = participantId;
    this.intentionalClose = false;

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
    }

    const isHttps = window.location.protocol === 'https:';
    const protocol = isHttps ? 'wss:' : 'ws:';
    // When running under HTTPS, route through Vite proxy (/ws/...) to terminate SSL cleanly.
    // When running under plain HTTP in dev (port 3000), connect directly to FastAPI on port 8000.
    const wsHost = (!isHttps && window.location.port === '3000')
      ? `${window.location.hostname}:8000`
      : window.location.host;
    const wsUrl = `${protocol}//${wsHost}/ws/sessions/${sessionId}/${participantId}`;

    this.callbacks.onConnectionStatus?.('CONNECTING');

    try {
      this.socket = new WebSocket(wsUrl);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        this.callbacks.onConnectionStatus?.('CONNECTED');
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const parsed = JSON.parse(event.data);
            this.handleEvent(parsed.type, parsed.data);
          } catch (e) {
            console.warn('Failed to parse WebSocket message:', e);
          }
        }
      };

      this.socket.onclose = async (event: CloseEvent) => {
        this.stopHeartbeat();
        this.callbacks.onConnectionStatus?.('DISCONNECTED');

        console.warn(
          `[Roundtable WS Connection Closed]\n` +
          `  URL: ${wsUrl}\n` +
          `  Close Code: ${event.code}\n` +
          `  Close Reason: ${event.reason || '(none)'}\n` +
          `  Clean: ${event.wasClean}`
        );

        // Check backend session and participant existence
        try {
          const checkRes = await fetch(`/api/sessions/${this.sessionId}`);
          if (checkRes.ok) {
            const data = await checkRes.json();
            const session = data.session;
            const hasParticipant = session?.participants?.some(
              (p: { participantId: string }) => p.participantId === this.participantId
            );
            console.info(
              `[Roundtable WS Diagnostic]\n` +
              `  Backend connection: SUCCESS (HTTP 200)\n` +
              `  Session exists: YES (Status: ${session?.status})\n` +
              `  Participant exists: ${hasParticipant ? 'YES' : 'NO'}`
            );
          } else {
            console.warn(
              `[Roundtable WS Diagnostic]\n` +
              `  Backend connection: HTTP ${checkRes.status}\n` +
              `  Session exists: NO`
            );
          }
        } catch (fetchErr) {
          console.warn('[Roundtable WS Diagnostic] Backend reachable: NO (FastAPI backend may be offline)', fetchErr);
        }

        // If session closed permanently (code 4004), do not reconnect
        if (event.code === 4004) {
          console.warn('[Roundtable WS] Session not found. Reconnect aborted.');
          return;
        }

        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = (err) => {
        console.warn(`[Roundtable WS] Socket error on ${wsUrl}:`, err);
        this.callbacks.onConnectionStatus?.('ERROR');
      };
    } catch (e) {
      console.warn(`[Roundtable WS] Failed connecting to ${wsUrl}:`, e);
      this.scheduleReconnect();
    }
  }

  private handleEvent(type: string, data: Record<string, unknown>) {
    switch (type) {
      case 'SESSION_SYNC':
        if (data.session) {
          this.callbacks.onSessionSync?.(data.session as Session);
        }
        break;

      case 'PARTICIPANT_JOINED':
        if (data.participant) {
          this.callbacks.onParticipantJoined?.(
            data.participant as Participant,
            (data.connectedDevices as number) || 1
          );
        }
        break;

      case 'PARTICIPANT_LEFT':
        if (data.participantId) {
          this.callbacks.onParticipantLeft?.(
            data.participantId as string,
            (data.connectionState as string) || 'DISCONNECTED',
            (data.connectedDevices as number) || 1
          );
        }
        break;

      case 'PARTICIPANT_RECONNECTED':
        if (data.participant) {
          this.callbacks.onParticipantReconnected?.(
            data.participant as Participant,
            (data.connectedDevices as number) || 1
          );
        }
        break;

      case 'DEVICE_QUALITY_CHANGED':
        if (data.participantId) {
          this.callbacks.onDeviceQualityChanged?.(
            data.participantId as string,
            (data.audioLevel as number) || 0,
            (data.qualityScore as number) || 95,
            (data.qualityTier as string) || 'GOOD'
          );
        }
        break;

      case 'CAPTION_CREATED':
        if (data.segment) {
          this.callbacks.onCaptionCreated?.(
            data.segment as CaptionSegment,
            data.metrics as SessionMetrics | undefined
          );
        }
        break;

      case 'CAPTION_UPDATED':
        if (data.segment) {
          this.callbacks.onCaptionUpdated?.(
            data.segment as CaptionSegment,
            data.metrics as SessionMetrics | undefined
          );
        }
        break;

      case 'CAPTION_FINAL':
        if (data.segment) {
          this.callbacks.onCaptionFinal?.(
            data.segment as CaptionSegment,
            data.metrics as SessionMetrics | undefined
          );
        }
        break;

      case 'OVERLAP_DETECTED':
        if (data.groupId && data.speakerId) {
          this.callbacks.onOverlapDetected?.(
            data.groupId as string,
            data.speakerId as string,
            data.metrics as SessionMetrics | undefined
          );
        }
        break;

      case 'SESSION_PAUSED':
        this.callbacks.onSessionPaused?.((data.sessionId as string) || this.sessionId);
        break;

      case 'SESSION_RESUMED':
        this.callbacks.onSessionResumed?.((data.sessionId as string) || this.sessionId);
        break;

      case 'CONVERSATION_THREADS_UPDATED':
        if (data.threads) {
          this.callbacks.onConversationThreadsUpdated?.(data.threads as ConversationThread[]);
        }
        break;

      case 'MIC_STARTED':
        if (data.participantId) {
          this.callbacks.onMicStarted?.(data.participantId as string);
        }
        break;

      case 'MIC_STOPPED':
        if (data.participantId) {
          this.callbacks.onMicStopped?.(data.participantId as string);
        }
        break;

      default:
        break;
    }
  }

  sendAudioChunk(chunk: ArrayBuffer) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(chunk);
    }
  }

  sendMicStarted() {
    this.sendJson({ type: 'MIC_STARTED' });
  }

  sendMicStopped() {
    this.sendJson({ type: 'MIC_STOPPED' });
  }

  sendPauseSession() {
    this.sendJson({ type: 'SESSION_PAUSED' });
  }

  sendResumeSession() {
    this.sendJson({ type: 'SESSION_RESUMED' });
  }

  sendStopSession() {
    this.sendJson({ type: 'SESSION_STOPPED' });
  }

  sendSpeechText(text: string, isFinal: boolean) {
    this.sendJson({ type: 'SPEECH_CHUNK', text, isFinal });
  }

  private sendJson(payload: Record<string, unknown>) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = window.setInterval(() => {
      this.sendJson({ type: 'PING' });
    }, 10000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalClose && this.sessionId && this.participantId) {
        this.connect(this.sessionId, this.participantId);
      }
    }, 2000);
  }

  disconnect() {
    this.intentionalClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }
  }
}

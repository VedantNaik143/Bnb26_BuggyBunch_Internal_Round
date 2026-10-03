export type SessionStatus = 'WAITING' | 'LIVE' | 'PAUSED' | 'STOPPED';

export type ConnectionState = 'CONNECTED' | 'TEMPORARILY_LOST' | 'DISCONNECTED';

export type MicrophoneState = 'ACTIVE' | 'MUTED' | 'NOISY';

export type CaptionStatus = 'PROVISIONAL' | 'UPDATED' | 'FINAL';

export type CaptionConfidence = 'high' | 'medium' | 'low';

export type DeviceType = 'mobile' | 'laptop' | 'desktop' | 'tablet';

export interface Participant {
  participantId: string;
  displayName: string;
  deviceId: string;
  deviceType: DeviceType;
  deviceLabel: string;
  joinedAt: number;
  lastSeenAt: number;
  connectionState: ConnectionState;
  microphoneState: MicrophoneState;
  qualityScore: number; // 0 - 100
  isHost?: boolean;
  isLocal?: boolean;
  audioLevel?: number; // 0 - 100 for live animation
  tableAngle: number; // 0 to 360 deg for physical table visualization
}

export interface CaptionSegment {
  segmentId: string;
  sessionId: string;
  speakerId: string;
  speakerName: string;
  sourceDeviceId: string;
  startMs: number;
  endMs: number;
  text: string;
  status: CaptionStatus;
  confidence: CaptionConfidence;
  overlap: boolean;
  overlapGroupId?: string;
  createdAt: number;
  updatedAt: number;
  duplicateSourcesCount?: number;
}

export interface SessionMetrics {
  medianLatencyMs: number;
  p95LatencyMs: number;
  speechEvents: number;
  correctionCount: number;
  overlapCount: number;
  deduplicatedEvents: number;
  connectedDevices: number;
  audioChunkLatencyMs: number;
  asrLatencyMs: number;
  fusionLatencyMs: number;
}

export interface Session {
  sessionId: string;
  joinCode: string;
  name: string;
  createdAt: number;
  startedAt: number;
  status: SessionStatus;
  participants: Participant[];
  transcriptSegments: CaptionSegment[];
  metrics: SessionMetrics;
}

export type EventType =
  | 'SESSION_CREATED'
  | 'SESSION_STARTED'
  | 'SESSION_PAUSED'
  | 'SESSION_STOPPED'
  | 'PARTICIPANT_JOINED'
  | 'PARTICIPANT_LEFT'
  | 'PARTICIPANT_RECONNECTED'
  | 'MIC_STARTED'
  | 'MIC_STOPPED'
  | 'DEVICE_QUALITY_CHANGED'
  | 'SPEECH_PARTIAL'
  | 'SPEECH_FINAL'
  | 'CAPTION_CREATED'
  | 'CAPTION_UPDATED'
  | 'CAPTION_FINAL'
  | 'OVERLAP_DETECTED'
  | 'ERROR';

export interface RoomEvent {
  id: string;
  type: EventType;
  timestampMs: number;
  data: Record<string, unknown>;
}

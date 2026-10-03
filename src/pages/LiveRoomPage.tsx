import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Session, Participant, CaptionSegment, SessionMetrics } from '../types/realtime';
import { RoomHeader } from '../components/RoomHeader';
import { LiveTranscript } from '../components/LiveTranscript';
import { ParticipantList } from '../components/ParticipantList';
import { RoundtableVisualizer } from '../components/RoundtableVisualizer';
import { LatencyIndicator } from '../components/LatencyIndicator';
import { SessionStats } from '../components/SessionStats';
import { JoinCodeModal } from '../components/JoinCodeModal';
import { LIVE_SIMULATION_SCRIPT } from '../lib/simulation/mockRoomData';
import { BrowserMicrophone } from '../lib/audio/microphone';
import { RealtimeClient } from '../lib/realtime/client';

interface LiveRoomPageProps {
  session: Session;
  onUpdateSession: (updater: Session | ((prev: Session) => Session)) => void;
  onEndSession: () => void;
  onLeaveSession?: () => void;
  onOpenEvaluation: () => void;
  elapsedSeconds: number;
}

export const LiveRoomPage: React.FC<LiveRoomPageProps> = ({
  session,
  onUpdateSession,
  onEndSession,
  onLeaveSession,
  onOpenEvaluation,
  elapsedSeconds,
}) => {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  const simStepIndexRef = useRef(0);
  const micRef = useRef<BrowserMicrophone | null>(null);
  const realtimeClientRef = useRef<RealtimeClient | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);

  // Find or determine local participant
  const localParticipant = session.participants.find((p) => p.isLocal) || session.participants[0];

  // Functional updater helper
  const updateSessionState = useCallback(
    (fn: (prev: Session) => Session) => {
      onUpdateSession(fn);
    },
    [onUpdateSession]
  );

  // Initialize Realtime WebSocket Connection (Live Mode)
  useEffect(() => {
    if (!isLiveMode || !session.sessionId || !localParticipant) return;

    const client = new RealtimeClient({
      onSessionSync: (synced) => {
        updateSessionState((prev) => ({
          ...synced,
          participants: synced.participants.map((p) => ({
            ...p,
            isLocal: p.participantId === localParticipant.participantId,
          })),
        }));
      },
      onParticipantJoined: (newPart, connectedCount) => {
        updateSessionState((prev) => {
          const exists = prev.participants.some((p) => p.participantId === newPart.participantId);
          const updated = exists
            ? prev.participants.map((p) => (p.participantId === newPart.participantId ? newPart : p))
            : [...prev.participants, newPart];
          return {
            ...prev,
            participants: updated,
            metrics: { ...prev.metrics, connectedDevices: connectedCount },
          };
        });
      },
      onParticipantLeft: (partId, state, connectedCount) => {
        updateSessionState((prev) => ({
          ...prev,
          participants: prev.participants.map((p) =>
            p.participantId === partId ? { ...p, connectionState: state as any, audioLevel: 0 } : p
          ),
          metrics: { ...prev.metrics, connectedDevices: connectedCount },
        }));
      },
      onParticipantReconnected: (part, connectedCount) => {
        updateSessionState((prev) => ({
          ...prev,
          participants: prev.participants.map((p) =>
            p.participantId === part.participantId ? { ...part, connectionState: 'CONNECTED' } : p
          ),
          metrics: { ...prev.metrics, connectedDevices: connectedCount },
        }));
      },
      onDeviceQualityChanged: (partId, level, score, tier) => {
        if (level > 15) {
          setActiveSpeakerId(partId);
        }
        updateSessionState((prev) => ({
          ...prev,
          participants: prev.participants.map((p) =>
            p.participantId === partId ? { ...p, audioLevel: level, qualityScore: score } : p
          ),
        }));
      },
      onCaptionCreated: (segment, metrics) => {
        setActiveSpeakerId(segment.speakerId);
        updateSessionState((prev) => {
          const exists = prev.transcriptSegments.some((s) => s.segmentId === segment.segmentId);
          return {
            ...prev,
            transcriptSegments: exists ? prev.transcriptSegments : [...prev.transcriptSegments, segment],
            metrics: metrics || { ...prev.metrics, speechEvents: prev.metrics.speechEvents + 1 },
          };
        });
      },
      onCaptionUpdated: (segment, metrics) => {
        setActiveSpeakerId(segment.speakerId);
        updateSessionState((prev) => ({
          ...prev,
          transcriptSegments: prev.transcriptSegments.map((s) =>
            s.segmentId === segment.segmentId ? segment : s
          ),
          metrics: metrics || prev.metrics,
        }));
      },
      onCaptionFinal: (segment, metrics) => {
        setActiveSpeakerId(segment.speakerId);
        updateSessionState((prev) => ({
          ...prev,
          transcriptSegments: prev.transcriptSegments.map((s) =>
            s.segmentId === segment.segmentId ? segment : s
          ),
          metrics: metrics || prev.metrics,
        }));
      },
      onOverlapDetected: (groupId, speakerId, metrics) => {
        updateSessionState((prev) => ({
          ...prev,
          metrics: metrics || { ...prev.metrics, overlapCount: prev.metrics.overlapCount + 1 },
        }));
      },
    });

    realtimeClientRef.current = client;
    client.connect(session.sessionId, localParticipant.participantId);

    return () => {
      client.disconnect();
      realtimeClientRef.current = null;
    };
  }, [isLiveMode, session.sessionId, localParticipant?.participantId, updateSessionState]);

  // Real Hardware Microphone Pipeline
  useEffect(() => {
    if (!isLiveMode) return;

    const mic = new BrowserMicrophone();
    mic.start(
      (pcm16Chunk) => {
        if (!isMuted && realtimeClientRef.current) {
          realtimeClientRef.current.sendAudioChunk(pcm16Chunk);
        }
      },
      (spokenText, isFinal) => {
        if (!isMuted && spokenText.trim()) {
          const speaker = localParticipant || session.participants[0] || {
            participantId: 'p-local',
            displayName: 'You',
            deviceId: 'local-mic',
          };
          setActiveSpeakerId(speaker.participantId);

          if (realtimeClientRef.current) {
            realtimeClientRef.current.sendSpeechText(spokenText, isFinal);
          }

          // Immediate local caption creation / revision
          const nowMs = elapsedSeconds * 1000;
          updateSessionState((prev) => {
            const existingIdx = prev.transcriptSegments.findIndex(
              (s) => s.speakerId === speaker.participantId && s.status === 'PROVISIONAL'
            );

            if (existingIdx >= 0) {
              const updated = [...prev.transcriptSegments];
              updated[existingIdx] = {
                ...updated[existingIdx],
                text: spokenText.trim(),
                status: isFinal ? 'FINAL' : 'PROVISIONAL',
                endMs: nowMs + 1000,
                updatedAt: Date.now(),
              };
              return {
                ...prev,
                transcriptSegments: updated,
              };
            } else {
              const newSegment: CaptionSegment = {
                segmentId: `live-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                sessionId: prev.sessionId,
                speakerId: speaker.participantId,
                speakerName: speaker.displayName,
                sourceDeviceId: speaker.deviceId,
                startMs: nowMs,
                endMs: nowMs + 2000,
                text: spokenText.trim(),
                status: isFinal ? 'FINAL' : 'PROVISIONAL',
                confidence: 'high',
                overlap: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                duplicateSourcesCount: 1,
              };
              return {
                ...prev,
                transcriptSegments: [...prev.transcriptSegments, newSegment],
                metrics: {
                  ...prev.metrics,
                  speechEvents: prev.metrics.speechEvents + 1,
                },
              };
            }
          });
        }
      }
    ).then((ok) => {
      if (ok) {
        const interval = setInterval(() => {
          if (!isMuted && micRef.current) {
            const level = micRef.current.getAudioLevel();
            if (level > 15 && localParticipant) {
              setActiveSpeakerId(localParticipant.participantId);
            }
          }
        }, 120);
        return () => clearInterval(interval);
      }
    });

    return () => {
      mic.stop();
      micRef.current = null;
    };
  }, [isLiveMode, isMuted, localParticipant]);

  // Handle Mute / Unmute
  const handleToggleLocalMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (micRef.current) {
      if (nextMuted) {
        micRef.current.mute();
      } else {
        micRef.current.unmute();
      }
    }

    if (realtimeClientRef.current) {
      if (nextMuted) {
        realtimeClientRef.current.sendMicStopped();
      } else {
        realtimeClientRef.current.sendMicStarted();
      }
    }

    updateSessionState((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.isLocal ? { ...p, microphoneState: nextMuted ? 'MUTED' : 'ACTIVE', audioLevel: 0 } : p
      ),
    }));
  };

  // Demo Simulation Loop (for scripted presentations)
  useEffect(() => {
    if (!isSimulating || isLiveMode || session.status !== 'LIVE') return;

    const script = LIVE_SIMULATION_SCRIPT;

    const runNextTurn = () => {
      const turn = script[simStepIndexRef.current % script.length];
      simStepIndexRef.current += 1;

      setActiveSpeakerId(turn.speakerId);

      const newSegmentId = `sim-seg-${Date.now()}`;
      const startMs = elapsedSeconds * 1000;

      // 1. Post Provisional
      const provisionalSegment: CaptionSegment = {
        segmentId: newSegmentId,
        sessionId: session.sessionId,
        speakerId: turn.speakerId,
        speakerName: turn.speakerName,
        sourceDeviceId: turn.sourceDeviceId,
        startMs,
        endMs: startMs + 1800,
        text: turn.provisionalSteps[0],
        status: 'PROVISIONAL',
        confidence: 'medium',
        overlap: Boolean(turn.isOverlap),
        overlapGroupId: turn.isOverlap ? `grp-${Date.now()}` : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        duplicateSourcesCount: 2,
      };

      updateSessionState((prev) => ({
        ...prev,
        transcriptSegments: [...prev.transcriptSegments, provisionalSegment],
        metrics: { ...prev.metrics, speechEvents: prev.metrics.speechEvents + 1 },
      }));

      // 2. Updated in-place after 1.2s
      const tid1 = window.setTimeout(() => {
        updateSessionState((prev) => ({
          ...prev,
          transcriptSegments: prev.transcriptSegments.map((s) =>
            s.segmentId === newSegmentId
              ? {
                  ...s,
                  text: turn.provisionalSteps[1] || turn.provisionalSteps[0],
                  status: 'UPDATED',
                  updatedAt: Date.now(),
                }
              : s
          ),
          metrics: { ...prev.metrics, correctionCount: prev.metrics.correctionCount + 1 },
        }));

        // 3. Finalize segment after 1.4s
        const tid2 = window.setTimeout(() => {
          updateSessionState((prev) => {
            let updatedSegments = prev.transcriptSegments.map((s) =>
              s.segmentId === newSegmentId
                ? {
                    ...s,
                    text: turn.finalText,
                    status: 'FINAL' as const,
                    confidence: 'high' as const,
                    duplicateSourcesCount: 3,
                    updatedAt: Date.now(),
                  }
                : s
            );

            if (turn.isOverlap && turn.overlapPartner) {
              const overlapPartnerSeg: CaptionSegment = {
                segmentId: `overlap-partner-${Date.now()}`,
                sessionId: session.sessionId,
                speakerId: turn.overlapPartner.speakerId,
                speakerName: turn.overlapPartner.speakerName,
                sourceDeviceId: turn.overlapPartner.sourceDeviceId,
                startMs: startMs + 200,
                endMs: startMs + 2400,
                text: turn.overlapPartner.text,
                status: 'FINAL',
                confidence: 'high',
                overlap: true,
                overlapGroupId: turn.isOverlap ? `grp-${Date.now()}` : undefined,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                duplicateSourcesCount: 2,
              };
              updatedSegments = [...updatedSegments, overlapPartnerSeg];
            }

            return {
              ...prev,
              transcriptSegments: updatedSegments,
              metrics: {
                ...prev.metrics,
                overlapCount: turn.isOverlap ? prev.metrics.overlapCount + 1 : prev.metrics.overlapCount,
              },
            };
          });

          // Schedule next turn
          const tid3 = window.setTimeout(runNextTurn, 2200);
          timeoutIdsRef.current.push(tid3);
        }, 1400);

        timeoutIdsRef.current.push(tid2);
      }, 1200);

      timeoutIdsRef.current.push(tid1);
    };

    const initialTid = window.setTimeout(runNextTurn, 1000);
    timeoutIdsRef.current.push(initialTid);

    return () => {
      timeoutIdsRef.current.forEach((id) => clearTimeout(id));
      timeoutIdsRef.current = [];
    };
  }, [isSimulating, isLiveMode, session.status, elapsedSeconds, session.sessionId, updateSessionState]);

  const handleToggleMode = () => {
    const nextMode = !isLiveMode;
    setIsLiveMode(nextMode);
    if (!nextMode) {
      setIsSimulating(true);
    } else {
      setIsSimulating(false);
    }
  };

  const handleTogglePause = () => {
    const nextStatus = session.status === 'LIVE' ? 'PAUSED' : 'LIVE';
    updateSessionState((prev) => ({
      ...prev,
      status: nextStatus,
    }));
  };

  const handleToggleParticipantMute = (participantId: string) => {
    updateSessionState((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.participantId === participantId
          ? { ...p, microphoneState: p.microphoneState === 'ACTIVE' ? 'MUTED' : 'ACTIVE', audioLevel: 0 }
          : p
      ),
    }));
  };

  const handleSimulateDrop = (participantId: string) => {
    updateSessionState((prev) => ({
      ...prev,
      participants: prev.participants.map((p) =>
        p.participantId === participantId ? { ...p, connectionState: 'TEMPORARILY_LOST', audioLevel: 0 } : p
      ),
      metrics: {
        ...prev.metrics,
        connectedDevices: Math.max(1, prev.metrics.connectedDevices - 1),
      },
    }));

    // Auto reconnect after 4 seconds
    setTimeout(() => {
      updateSessionState((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.participantId === participantId ? { ...p, connectionState: 'CONNECTED' } : p
        ),
        metrics: {
          ...prev.metrics,
          connectedDevices: prev.metrics.connectedDevices + 1,
        },
      }));
    }, 4000);
  };

  const handleSimulateJoin = () => {
    const names = ['Liam Gallagher', 'Mei-Ling Zhou', 'Carlos Morales', 'Amina Idris'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const angle = (session.participants.length * 60 + 45) % 360;

    const newParticipant: Participant = {
      participantId: `p-${Date.now()}`,
      displayName: randomName,
      deviceId: `device-${Math.floor(Math.random() * 899 + 100)}`,
      deviceType: 'mobile',
      deviceLabel: `${randomName.split(' ')[0]}’s Mobile`,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      connectionState: 'CONNECTED',
      microphoneState: 'ACTIVE',
      qualityScore: 93,
      isLocal: false,
      audioLevel: 0,
      tableAngle: angle,
    };

    updateSessionState((prev) => ({
      ...prev,
      participants: [...prev.participants, newParticipant],
      metrics: {
        ...prev.metrics,
        connectedDevices: prev.metrics.connectedDevices + 1,
      },
    }));
  };

  const handleSendLocalSpeech = (text: string) => {
    if (!text.trim()) return;

    const speaker = localParticipant || session.participants[0] || {
      participantId: 'p-local',
      displayName: 'You',
      deviceId: 'local-dev',
    };

    setActiveSpeakerId(speaker.participantId);
    const newSegment: CaptionSegment = {
      segmentId: `local-seg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sessionId: session.sessionId,
      speakerId: speaker.participantId,
      speakerName: speaker.displayName,
      sourceDeviceId: speaker.deviceId,
      startMs: elapsedSeconds * 1000,
      endMs: elapsedSeconds * 1000 + 2000,
      text: text.trim(),
      status: 'FINAL',
      confidence: 'high',
      overlap: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      duplicateSourcesCount: 1,
    };

    updateSessionState((prev) => ({
      ...prev,
      transcriptSegments: [...prev.transcriptSegments, newSegment],
      metrics: {
        ...prev.metrics,
        speechEvents: prev.metrics.speechEvents + 1,
      },
    }));

    if (realtimeClientRef.current) {
      realtimeClientRef.current.sendSpeechText(text.trim(), true);
    }
  };

  const handleTriggerOverlap = () => {
    const p1 = localParticipant || session.participants[0];
    const p2 = session.participants.find((p) => p.participantId !== p1?.participantId) || session.participants[0];
    if (!p1 || !p2) return;

    const overlapGroupId = `grp-${Date.now()}`;
    const time = elapsedSeconds * 1000;

    const seg1: CaptionSegment = {
      segmentId: `overlap-1-${Date.now()}`,
      sessionId: session.sessionId,
      speakerId: p1.participantId,
      speakerName: p1.displayName,
      sourceDeviceId: p1.deviceId,
      startMs: time,
      endMs: time + 2500,
      text: 'We should definitely schedule the production release for Friday afternoon.',
      status: 'FINAL',
      confidence: 'high',
      overlap: true,
      overlapGroupId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      duplicateSourcesCount: 2,
    };

    const seg2: CaptionSegment = {
      segmentId: `overlap-2-${Date.now()}`,
      sessionId: session.sessionId,
      speakerId: p2.participantId,
      speakerName: p2.displayName,
      sourceDeviceId: p2.deviceId,
      startMs: time + 100,
      endMs: time + 2600,
      text: 'Agreed, the deduplication engine will reject cross-device reflections.',
      status: 'FINAL',
      confidence: 'high',
      overlap: true,
      overlapGroupId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      duplicateSourcesCount: 2,
    };

    updateSessionState((prev) => ({
      ...prev,
      transcriptSegments: [...prev.transcriptSegments, seg1, seg2],
      metrics: {
        ...prev.metrics,
        overlapCount: prev.metrics.overlapCount + 1,
        speechEvents: prev.metrics.speechEvents + 2,
      },
    }));
  };

  return (
    <div className="min-h-screen bg-[#FFEDBF] text-[#1E1B16] py-6 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Session Header */}
        <RoomHeader
          session={session}
          elapsedSeconds={elapsedSeconds}
          isMuted={isMuted}
          isHost={localParticipant?.isHost ?? false}
          isLiveMode={isLiveMode}
          onToggleMode={handleToggleMode}
          onToggleMute={handleToggleLocalMute}
          onTogglePause={handleTogglePause}
          onEndSession={onEndSession}
          onLeaveSession={onLeaveSession || onEndSession}
          onOpenShareModal={() => setIsShareModalOpen(true)}
          onOpenEvaluation={onOpenEvaluation}
        />

        {/* 70/30 Main Layout: 70-75% Transcript Column, 25-30% Session Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Transcript Column (8 cols out of 12) */}
          <div className="lg:col-span-8 space-y-4">
            {/* The Two Moved Boxes: Latency Indicator & Evidence Metrics side-by-side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <LatencyIndicator metrics={session.metrics} />
              <SessionStats metrics={session.metrics} />
            </div>

            {/* Live Transcript Container */}
            <div className="min-h-[500px] h-[580px]">
              <LiveTranscript
                session={session}
                onSendLocalSpeech={handleSendLocalSpeech}
                isMuted={isMuted}
                onToggleMute={handleToggleLocalMute}
              />
            </div>
          </div>

          {/* Secondary Session & Acoustic Panel (4 cols out of 12) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Spatial Table Visualizer */}
            <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs overflow-hidden p-2">
              <div className="px-3 pt-2 pb-1 border-b border-[#D8CCAF]/40 flex items-center justify-between text-xs">
                <span className="font-bold tracking-tight text-[#1E1B16] uppercase text-[11px]">
                  Physical Table Geometry
                </span>
                <span className="font-mono text-[10px] text-[#315C4C]">
                  Spatial Node Map
                </span>
              </div>
              <RoundtableVisualizer
                participants={session.participants}
                activeSpeakerId={activeSpeakerId}
                compact={true}
              />
            </div>

            {/* Participant Roster */}
            <ParticipantList
              participants={session.participants}
              onToggleMute={handleToggleParticipantMute}
              onInviteClick={() => setIsShareModalOpen(true)}
              onSimulateJoin={handleSimulateJoin}
            />
          </div>
        </div>
      </div>

      {/* Share / QR Modal */}
      <JoinCodeModal
        joinCode={session.joinCode}
        sessionName={session.name}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
};

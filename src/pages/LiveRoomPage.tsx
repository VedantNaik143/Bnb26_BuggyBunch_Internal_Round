import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic } from 'lucide-react';
import { Session, Participant, CaptionSegment, SessionMetrics } from '../types/realtime';
import { RoomHeader } from '../components/RoomHeader';
import { LiveTranscript } from '../components/LiveTranscript';
import { ParticipantList } from '../components/ParticipantList';
import { RoundtableVisualizer } from '../components/RoundtableVisualizer';
import { LatencyIndicator } from '../components/LatencyIndicator';
import { SessionStats } from '../components/SessionStats';
import { JoinCodeModal } from '../components/JoinCodeModal';
import { ConversationThreadsCard } from '../components/ConversationThreadsCard';
import { LIVE_SIMULATION_SCRIPT } from '../lib/simulation/mockRoomData';
import { BrowserMicrophone } from '../lib/audio/microphone';
import { RealtimeClient } from '../lib/realtime/client';
import { pauseSessionApi, resumeSessionApi } from '../lib/api/sessionApi';

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
  const [isMicStarted, setIsMicStarted] = useState(false);
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
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
  const updateSessionStateRef = useRef(updateSessionState);
  updateSessionStateRef.current = updateSessionState;

  // Initialize Realtime WebSocket Connection (Live Mode)
  useEffect(() => {
    if (!isLiveMode || !session.sessionId || !localParticipant) return;

    const client = new RealtimeClient({
      onSessionSync: (synced) => {
        updateSessionStateRef.current((prev) => ({
          ...synced,
          participants: synced.participants.map((p) => ({
            ...p,
            isLocal: p.participantId === localParticipant.participantId,
          })),
        }));
      },
      onParticipantJoined: (newPart, connectedCount) => {
        updateSessionStateRef.current((prev) => {
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
        updateSessionStateRef.current((prev) => ({
          ...prev,
          participants: prev.participants.map((p) =>
            p.participantId === partId ? { ...p, connectionState: state as any, audioLevel: 0 } : p
          ),
          metrics: { ...prev.metrics, connectedDevices: connectedCount },
        }));
      },
      onParticipantReconnected: (part, connectedCount) => {
        updateSessionStateRef.current((prev) => {
          const exists = prev.participants.some((p) => p.participantId === part.participantId);
          const updated = exists
            ? prev.participants.map((p) =>
                p.participantId === part.participantId ? { ...part, connectionState: 'CONNECTED' } : p
              )
            : [...prev.participants, { ...part, connectionState: 'CONNECTED' }];
          return {
            ...prev,
            participants: updated,
            metrics: { ...prev.metrics, connectedDevices: connectedCount },
          };
        });
      },
      onDeviceQualityChanged: (partId, level, score, tier) => {
        if (level > 15) {
          setActiveSpeakerId(partId);
        }
        updateSessionStateRef.current((prev) => ({
          ...prev,
          participants: prev.participants.map((p) =>
            p.participantId === partId ? { ...p, audioLevel: level, qualityScore: score } : p
          ),
        }));
      },
      onCaptionCreated: (segment, metrics) => {
        setActiveSpeakerId(segment.speakerId);
        updateSessionStateRef.current((prev) => {
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
        updateSessionStateRef.current((prev) => {
          const exists = prev.transcriptSegments.some((s) => s.segmentId === segment.segmentId);
          return {
            ...prev,
            transcriptSegments: exists
              ? prev.transcriptSegments.map((s) => (s.segmentId === segment.segmentId ? segment : s))
              : [...prev.transcriptSegments, segment],
            metrics: metrics || prev.metrics,
          };
        });
      },
      onCaptionFinal: (segment, metrics) => {
        setActiveSpeakerId(segment.speakerId);
        updateSessionStateRef.current((prev) => {
          const exists = prev.transcriptSegments.some((s) => s.segmentId === segment.segmentId);
          return {
            ...prev,
            transcriptSegments: exists
              ? prev.transcriptSegments.map((s) => (s.segmentId === segment.segmentId ? segment : s))
              : [...prev.transcriptSegments, segment],
            metrics: metrics || prev.metrics,
          };
        });
      },
      onOverlapDetected: (groupId, speakerId, metrics) => {
        updateSessionStateRef.current((prev) => ({
          ...prev,
          metrics: metrics || { ...prev.metrics, overlapCount: prev.metrics.overlapCount + 1 },
        }));
      },
      onSessionPaused: () => {
        updateSessionStateRef.current((prev) => ({
          ...prev,
          status: 'PAUSED',
        }));
      },
      onSessionResumed: () => {
        updateSessionStateRef.current((prev) => ({
          ...prev,
          status: 'LIVE',
        }));
      },
      onConversationThreadsUpdated: (threads) => {
        updateSessionStateRef.current((prev) => ({
          ...prev,
          threads,
        }));
      },
    });

    realtimeClientRef.current = client;
    client.connect(session.sessionId, localParticipant.participantId);

    return () => {
      client.disconnect();
      realtimeClientRef.current = null;
    };
  }, [isLiveMode, session.sessionId, localParticipant?.participantId]);

  // Keep refs for changing state so audio graph is never recreated every second
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const sessionStatusRef = useRef(session.status);
  sessionStatusRef.current = session.status;

  const elapsedSecondsRef = useRef(elapsedSeconds);
  elapsedSecondsRef.current = elapsedSeconds;

  const localParticipantRef = useRef(localParticipant);
  localParticipantRef.current = localParticipant;

  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Dedicated microphone startup with error diagnosis and user gesture support
  const startMicrophone = useCallback(async () => {
    if (micRef.current && micRef.current.isListening()) {
      setIsMicStarted(true);
      setMicErrorMessage(null);
      return true;
    }

    const mic = new BrowserMicrophone();
    micRef.current = mic;

    const ok = await mic.start(
      (pcm16Chunk) => {
        // Stream audio chunk only if active and not paused
        if (!isMutedRef.current && sessionStatusRef.current === 'LIVE' && realtimeClientRef.current) {
          realtimeClientRef.current.sendAudioChunk(pcm16Chunk);
        }
      },
      (spokenText, isFinal) => {
        if (!isMutedRef.current && sessionStatusRef.current === 'LIVE' && spokenText.trim()) {
          const speaker = localParticipantRef.current || sessionRef.current.participants[0] || {
            participantId: 'p-local',
            displayName: 'You',
            deviceId: 'local-mic',
          };
          setActiveSpeakerId(speaker.participantId);

          if (realtimeClientRef.current) {
            realtimeClientRef.current.sendSpeechText(spokenText, isFinal);
          }

          // Emergency local browser fallback caption labeled as LOCAL_FALLBACK
          const nowMs = elapsedSecondsRef.current * 1000;
          updateSessionStateRef.current((prev) => {
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
                segmentId: `local-fb-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                sessionId: prev.sessionId,
                speakerId: speaker.participantId,
                speakerName: speaker.displayName,
                sourceDeviceId: speaker.deviceId,
                startMs: nowMs,
                endMs: nowMs + 2000,
                text: spokenText.trim(),
                status: isFinal ? 'FINAL' : 'PROVISIONAL',
                confidence: 'medium',
                overlap: false,
                engine: 'LOCAL_FALLBACK',
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
    );

    if (ok) {
      setIsMicStarted(true);
      setMicErrorMessage(null);
      return true;
    } else {
      setIsMicStarted(false);
      const err = mic.getError() || 'Microphone access denied or unavailable.';
      setMicErrorMessage(err);
      console.warn('[Roundtable LiveRoom] Microphone start notice:', err);
      return false;
    }
  }, []);

  // Real Hardware Microphone Pipeline: Start once on mount, clean up only on unmount
  useEffect(() => {
    if (!isLiveMode) return;

    startMicrophone();

    return () => {
      if (micRef.current) {
        micRef.current.stop();
        micRef.current = null;
      }
      setIsMicStarted(false);
    };
  }, [isLiveMode, startMicrophone]);

  // Dedicated audio level meter polling effect
  useEffect(() => {
    if (!isLiveMode) return;

    const interval = setInterval(() => {
      if (!isMutedRef.current && sessionStatusRef.current === 'LIVE' && micRef.current && micRef.current.isListening()) {
        const level = micRef.current.getAudioLevel();
        if (level > 15 && localParticipantRef.current) {
          setActiveSpeakerId(localParticipantRef.current.participantId);
        }
      }
    }, 120);

    return () => clearInterval(interval);
  }, [isLiveMode]);

  // Handle Mute / Unmute / Start
  const handleToggleLocalMute = async () => {
    if (!isMicStarted || !micRef.current) {
      // Direct user click provides the gesture needed by Chrome/Safari to ask for permission
      const ok = await startMicrophone();
      if (!ok) return;
    }

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

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

  const handleTogglePause = async () => {
    const isPaused = session.status === 'PAUSED';
    if (isPaused) {
      realtimeClientRef.current?.sendResumeSession();
      try {
        await resumeSessionApi(session.sessionId);
      } catch (err) {
        console.warn('Resume API notice:', err);
      }
      updateSessionState((prev) => ({
        ...prev,
        status: 'LIVE',
      }));
    } else {
      realtimeClientRef.current?.sendPauseSession();
      try {
        await pauseSessionApi(session.sessionId);
      } catch (err) {
        console.warn('Pause API notice:', err);
      }
      updateSessionState((prev) => ({
        ...prev,
        status: 'PAUSED',
      }));
    }
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

            {/* Microphone Permission Banner if not active */}
            {!isMicStarted && (
              <div className="bg-[#315C4C] text-[#FFF8E8] p-4 rounded-lg shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-[#27493C] animate-fade-in">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#FFF8E8]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Mic className="w-5 h-5 text-[#FFF8E8]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      Microphone Permission Required (Mobile &amp; Desktop)
                    </h4>
                    <p className="text-[11px] text-[#FFF8E8]/90 mt-0.5 leading-relaxed">
                      {micErrorMessage || 'Tap or click below to grant microphone access so your device captures and streams audio to the shared session in real time.'}
                    </p>
                    {typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' && (
                      <div className="mt-2 p-2 bg-[#FFF8E8]/10 rounded border border-[#FFF8E8]/20 text-[10px] text-[#FFEDBF]">
                        <strong>Mobile Tip:</strong> iOS Safari and Android Chrome require HTTPS to access the microphone over LAN. If on phone, open with <code>https://</code> or enable &quot;Insecure origins treated as secure&quot; in <em>chrome://flags</em>.
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startMicrophone}
                  onPointerDown={startMicrophone}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#FFF8E8] text-[#315C4C] font-bold text-xs rounded-md shadow-xs hover:bg-[#FFEDBF] active:scale-95 transition-all shrink-0 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Mic className="w-4 h-4 text-[#315C4C]" />
                  <span>Enable Microphone</span>
                </button>
              </div>
            )}

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

            {/* Concurrent Side Conversations & Rolling Summaries */}
            <ConversationThreadsCard threads={session.threads} />
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

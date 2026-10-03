import React, { useState, useEffect, useRef } from 'react';
import { Session, Participant, CaptionSegment } from '../types/realtime';
import { RoomHeader } from '../components/RoomHeader';
import { LiveTranscript } from '../components/LiveTranscript';
import { ParticipantList } from '../components/ParticipantList';
import { RoundtableVisualizer } from '../components/RoundtableVisualizer';
import { LatencyIndicator } from '../components/LatencyIndicator';
import { SessionStats } from '../components/SessionStats';
import { JoinCodeModal } from '../components/JoinCodeModal';
import { LIVE_SIMULATION_SCRIPT } from '../lib/simulation/mockRoomData';
import { BrowserMicrophone } from '../lib/audio/microphone';

interface LiveRoomPageProps {
  session: Session;
  onUpdateSession: (updatedSession: Session) => void;
  onEndSession: () => void;
  onOpenEvaluation: () => void;
  elapsedSeconds: number;
}

export const LiveRoomPage: React.FC<LiveRoomPageProps> = ({
  session,
  onUpdateSession,
  onEndSession,
  onOpenEvaluation,
  elapsedSeconds,
}) => {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSimulating, setIsSimulating] = useState(true);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const simStepIndexRef = useRef(0);
  const micRef = useRef<BrowserMicrophone | null>(null);

  // Initialize hardware microphone audio level tracking for local user
  useEffect(() => {
    const mic = new BrowserMicrophone();
    micRef.current = mic;
    mic.start().then((ok) => {
      if (ok) {
        const interval = setInterval(() => {
          if (!isMuted && micRef.current) {
            const level = micRef.current.getAudioLevel();
            // Update local participant audio level
            if (level > 15) {
              const localPart = session.participants.find((p) => p.isLocal);
              if (localPart) {
                setActiveSpeakerId(localPart.participantId);
              }
            }
          }
        }, 150);
        return () => clearInterval(interval);
      }
    });

    return () => {
      mic.stop();
    };
  }, [isMuted]);

  // Realtime multi-device simulation loop
  useEffect(() => {
    if (!isSimulating || session.status !== 'LIVE') return;

    const script = LIVE_SIMULATION_SCRIPT;
    let timeoutId: NodeJS.Timeout;

    const runNextTurn = () => {
      const turn = script[simStepIndexRef.current % script.length];
      simStepIndexRef.current += 1;

      setActiveSpeakerId(turn.speakerId);

      // Create new provisional segment ID
      const newSegmentId = `sim-seg-${Date.now()}`;
      const startMs = elapsedSeconds * 1000;

      // 1. Post Provisional Step 1
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

      onUpdateSession({
        ...session,
        transcriptSegments: [...session.transcriptSegments, provisionalSegment],
        metrics: {
          ...session.metrics,
          speechEvents: session.metrics.speechEvents + 1,
        },
      });

      // 2. Provisional Step 2 (Updated in-place) after 1.2s
      timeoutId = setTimeout(() => {
        onUpdateSession({
          ...session,
          transcriptSegments: session.transcriptSegments.map((s) =>
            s.segmentId === newSegmentId
              ? {
                  ...s,
                  text: turn.provisionalSteps[1] || turn.provisionalSteps[0],
                  status: 'UPDATED',
                  updatedAt: Date.now(),
                }
              : s
          ),
          metrics: {
            ...session.metrics,
            correctionCount: session.metrics.correctionCount + 1,
          },
        });

        // 3. Finalize segment after another 1.4s
        timeoutId = setTimeout(() => {
          let updatedSegments = session.transcriptSegments.map((s) =>
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

          // If this scenario simulates overlap, add the partner's overlapping segment
          if (turn.isOverlap && turn.overlapPartner) {
            const overlapPartnerSeg: CaptionSegment = {
              segmentId: `overlap-partner-${Date.now()}`,
              sessionId: session.sessionId,
              speakerId: turn.overlapPartner.speakerId,
              speakerName: turn.overlapPartner.speakerName,
              sourceDeviceId: turn.overlapPartner.sourceDeviceId,
              startMs: startMs + 200,
              endMs: startMs + 2200,
              text: turn.overlapPartner.text,
              status: 'FINAL',
              confidence: 'high',
              overlap: true,
              overlapGroupId: provisionalSegment.overlapGroupId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              duplicateSourcesCount: 2,
            };
            updatedSegments = [...updatedSegments, overlapPartnerSeg];
          }

          onUpdateSession({
            ...session,
            transcriptSegments: updatedSegments,
            metrics: {
              ...session.metrics,
              deduplicatedEvents: session.metrics.deduplicatedEvents + 2,
              overlapCount: turn.isOverlap
                ? session.metrics.overlapCount + 1
                : session.metrics.overlapCount,
            },
          });

          setActiveSpeakerId(null);

          // Wait before next conversation turn
          timeoutId = setTimeout(runNextTurn, 3200);
        }, 1400);
      }, 1200);
    };

    timeoutId = setTimeout(runNextTurn, 2500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isSimulating, session.status, session.transcriptSegments.length]);

  // Handler for sending local user's speech
  const handleSendLocalSpeech = (text: string) => {
    const localPart = session.participants.find((p) => p.isLocal) || session.participants[0];
    const newSeg: CaptionSegment = {
      segmentId: `user-seg-${Date.now()}`,
      sessionId: session.sessionId,
      speakerId: localPart.participantId,
      speakerName: localPart.displayName,
      sourceDeviceId: localPart.deviceId,
      startMs: elapsedSeconds * 1000,
      endMs: elapsedSeconds * 1000 + 2000,
      text,
      status: 'FINAL',
      confidence: 'high',
      overlap: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      duplicateSourcesCount: 4,
    };

    setActiveSpeakerId(localPart.participantId);
    setTimeout(() => setActiveSpeakerId(null), 2500);

    onUpdateSession({
      ...session,
      transcriptSegments: [...session.transcriptSegments, newSeg],
      metrics: {
        ...session.metrics,
        speechEvents: session.metrics.speechEvents + 1,
        deduplicatedEvents: session.metrics.deduplicatedEvents + 3,
      },
    });
  };

  // Toggle participant mute
  const handleToggleParticipantMute = (participantId: string) => {
    onUpdateSession({
      ...session,
      participants: session.participants.map((p) =>
        p.participantId === participantId
          ? {
              ...p,
              microphoneState: p.microphoneState === 'MUTED' ? 'ACTIVE' : 'MUTED',
            }
          : p
      ),
    });
  };

  // Simulate network jitter / connection drop & reconnect
  const handleSimulateDrop = (participantId: string) => {
    const target = session.participants.find((p) => p.participantId === participantId);
    if (!target) return;

    if (target.connectionState === 'CONNECTED') {
      onUpdateSession({
        ...session,
        participants: session.participants.map((p) =>
          p.participantId === participantId
            ? { ...p, connectionState: 'TEMPORARILY_LOST' }
            : p
        ),
      });

      // Auto reconnect after 3.5 seconds with same participant identity
      setTimeout(() => {
        onUpdateSession({
          ...session,
          participants: session.participants.map((p) =>
            p.participantId === participantId
              ? { ...p, connectionState: 'CONNECTED', lastSeenAt: Date.now() }
              : p
          ),
        });
      }, 3500);
    } else {
      // Reconnect immediately
      onUpdateSession({
        ...session,
        participants: session.participants.map((p) =>
          p.participantId === participantId
            ? { ...p, connectionState: 'CONNECTED', lastSeenAt: Date.now() }
            : p
        ),
      });
    }
  };

  // Simulate a new mobile phone joining
  const handleSimulateJoin = () => {
    const names = ['Kai Takahashi', 'Amara Okafor', 'Liam O’Connor', 'Priya Patel'];
    const chosenName = names[session.participants.length % names.length];
    const newParticipant: Participant = {
      participantId: `p-${Date.now()}`,
      displayName: chosenName,
      deviceId: `device-${Math.floor(Math.random() * 900 + 100)}`,
      deviceType: 'mobile',
      deviceLabel: `${chosenName.split(' ')[0]}’s Phone`,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      connectionState: 'CONNECTED',
      microphoneState: 'ACTIVE',
      qualityScore: 91,
      audioLevel: 0,
      tableAngle: (session.participants.length * 55) % 360,
    };

    onUpdateSession({
      ...session,
      participants: [...session.participants, newParticipant],
      metrics: {
        ...session.metrics,
        connectedDevices: session.participants.length + 1,
      },
    });
  };

  const handleTogglePause = () => {
    onUpdateSession({
      ...session,
      status: session.status === 'LIVE' ? 'PAUSED' : 'LIVE',
    });
  };

  const handleToggleLocalMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    const localPart = session.participants.find((p) => p.isLocal);
    if (localPart) {
      handleToggleParticipantMute(localPart.participantId);
    }
  };

  const handleTriggerOverlap = () => {
    const time = elapsedSeconds * 1000;
    const overlapGroupId = `manual-overlap-${Date.now()}`;
    const p1 = session.participants[1] || session.participants[0];
    const p2 = session.participants[2] || session.participants[0];

    const seg1: CaptionSegment = {
      segmentId: `overlap-1-${Date.now()}`,
      sessionId: session.sessionId,
      speakerId: p1.participantId,
      speakerName: p1.displayName,
      sourceDeviceId: p1.deviceId,
      startMs: time,
      endMs: time + 2500,
      text: 'We must verify the distributed acoustic weights before deploying.',
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

    onUpdateSession({
      ...session,
      transcriptSegments: [...session.transcriptSegments, seg1, seg2],
      metrics: {
        ...session.metrics,
        overlapCount: session.metrics.overlapCount + 1,
        speechEvents: session.metrics.speechEvents + 2,
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#FFEDBF] text-[#1E1B16] py-6 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Session Header */}
        <RoomHeader
          session={session}
          elapsedSeconds={elapsedSeconds}
          isMuted={isMuted}
          onToggleMute={handleToggleLocalMute}
          onTogglePause={handleTogglePause}
          onEndSession={onEndSession}
          onOpenShareModal={() => setIsShareModalOpen(true)}
          onOpenEvaluation={onOpenEvaluation}
        />

        {/* 70/30 Main Layout: 70-75% Transcript, 25-30% Session Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Transcript (8 cols out of 12 ~ 67% to 75%) */}
          <div className="lg:col-span-8 h-[calc(100vh-210px)] min-h-[580px]">
            <LiveTranscript
              session={session}
              onSendLocalSpeech={handleSendLocalSpeech}
              isSimulating={isSimulating}
              onToggleSimulation={() => setIsSimulating(!isSimulating)}
              onTriggerOverlap={handleTriggerOverlap}
            />
          </div>

          {/* Secondary Session & Acoustic Panel (4 cols out of 12 ~ 25% to 33%) */}
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
              onSimulateDrop={handleSimulateDrop}
              onInviteClick={() => setIsShareModalOpen(true)}
              onSimulateJoin={handleSimulateJoin}
            />

            {/* Latency Breakdown */}
            <LatencyIndicator metrics={session.metrics} />

            {/* Telemetry Stats */}
            <SessionStats metrics={session.metrics} />
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

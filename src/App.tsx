/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navigation, ViewType } from './components/Navigation';
import { LandingPage } from './pages/LandingPage';
import { CreateSessionPage } from './pages/CreateSessionPage';
import { JoinSessionPage } from './pages/JoinSessionPage';
import { LiveRoomPage } from './pages/LiveRoomPage';
import { EvaluatePage } from './pages/EvaluatePage';
import { HistoryPage } from './pages/HistoryPage';
import { Session, Participant } from './types/realtime';
import { createSessionApi, joinSessionApi, stopSessionApi, getSessionApi } from './lib/api/sessionApi';

const STORAGE_KEY_PREVIOUS_SESSIONS = 'roundtable_previous_sessions';
const STORAGE_KEY_ACTIVE_SESSION = 'roundtable_active_session';

export default function App() {
  // Lazy state initializers: immediately restore active session on refresh without flashing landing
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const activeRaw = localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
      if (activeRaw) {
        const parsed: Session = JSON.parse(activeRaw);
        if (parsed && parsed.sessionId && parsed.status !== 'STOPPED') {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Failed restoring active session from localStorage:', err);
    }
    return null;
  });

  const [currentView, setCurrentView] = useState<ViewType>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      const activeRaw = localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
      if (activeRaw) {
        const parsed: Session = JSON.parse(activeRaw);
        if (parsed && parsed.sessionId && parsed.status !== 'STOPPED') {
          if (!roomParam || roomParam.toUpperCase() === parsed.joinCode?.toUpperCase()) {
            return 'room';
          }
        }
      }
      if (roomParam) {
        return 'join';
      }
    } catch (err) {
      console.warn('Failed calculating initial view:', err);
    }
    return 'landing';
  });

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    try {
      const activeRaw = localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
      if (activeRaw) {
        const parsed: Session = JSON.parse(activeRaw);
        const startTime = parsed.startedAt || parsed.createdAt;
        if (startTime) {
          return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
        }
      }
    } catch {}
    return 0;
  });

  const [joinCodeParam, setJoinCodeParam] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('room')?.toUpperCase() || '';
    } catch {
      return '';
    }
  });

  const [historyInspectSession, setHistoryInspectSession] = useState<Session | null>(null);

  // Manage archived/previous sessions from localStorage
  const [previousSessions, setPreviousSessions] = useState<Session[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PREVIOUS_SESSIONS);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (err) {
      console.warn('Failed reading previous sessions from localStorage:', err);
    }
    return [];
  });

  // Save to localStorage whenever previousSessions changes
  const savePreviousSessions = (sessions: Session[]) => {
    setPreviousSessions(sessions);
    try {
      localStorage.setItem(STORAGE_KEY_PREVIOUS_SESSIONS, JSON.stringify(sessions));
    } catch (err) {
      console.warn('Failed writing previous sessions to localStorage:', err);
    }
  };

  // URL synchronization and background state verification on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (session && session.joinCode && session.status !== 'STOPPED') {
      // Keep ?room=CODE in URL so bookmarks / refresh stay synced
      if (!roomParam || roomParam.toUpperCase() !== session.joinCode.toUpperCase()) {
        const newUrl = `${window.location.pathname}?room=${session.joinCode}`;
        window.history.replaceState({}, '', newUrl);
      }

      // Re-fetch backend session to ensure participants and transcripts are synced
      getSessionApi(session.sessionId)
        .then((serverSession) => {
          if (serverSession && serverSession.status !== 'STOPPED') {
            setSession((prev) => {
              if (!prev) return serverSession;
              const localId = prev.participants.find((p) => p.isLocal)?.participantId;
              return {
                ...serverSession,
                participants: serverSession.participants.map((p) => ({
                  ...p,
                  isLocal: p.participantId === localId,
                })),
              };
            });
          } else if (serverSession && serverSession.status === 'STOPPED') {
            localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
            setCurrentView('evaluate');
          }
        })
        .catch(() => {
          // Keep active local session if backend temporarily unreachable
        });
    } else if (roomParam) {
      const code = roomParam.toUpperCase();
      setJoinCodeParam(code);
      setCurrentView('join');
      getSessionApi(code)
        .then((s) => {
          if (s) setSession(s);
        })
        .catch(() => {});
    }
  }, []);

  // Persist active session state to localStorage on every change
  useEffect(() => {
    if (session && session.status !== 'STOPPED') {
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_SESSION, JSON.stringify(session));
      } catch (e) {
        console.warn('Failed saving active session:', e);
      }
    } else if (session && session.status === 'STOPPED') {
      localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
    }
  }, [session]);

  // Live timer interval
  useEffect(() => {
    if (!session || session.status !== 'LIVE') return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.status]);

  const handleCreateSession = async (data: {
    sessionName: string;
    hostName: string;
    deviceId: string;
    joinCode: string;
  }) => {
    try {
      // Try creating session on real FastAPI backend
      const res = await createSessionApi({
        name: data.sessionName,
        hostName: data.hostName,
        deviceLabel: data.deviceId,
        deviceType: 'laptop',
        customJoinCode: data.joinCode,
      });

      const serverSession = res.session;
      serverSession.participants = [
        {
          ...res.participant,
          isLocal: true,
          isHost: true,
        },
      ];

      setSession(serverSession);
      setElapsedSeconds(0);
      setCurrentView('room');
    } catch (err) {
      console.warn('Backend not reached, initializing local real session:', err);
      // Clean local session
      const freshSession: Session = {
        sessionId: `ses-${Date.now()}`,
        joinCode: data.joinCode,
        name: data.sessionName,
        createdAt: Date.now(),
        startedAt: Date.now(),
        status: 'LIVE',
        participants: [
          {
            participantId: `p-${Date.now()}-1`,
            displayName: data.hostName,
            deviceId: `dev-host-${Math.floor(Math.random() * 899 + 100)}`,
            deviceType: 'laptop',
            deviceLabel: data.deviceId,
            joinedAt: Date.now(),
            lastSeenAt: Date.now(),
            connectionState: 'CONNECTED',
            microphoneState: 'ACTIVE',
            qualityScore: 98,
            isHost: true,
            isLocal: true,
            audioLevel: 0,
            tableAngle: 270,
          },
        ],
        transcriptSegments: [],
        metrics: {
          medianLatencyMs: 0,
          p95LatencyMs: 0,
          speechEvents: 0,
          correctionCount: 0,
          overlapCount: 0,
          deduplicatedEvents: 0,
          connectedDevices: 1,
          audioChunkLatencyMs: 0,
          asrLatencyMs: 0,
          fusionLatencyMs: 0,
        },
      };

      setSession(freshSession);
      setElapsedSeconds(0);
      setCurrentView('room');
    }
  };

  const handleJoinSession = async (data: {
    roomCode: string;
    displayName: string;
    deviceLabel: string;
    deviceType: 'mobile' | 'laptop' | 'tablet' | 'desktop';
  }) => {
    try {
      // 1. Try joining session on real FastAPI backend
      const res = await joinSessionApi(data.roomCode, {
        displayName: data.displayName,
        deviceLabel: data.deviceLabel,
        deviceType: data.deviceType,
      });

      const serverSession = res.session;
      serverSession.participants = serverSession.participants.map((p) => ({
        ...p,
        isLocal: p.participantId === res.participant.participantId,
      }));

      setSession(serverSession);
      setCurrentView('room');
    } catch (err) {
      console.warn('Backend not reached, joining locally:', err);
      const active = session || {
        sessionId: `ses-${Date.now()}`,
        joinCode: data.roomCode,
        name: `Roundtable ${data.roomCode}`,
        createdAt: Date.now(),
        startedAt: Date.now(),
        status: 'LIVE',
        participants: [],
        transcriptSegments: [],
        metrics: {
          medianLatencyMs: 0,
          p95LatencyMs: 0,
          speechEvents: 0,
          correctionCount: 0,
          overlapCount: 0,
          deduplicatedEvents: 0,
          connectedDevices: 1,
          audioChunkLatencyMs: 0,
          asrLatencyMs: 0,
          fusionLatencyMs: 0,
        },
      };

      const newParticipant: Participant = {
        participantId: `p-${Date.now()}`,
        displayName: data.displayName,
        deviceId: `device-${Math.floor(Math.random() * 899 + 100)}`,
        deviceType: data.deviceType,
        deviceLabel: data.deviceLabel,
        joinedAt: Date.now(),
        lastSeenAt: Date.now(),
        connectionState: 'CONNECTED',
        microphoneState: 'ACTIVE',
        qualityScore: 95,
        isLocal: true,
        isHost: false,
        audioLevel: 0,
        tableAngle: (active.participants.length * 60) % 360,
      };

      const updatedParticipants = active.participants.map((p) => ({
        ...p,
        isLocal: false,
      }));

      setSession({
        ...active,
        joinCode: data.roomCode,
        participants: [...updatedParticipants, newParticipant],
        metrics: {
          ...active.metrics,
          connectedDevices: updatedParticipants.length + 1,
        },
      });

      setCurrentView('room');
    }
  };

  // Conclude active session (Host action)
  const handleEndSession = async () => {
    localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
    window.history.replaceState({}, '', window.location.pathname);

    if (session) {
      try {
        await stopSessionApi(session.sessionId);
      } catch {
        // ignore if offline
      }

      const stoppedSession: Session = {
        ...session,
        status: 'STOPPED',
      };

      // Archive to previous sessions list
      const updatedHistory = [
        stoppedSession,
        ...previousSessions.filter((s) => s.sessionId !== stoppedSession.sessionId),
      ];
      savePreviousSessions(updatedHistory);

      // Preserve concluded session as the active evaluation snapshot
      setSession(stoppedSession);
      setHistoryInspectSession(stoppedSession);
    }
    // Navigate directly to evaluation view for the concluded session
    setCurrentView('evaluate');
  };

  // Leave active session (Guest action)
  const handleLeaveSession = () => {
    localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
    window.history.replaceState({}, '', window.location.pathname);
    setSession(null);
    setCurrentView('landing');
  };

  const handleClearHistory = () => {
    savePreviousSessions([]);
  };

  // Stable functional state updater from LiveRoomPage (guarantees zero effect churn)
  const handleUpdateSession = useCallback((updater: Session | ((prev: Session) => Session)) => {
    setSession((prev) => {
      if (!prev) return null;
      if (typeof updater === 'function') {
        return updater(prev);
      }
      return updater;
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#FFEDBF] text-[#1E1B16]">
      {/* Editorial Navigation */}
      <Navigation
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
        session={session}
        elapsedSeconds={elapsedSeconds}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {currentView === 'landing' && (
          <LandingPage
            onCreateSession={() => setCurrentView('create')}
            onJoinSession={(code) => {
              if (code) setJoinCodeParam(code);
              setCurrentView('join');
            }}
            onViewEvaluation={() => setCurrentView('evaluate')}
            onViewHistory={() => setCurrentView('history')}
          />
        )}

        {currentView === 'create' && (
          <CreateSessionPage
            onSessionCreated={handleCreateSession}
            onCancel={() => setCurrentView('landing')}
          />
        )}

        {currentView === 'join' && (
          <JoinSessionPage
            initialCode={joinCodeParam || session?.joinCode || ''}
            onJoinSession={handleJoinSession}
            onCancel={() => setCurrentView('landing')}
          />
        )}

        {currentView === 'room' && session && (session.status === 'LIVE' || session.status === 'PAUSED') && (
          <LiveRoomPage
            session={session}
            onUpdateSession={handleUpdateSession}
            onEndSession={handleEndSession}
            onLeaveSession={handleLeaveSession}
            onOpenEvaluation={() => setCurrentView('evaluate')}
            elapsedSeconds={elapsedSeconds}
          />
        )}

        {currentView === 'evaluate' && (
          <EvaluatePage
            session={session || historyInspectSession}
            onBack={() => {
              if (session && (session.status === 'LIVE' || session.status === 'PAUSED')) {
                setCurrentView('room');
              } else if (historyInspectSession || (session && session.status === 'STOPPED')) {
                setCurrentView('history');
              } else {
                setCurrentView('landing');
              }
            }}
          />
        )}

        {currentView === 'history' && (
          <HistoryPage
            previousSessions={previousSessions}
            onSelectSession={(selected) => {
              setHistoryInspectSession(selected);
              setCurrentView('evaluate');
            }}
            onClearHistory={handleClearHistory}
            onBack={() => setCurrentView('landing')}
            onCreateNew={() => setCurrentView('create')}
          />
        )}
      </main>
    </div>
  );
}

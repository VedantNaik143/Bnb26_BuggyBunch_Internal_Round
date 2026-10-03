/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>('landing');
  const [session, setSession] = useState<Session | null>(null);
  const [joinCodeParam, setJoinCodeParam] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
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

  // Check URL params for joining rooms
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const code = roomParam.toUpperCase();
      setJoinCodeParam(code);
      setCurrentView('join');
      // Attempt fetching session info from backend
      getSessionApi(code)
        .then((s) => {
          if (s) setSession(s);
        })
        .catch(() => {
          // ignore if backend not reachable yet
        });
    }
    // Clean initial load: No default running session
  }, []);

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

      // Remove from active live room sections
      setSession(null);
    }
    // Navigate cleanly to history view to see details of concluded session
    setCurrentView('history');
  };

  // Leave active session (Guest action)
  const handleLeaveSession = () => {
    setSession(null);
    setCurrentView('landing');
  };

  const handleClearHistory = () => {
    savePreviousSessions([]);
  };

  // Support functional state updater from LiveRoomPage
  const handleUpdateSession = (updater: Session | ((prev: Session) => Session)) => {
    setSession((prev) => {
      if (!prev) return null;
      if (typeof updater === 'function') {
        return updater(prev);
      }
      return updater;
    });
  };

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
              if (session && session.status === 'LIVE') {
                setCurrentView('room');
              } else if (historyInspectSession) {
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

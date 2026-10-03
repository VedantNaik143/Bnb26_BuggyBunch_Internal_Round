/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { LandingPage } from './pages/LandingPage';
import { CreateSessionPage } from './pages/CreateSessionPage';
import { JoinSessionPage } from './pages/JoinSessionPage';
import { LiveRoomPage } from './pages/LiveRoomPage';
import { EvaluatePage } from './pages/EvaluatePage';
import { Session, Participant } from './types/realtime';
import { createInitialSession } from './lib/simulation/mockRoomData';

export default function App() {
  const [currentView, setCurrentView] = useState<'landing' | 'create' | 'join' | 'room' | 'evaluate'>('landing');
  const [session, setSession] = useState<Session | null>(null);
  const [joinCodeParam, setJoinCodeParam] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(320); // start with ~5m elapsed in demo

  // Initialize or check URL params
  useEffect(() => {
    // Instantiate default demo session so user can jump straight into the Live Room anytime
    const initial = createInitialSession();
    setSession(initial);

    // Check if URL has ?room=XXXXX
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setJoinCodeParam(roomParam.toUpperCase());
      setCurrentView('join');
    }
  }, []);

  // Live timer interval
  useEffect(() => {
    if (!session || session.status !== 'LIVE') return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.status]);

  const handleCreateSession = (data: {
    sessionName: string;
    hostName: string;
    deviceId: string;
    joinCode: string;
  }) => {
    const newSession = createInitialSession(data.sessionName, data.hostName);
    newSession.joinCode = data.joinCode;
    newSession.participants[0] = {
      ...newSession.participants[0],
      displayName: data.hostName,
      deviceLabel: data.deviceId,
      isLocal: true,
      isHost: true,
    };
    setSession(newSession);
    setElapsedSeconds(0);
    setCurrentView('room');
  };

  const handleJoinSession = (data: {
    roomCode: string;
    displayName: string;
    deviceLabel: string;
    deviceType: 'mobile' | 'laptop' | 'tablet' | 'desktop';
  }) => {
    // If we have an existing session matching roomCode or create one
    const active = session || createInitialSession();
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
      audioLevel: 0,
      tableAngle: (active.participants.length * 60) % 360,
    };

    // Update existing participants to make others remote
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
  };

  const handleEndSession = () => {
    if (session) {
      setSession({
        ...session,
        status: 'STOPPED',
      });
    }
    setCurrentView('evaluate');
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

        {currentView === 'room' && session && (
          <LiveRoomPage
            session={session}
            onUpdateSession={(updated) => setSession(updated)}
            onEndSession={handleEndSession}
            onOpenEvaluation={() => setCurrentView('evaluate')}
            elapsedSeconds={elapsedSeconds}
          />
        )}

        {currentView === 'evaluate' && (
          <EvaluatePage
            session={session}
            onBack={() => setCurrentView(session ? 'room' : 'landing')}
          />
        )}
      </main>
    </div>
  );
}

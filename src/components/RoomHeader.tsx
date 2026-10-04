import React from 'react';
import { Radio, Pause, Play, Square, QrCode, Mic, MicOff, BarChart2, Share2, Layers, LogOut } from 'lucide-react';
import { Session } from '../types/realtime';
import { formatTime } from '../lib/formatting';

interface RoomHeaderProps {
  session: Session;
  elapsedSeconds: number;
  isMuted: boolean;
  isHost?: boolean;
  isLiveMode?: boolean;
  onToggleMode?: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onEndSession: () => void;
  onLeaveSession?: () => void;
  onOpenShareModal: () => void;
  onOpenEvaluation: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  session,
  elapsedSeconds,
  isMuted,
  isHost = true,
  isLiveMode = true,
  onToggleMode,
  onToggleMute,
  onTogglePause,
  onEndSession,
  onLeaveSession,
  onOpenShareModal,
  onOpenEvaluation,
}) => {
  const isLive = session.status === 'LIVE';
  const isPaused = session.status === 'PAUSED';

  return (
    <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg p-4 shadow-xs mb-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Room Title, Join Code, Status */}
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-xs text-[#315C4C] font-semibold tracking-wider uppercase flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-[#315C4C] animate-pulse' : 'bg-[#A65A32]'}`} />
              {session.status}
            </span>

            {/* Active Engine Badge */}
            {isLiveMode && (
              <>
                <span aria-hidden="true" className="text-[#D8CCAF]">
                  ·
                </span>
                <span
                  className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded bg-[#315C4C]/10 text-[#315C4C] border border-[#315C4C]/30"
                  title="Backend Gemini Live transcription stream active per acoustic source"
                >
                  ENGINE: {session.activeEngine || 'GEMINI LIVE'}
                </span>
              </>
            )}

            <span aria-hidden="true" className="text-[#D8CCAF]">
              ·
            </span>

            {/* Live / Demo Mode Badge Switcher */}
            {onToggleMode && (
              <>
                <button
                  onClick={onToggleMode}
                  className={`font-mono text-xs font-semibold px-2 py-0.5 rounded border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isLiveMode
                      ? 'bg-[#315C4C]/10 text-[#315C4C] border-[#315C4C]/30 hover:bg-[#315C4C]/20'
                      : 'bg-[#A65A32]/10 text-[#A65A32] border-[#A65A32]/30 hover:bg-[#A65A32]/20'
                  }`}
                  title="Click to toggle between Real Multi-Device Mesh (LIVE) and Presentation Simulation (DEMO)"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isLiveMode ? 'bg-[#315C4C]' : 'bg-[#A65A32]'}`} />
                  {isLiveMode ? 'LIVE MODE (Mesh)' : 'DEMO MODE (Sim)'}
                </button>

                <span aria-hidden="true" className="text-[#D8CCAF]">
                  ·
                </span>
              </>
            )}

            {/* Room Code Badge */}
            <button
              onClick={onOpenShareModal}
              className="font-mono text-xs text-[#1E1B16] font-semibold bg-[#FFEDBF] px-2 py-0.5 rounded border border-[#D8CCAF] hover:border-[#315C4C] transition-colors flex items-center gap-1 cursor-pointer"
              title="Click to open QR and invite link"
            >
              <QrCode className="w-3 h-3 text-[#315C4C]" />
              CODE: {session.joinCode}
            </button>

            <span aria-hidden="true" className="text-[#D8CCAF]">
              ·
            </span>

            {/* Session Timer */}
            <span className="font-mono text-xs font-semibold text-[#1E1B16]">
              {formatTime(elapsedSeconds)}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1E1B16] mt-1">
            {session.name}
          </h1>

          <div className="flex items-center gap-2 text-xs text-[#6A645B] mt-1 font-mono">
            <span>{session.participants.length} connected devices</span>
            <span>·</span>
            <span>{isLiveMode ? 'Real Distributed Acoustic Fusion' : 'Simulated Multimodal Turn Scenario'}</span>
          </div>
        </div>

        {/* Right: Controls & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mic Toggle */}
          <button
            onClick={onToggleMute}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer ${
              isMuted
                ? 'bg-[#9A3D35]/10 text-[#9A3D35] border-[#9A3D35]/30 hover:bg-[#9A3D35]/20'
                : 'bg-[#FFF8E8] text-[#315C4C] border-[#315C4C]/40 hover:bg-[#315C4C]/10'
            }`}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            {isMuted ? 'Mic Muted' : 'Mic Active'}
          </button>

          {/* Share / Invite */}
          <button
            onClick={onOpenShareModal}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#D8CCAF] bg-[#FFF8E8] text-[#1E1B16] hover:bg-[#FFEDBF]/50 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-[#315C4C]" />
            Share Room
          </button>

          {/* Evaluation Shortcut */}
          <button
            onClick={onOpenEvaluation}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#D8CCAF] bg-[#FFF8E8] text-[#1E1B16] hover:bg-[#FFEDBF]/50 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <BarChart2 className="w-3.5 h-3.5 text-[#4D6482]" />
            Acoustic Telemetry
          </button>

          {/* Pause / Resume */}
          <button
            onClick={onTogglePause}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#D8CCAF] bg-[#FFF8E8] text-[#1E1B16] hover:bg-[#FFEDBF]/50 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            {isPaused ? (
              <>
                <Play className="w-3.5 h-3.5 text-[#315C4C]" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 text-[#A65A32]" />
                Pause
              </>
            )}
          </button>

          {/* Host: End Session | Non-Host: Leave Room */}
          {isHost ? (
            <button
              onClick={onEndSession}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[#9A3D35]/30 bg-[#FFF8E8] text-[#9A3D35] hover:bg-[#9A3D35]/10 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Host only: End session for all connected devices"
            >
              <Square className="w-3 h-3" />
              End Session
            </button>
          ) : (
            <button
              onClick={onLeaveSession || onEndSession}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[#6A645B]/30 bg-[#FFF8E8] text-[#6A645B] hover:bg-[#6A645B]/10 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              title="Disconnect your device and return to overview"
            >
              <LogOut className="w-3.5 h-3.5" />
              Leave Room
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

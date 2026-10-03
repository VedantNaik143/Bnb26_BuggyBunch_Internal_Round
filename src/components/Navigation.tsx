import React from 'react';
import { Mic2, Radio, BarChart3, PlusCircle, LogIn, Disc3, History } from 'lucide-react';
import { Session } from '../types/realtime';
import { formatTime } from '../lib/formatting';

export type ViewType = 'landing' | 'create' | 'join' | 'room' | 'evaluate' | 'history';

interface NavigationProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  session: Session | null;
  elapsedSeconds: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentView,
  onNavigate,
  session,
  elapsedSeconds,
}) => {
  const isRoomLive = Boolean(session && (session.status === 'LIVE' || session.status === 'PAUSED'));

  return (
    <header className="sticky top-0 z-40 bg-[#FFF8E8] border-b border-[#D8CCAF]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand / Logo */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-2.5 text-left group focus:outline-none cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-[#315C4C] text-[#FFF8E8] flex items-center justify-center font-bold shadow-xs transition-transform group-hover:scale-105">
              <Disc3 className="w-4 h-4 animate-spin-slow" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-[#1E1B16] text-base leading-none block">
                ROUNDTABLE
              </span>
              <span className="text-[10px] text-[#6A645B] tracking-wide block font-mono">
                distributed acoustic fusion
              </span>
            </div>
          </button>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-[#6A645B]">
            <button
              onClick={() => onNavigate('landing')}
              className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                currentView === 'landing'
                  ? 'text-[#1E1B16] bg-[#FFEDBF]/60 font-semibold'
                  : 'hover:text-[#1E1B16] hover:bg-[#FFEDBF]/30'
              }`}
            >
              Overview
            </button>

            <button
              onClick={() => onNavigate('create')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                currentView === 'create'
                  ? 'text-[#1E1B16] bg-[#FFEDBF]/60 font-semibold'
                  : 'hover:text-[#1E1B16] hover:bg-[#FFEDBF]/30'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Create
            </button>

            <button
              onClick={() => onNavigate('join')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                currentView === 'join'
                  ? 'text-[#1E1B16] bg-[#FFEDBF]/60 font-semibold'
                  : 'hover:text-[#1E1B16] hover:bg-[#FFEDBF]/30'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Join Room
            </button>

            {/* Live Room link: only show if room is currently active */}
            {isRoomLive ? (
              <button
                onClick={() => onNavigate('room')}
                className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                  currentView === 'room'
                    ? 'text-[#315C4C] bg-[#FFEDBF]/60 font-bold'
                    : 'text-[#315C4C] hover:bg-[#FFEDBF]/30 font-medium'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                Live Room
                <span className="w-1.5 h-1.5 rounded-full bg-[#315C4C] animate-pulse ml-0.5" />
              </button>
            ) : null}

            <button
              onClick={() => onNavigate('history')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                currentView === 'history'
                  ? 'text-[#1E1B16] bg-[#FFEDBF]/60 font-semibold'
                  : 'hover:text-[#1E1B16] hover:bg-[#FFEDBF]/30'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Previous Sessions
            </button>

            <button
              onClick={() => onNavigate('evaluate')}
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                currentView === 'evaluate'
                  ? 'text-[#1E1B16] bg-[#FFEDBF]/60 font-semibold'
                  : 'hover:text-[#1E1B16] hover:bg-[#FFEDBF]/30'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Evaluation
            </button>
          </nav>
        </div>

        {/* Right side: Session Status or Start Session CTA */}
        <div className="flex items-center gap-3">
          {isRoomLive && session ? (
            <button
              onClick={() => onNavigate('room')}
              className="flex items-center gap-2.5 px-3 py-1 rounded-md border border-[#315C4C]/40 bg-[#315C4C]/10 hover:bg-[#315C4C]/20 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#315C4C] animate-pulse" />
                <span className="text-xs font-semibold text-[#315C4C] uppercase tracking-wider">
                  LIVE ROOM
                </span>
              </div>
              <span className="text-xs text-[#1E1B16] font-mono border-l border-[#D8CCAF] pl-2 font-bold">
                {session.joinCode}
              </span>
              <span className="text-xs text-[#6A645B] font-mono hidden sm:inline">
                {formatTime(elapsedSeconds)}
              </span>
            </button>
          ) : (
            <button
              onClick={() => onNavigate('create')}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[#315C4C] text-[#FFF8E8] hover:bg-[#27493C] transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Mic2 className="w-3.5 h-3.5" />
              Start Session
            </button>
          )}
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="md:hidden flex items-center justify-around border-t border-[#D8CCAF]/60 bg-[#FFF8E8] px-2 py-1.5 text-xs text-[#6A645B]">
        <button
          onClick={() => onNavigate('landing')}
          className={`px-2 py-1 ${currentView === 'landing' ? 'text-[#1E1B16] font-bold' : ''}`}
        >
          Overview
        </button>
        <button
          onClick={() => onNavigate('create')}
          className={`px-2 py-1 ${currentView === 'create' ? 'text-[#1E1B16] font-bold' : ''}`}
        >
          Create
        </button>
        <button
          onClick={() => onNavigate('join')}
          className={`px-2 py-1 ${currentView === 'join' ? 'text-[#1E1B16] font-bold' : ''}`}
        >
          Join
        </button>
        {isRoomLive && (
          <button
            onClick={() => onNavigate('room')}
            className={`px-2 py-1 flex items-center gap-1 ${currentView === 'room' ? 'text-[#315C4C] font-bold' : 'text-[#315C4C]'}`}
          >
            Live
            <span className="w-1.5 h-1.5 rounded-full bg-[#315C4C] animate-pulse" />
          </button>
        )}
        <button
          onClick={() => onNavigate('history')}
          className={`px-2 py-1 ${currentView === 'history' ? 'text-[#1E1B16] font-bold' : ''}`}
        >
          History
        </button>
        <button
          onClick={() => onNavigate('evaluate')}
          className={`px-2 py-1 ${currentView === 'evaluate' ? 'text-[#1E1B16] font-bold' : ''}`}
        >
          Eval
        </button>
      </div>
    </header>
  );
};

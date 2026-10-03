import React from 'react';
import { Laptop, Smartphone, Tablet, Mic, MicOff, Volume2, Wifi, WifiOff } from 'lucide-react';
import { Participant } from '../types/realtime';
import { AudioLevelMeter } from './AudioLevelMeter';

interface ParticipantCardProps {
  participant: Participant;
  isSelf?: boolean;
  onToggleMute?: (participantId: string) => void;
  onSimulateDrop?: (participantId: string) => void;
}

export const ParticipantCard: React.FC<ParticipantCardProps> = ({
  participant,
  isSelf = false,
  onToggleMute,
  onSimulateDrop,
}) => {
  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'laptop':
        return <Laptop className="w-3.5 h-3.5 text-[#6A645B]" />;
      case 'tablet':
        return <Tablet className="w-3.5 h-3.5 text-[#6A645B]" />;
      default:
        return <Smartphone className="w-3.5 h-3.5 text-[#6A645B]" />;
    }
  };

  const isConnected = participant.connectionState === 'CONNECTED';
  const isTemporarilyLost = participant.connectionState === 'TEMPORARILY_LOST';
  const isMuted = participant.microphoneState === 'MUTED';
  const isNoisy = participant.microphoneState === 'NOISY';

  return (
    <div
      className={`p-3 rounded-md border transition-all duration-150 ${
        !isConnected
          ? 'bg-[#FFEDBF]/30 border-dashed border-[#A65A32]/60 opacity-80'
          : isSelf
          ? 'bg-[#FFEDBF]/50 border-[#315C4C]/40 shadow-2xs'
          : 'bg-[#FFF8E8] border-[#D8CCAF]'
      }`}
    >
      {/* Top row: Name & Controls */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          {getDeviceIcon(participant.deviceType)}
          <span className="font-semibold text-[13px] text-[#1E1B16] leading-none">
            {participant.displayName}
            {isSelf && (
              <span className="text-[11px] font-normal text-[#315C4C] ml-1">
                (You)
              </span>
            )}
            {participant.isHost && (
              <span className="text-[10px] font-mono text-[#6A645B] ml-1">
                [Host]
              </span>
            )}
          </span>
        </div>

        {/* Mute action */}
        {onToggleMute && (
          <button
            onClick={() => onToggleMute(participant.participantId)}
            className={`p-1 rounded text-xs transition-colors ${
              isMuted
                ? 'text-[#9A3D35] hover:bg-[#FFEDBF]'
                : 'text-[#315C4C] hover:bg-[#FFEDBF]'
            }`}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Middle row: Device label & audio level */}
      <div className="flex items-center justify-between text-xs text-[#6A645B] mb-2 font-mono text-[11px]">
        <span>{participant.deviceLabel}</span>
        {isConnected && !isMuted && (
          <AudioLevelMeter level={participant.audioLevel || 0} bars={6} />
        )}
      </div>

      {/* Bottom row: Connection status + Simulate Action */}
      <div className="pt-2 border-t border-[#D8CCAF]/40 flex items-center justify-between text-[11px]">
        {/* Status text + symbol */}
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <span className="flex items-center gap-1 text-[#315C4C] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#315C4C]" />
              ● Connected
            </span>
          ) : isTemporarilyLost ? (
            <span className="flex items-center gap-1 text-[#A65A32] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A65A32] animate-ping" />
              ○ Reconnecting...
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[#9A3D35] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#9A3D35]" />
              ○ Offline
            </span>
          )}

          {isNoisy && isConnected && (
            <span className="text-[#A65A32] ml-1">△ Noisy</span>
          )}
          {isMuted && isConnected && (
            <span className="text-[#6A645B] ml-1">✕ Muted</span>
          )}
        </div>
      </div>
    </div>
  );
};

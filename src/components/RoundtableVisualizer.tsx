import React from 'react';
import { Laptop, Smartphone, Tablet, Radio, Layers, Volume2 } from 'lucide-react';
import { Participant } from '../types/realtime';

interface RoundtableVisualizerProps {
  participants: Participant[];
  activeSpeakerId?: string | null;
  compact?: boolean;
}

export const RoundtableVisualizer: React.FC<RoundtableVisualizerProps> = ({
  participants,
  activeSpeakerId,
  compact = false,
}) => {
  const activeParticipant = participants.find((p) => p.participantId === activeSpeakerId);

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'laptop':
        return <Laptop className="w-3.5 h-3.5" />;
      case 'tablet':
        return <Tablet className="w-3.5 h-3.5" />;
      default:
        return <Smartphone className="w-3.5 h-3.5" />;
    }
  };

  const size = compact ? 240 : 360;
  const center = size / 2;
  const radius = compact ? 80 : 125;

  return (
    <div className={`flex flex-col items-center select-none ${compact ? 'py-2' : 'p-6'}`}>
      {!compact && (
        <div className="w-full mb-4">
          <div className="flex items-center justify-between text-xs text-[#6A645B]">
            <span className="font-semibold tracking-wider text-[#1E1B16] uppercase text-[11px]">
              Distributed Acoustic Geometry
            </span>
            <span className="font-mono text-[11px] text-[#315C4C] flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#315C4C] animate-pulse"></span>
              Multi-Device Fusion Active
            </span>
          </div>
          <p className="text-xs text-[#6A645B] mt-1">
            Independent acoustic observation nodes around a shared table. The engine weights the closest microphone and suppresses echo duplicates.
          </p>
        </div>
      )}

      {/* SVG Canvas for Spatial Diagram */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="overflow-visible">
          {/* Table Surface */}
          <circle
            cx={center}
            cy={center}
            r={radius - (compact ? 12 : 18)}
            fill="#FFF8E8"
            stroke="#D8CCAF"
            strokeWidth="1.5"
            strokeDasharray={compact ? 'none' : '4 4'}
          />

          {/* Table Center Graphic: Fusion Core */}
          <circle
            cx={center}
            cy={center}
            r={compact ? 24 : 36}
            fill="#FFEDBF"
            stroke="#315C4C"
            strokeWidth="1.5"
          />

          {/* Fusion Wave Rings when someone is speaking */}
          {activeParticipant && (
            <>
              <circle
                cx={center}
                cy={center}
                r={compact ? 34 : 52}
                fill="none"
                stroke="#315C4C"
                strokeWidth="1"
                opacity="0.4"
                className="animate-ping"
              />
              <circle
                cx={center}
                cy={center}
                r={compact ? 44 : 68}
                fill="none"
                stroke="#315C4C"
                strokeWidth="1"
                opacity="0.2"
              />
            </>
          )}

          {/* Rays connecting each device to the central fusion hub */}
          {participants.map((p) => {
            const rad = ((p.tableAngle - 90) * Math.PI) / 180;
            const x = center + radius * Math.cos(rad);
            const y = center + radius * Math.sin(rad);
            const isActive = p.participantId === activeSpeakerId;

            return (
              <g key={`ray-${p.participantId}`}>
                <line
                  x1={center}
                  y1={center}
                  x2={x}
                  y2={y}
                  stroke={isActive ? '#315C4C' : '#D8CCAF'}
                  strokeWidth={isActive ? '2' : '1'}
                  strokeDasharray={isActive ? 'none' : '2 3'}
                  opacity={isActive ? 1 : 0.6}
                />
              </g>
            );
          })}
        </svg>

        {/* Center Label inside SVG Table */}
        <div
          className="absolute flex flex-col items-center justify-center text-center pointer-events-none"
          style={{
            top: center - (compact ? 20 : 30),
            left: center - (compact ? 20 : 30),
            width: compact ? 40 : 60,
            height: compact ? 40 : 60,
          }}
        >
          <Layers className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} text-[#315C4C] mb-0.5`} />
          <span className="text-[9px] font-bold tracking-tight text-[#1E1B16] leading-none uppercase">
            Fusion
          </span>
          <span className="text-[8px] font-mono text-[#6A645B] leading-none mt-0.5">
            {participants.filter(p => p.connectionState === 'CONNECTED').length} mics
          </span>
        </div>

        {/* Participant Device Nodes around Table */}
        {participants.map((p) => {
          const rad = ((p.tableAngle - 90) * Math.PI) / 180;
          const x = center + radius * Math.cos(rad);
          const y = center + radius * Math.sin(rad);
          const isActive = p.participantId === activeSpeakerId;
          const isMuted = p.microphoneState === 'MUTED';
          const isLost = p.connectionState !== 'CONNECTED';

          return (
            <div
              key={p.participantId}
              className="absolute -translate-x-1/2 -translate-y-1/2 group transition-transform duration-200"
              style={{ top: `${y}px`, left: `${x}px` }}
            >
              <div
                className={`relative flex items-center justify-center rounded-full transition-all duration-300 ${
                  compact ? 'w-7 h-7' : 'w-9 h-9'
                } ${
                  isActive
                    ? 'bg-[#315C4C] text-[#FFF8E8] ring-4 ring-[#315C4C]/20 scale-110 shadow-sm'
                    : isLost
                    ? 'bg-[#FFF8E8] text-[#9A3D35] border border-dashed border-[#9A3D35]'
                    : isMuted
                    ? 'bg-[#FFF8E8] text-[#6A645B] border border-[#D8CCAF] opacity-60'
                    : 'bg-[#FFF8E8] text-[#1E1B16] border border-[#D8CCAF] shadow-xs'
                }`}
              >
                {getDeviceIcon(p.deviceType)}

                {/* Speaking indicator dot */}
                {isActive && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#FFF8E8] border border-[#315C4C] rounded-full flex items-center justify-center">
                    <span className="w-1.5 h-1.5 bg-[#315C4C] rounded-full animate-ping" />
                  </span>
                )}
              </div>

              {/* Tooltip / Label */}
              <div
                className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-center pointer-events-none transition-opacity ${
                  compact ? 'top-8' : 'top-10'
                }`}
              >
                <div className="text-[11px] font-medium text-[#1E1B16] leading-none bg-[#FFF8E8]/90 px-1 py-0.5 rounded border border-[#D8CCAF]/60">
                  {p.displayName.split(' ')[0]}
                  {p.isLocal && ' (You)'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Acoustic Evidence Status Bar */}
      <div className={`w-full mt-3 text-xs bg-[#FFF8E8] border border-[#D8CCAF] rounded-md ${compact ? 'p-2' : 'p-3'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-3.5 h-3.5 text-[#315C4C]" />
            <span className="text-[#1E1B16] font-medium text-[11px]">
              {activeParticipant ? (
                <>
                  <span className="text-[#315C4C] font-semibold">{activeParticipant.displayName}</span> is dominant speaker
                </>
              ) : (
                'Listening for speech across all devices'
              )}
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#6A645B]">
            {activeParticipant ? `Primary: ${activeParticipant.deviceLabel}` : 'Spatial beam idle'}
          </span>
        </div>

        {activeParticipant && !compact && (
          <div className="mt-2 pt-2 border-t border-[#D8CCAF]/40 flex items-center justify-between text-[11px] text-[#6A645B]">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-3 h-3 text-[#315C4C]" />
              Signal quality: {activeParticipant.qualityScore}%
            </span>
            <span className="font-mono text-[10px] text-[#315C4C]">
              Cross-device echo suppressed (3 channels)
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

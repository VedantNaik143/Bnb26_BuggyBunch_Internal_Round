import React from 'react';
import { Users, UserPlus, MicOff, Volume2 } from 'lucide-react';
import { Participant } from '../types/realtime';
import { ParticipantCard } from './ParticipantCard';

interface ParticipantListProps {
  participants: Participant[];
  onToggleMute: (participantId: string) => void;
  onSimulateDrop: (participantId: string) => void;
  onInviteClick: () => void;
  onSimulateJoin: () => void;
}

export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  onToggleMute,
  onSimulateDrop,
  onInviteClick,
  onSimulateJoin,
}) => {
  const connectedCount = participants.filter((p) => p.connectionState === 'CONNECTED').length;

  return (
    <div className="flex flex-col bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#D8CCAF] bg-[#FFEDBF]/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#315C4C]" />
          <h3 className="font-bold tracking-tight text-[#1E1B16] text-[13px] uppercase">
            Acoustic Nodes
          </h3>
          <span aria-hidden="true" className="text-[#D8CCAF]">
            ·
          </span>
          <span className="font-mono text-xs text-[#6A645B]">
            {connectedCount}/{participants.length} Active
          </span>
        </div>

        <button
          onClick={onInviteClick}
          className="text-xs font-semibold text-[#315C4C] hover:text-[#27493C] flex items-center gap-1 hover:underline"
        >
          <UserPlus className="w-3.5 h-3.5" />
          + Invite Device
        </button>
      </div>

      {/* Roster Cards */}
      <div className="p-3 space-y-2.5 max-h-[380px] overflow-y-auto">
        {participants.map((participant) => (
          <ParticipantCard
            key={participant.participantId}
            participant={participant}
            isSelf={participant.isLocal}
            onToggleMute={onToggleMute}
            onSimulateDrop={onSimulateDrop}
          />
        ))}
      </div>

      {/* Footer Helper */}
      <div className="p-2.5 bg-[#FFEDBF]/20 border-t border-[#D8CCAF] flex items-center justify-between text-[11px] text-[#6A645B]">
        <span>Each microphone is an independent observation node</span>
        <button
          onClick={onSimulateJoin}
          className="text-[#315C4C] font-mono hover:underline"
          title="Add a 6th participant device to room"
        >
          + Add Device
        </button>
      </div>
    </div>
  );
};

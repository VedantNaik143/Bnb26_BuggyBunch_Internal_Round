import React from 'react';
import { Layers, RefreshCw, Layers2, ShieldCheck, Cpu } from 'lucide-react';
import { SessionMetrics } from '../types/realtime';

interface SessionStatsProps {
  metrics: SessionMetrics;
}

export const SessionStats: React.FC<SessionStatsProps> = ({ metrics }) => {
  return (
    <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg p-3 shadow-xs">
      <div className="flex items-center justify-between text-xs text-[#6A645B] mb-2.5">
        <span className="font-semibold text-[#1E1B16] text-[11px] tracking-wide uppercase flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-[#315C4C]" />
          Acoustic Evidence Metrics
        </span>
        <span className="font-mono text-[11px] text-[#6A645B]">
          In-Memory Telemetry
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Echo Suppressed */}
        <div className="p-2 bg-[#FFEDBF]/30 rounded border border-[#D8CCAF]/50">
          <span className="text-[10px] text-[#6A645B] block font-mono flex items-center gap-1">
            <Layers className="w-3 h-3 text-[#315C4C]" />
            Echo Deduplicated
          </span>
          <span className="text-base font-bold font-mono text-[#1E1B16] mt-0.5 block">
            {metrics.deduplicatedEvents}
            <span className="text-[10px] font-normal text-[#6A645B] ml-1">turns</span>
          </span>
        </div>

        {/* Simultaneous Overlaps */}
        <div className="p-2 bg-[#FFEDBF]/30 rounded border border-[#D8CCAF]/50">
          <span className="text-[10px] text-[#6A645B] block font-mono flex items-center gap-1">
            <Layers2 className="w-3 h-3 text-[#315C4C]" />
            Overlaps Isolated
          </span>
          <span className="text-base font-bold font-mono text-[#1E1B16] mt-0.5 block">
            {metrics.overlapCount}
            <span className="text-[10px] font-normal text-[#6A645B] ml-1">events</span>
          </span>
        </div>

        {/* In-place Corrections */}
        <div className="p-2 bg-[#FFEDBF]/30 rounded border border-[#D8CCAF]/50">
          <span className="text-[10px] text-[#6A645B] block font-mono flex items-center gap-1">
            <RefreshCw className="w-3 h-3 text-[#315C4C]" />
            In-Place Revisions
          </span>
          <span className="text-base font-bold font-mono text-[#1E1B16] mt-0.5 block">
            {metrics.correctionCount}
            <span className="text-[10px] font-normal text-[#6A645B] ml-1">words</span>
          </span>
        </div>

        {/* Total Speech Events */}
        <div className="p-2 bg-[#FFEDBF]/30 rounded border border-[#D8CCAF]/50">
          <span className="text-[10px] text-[#6A645B] block font-mono flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-[#315C4C]" />
            Total Utterances
          </span>
          <span className="text-base font-bold font-mono text-[#1E1B16] mt-0.5 block">
            {metrics.speechEvents}
            <span className="text-[10px] font-normal text-[#6A645B] ml-1">nodes</span>
          </span>
        </div>
      </div>
    </div>
  );
};

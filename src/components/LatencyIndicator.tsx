import React from 'react';
import { Activity, Gauge, Server, Wifi } from 'lucide-react';
import { SessionMetrics } from '../types/realtime';

interface LatencyIndicatorProps {
  metrics: SessionMetrics;
  compact?: boolean;
}

export const LatencyIndicator: React.FC<LatencyIndicatorProps> = ({
  metrics,
  compact = false,
}) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 font-mono text-xs text-[#6A645B] bg-[#FFF8E8] border border-[#D8CCAF] px-2.5 py-1 rounded">
        <Activity className="w-3.5 h-3.5 text-[#315C4C]" />
        <span>
          <strong className="text-[#1E1B16]">{metrics.medianLatencyMs}ms</strong> median
        </span>
        <span className="text-[#D8CCAF]">|</span>
        <span>16kHz PCM</span>
      </div>
    );
  }

  return (
    <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg p-3 shadow-xs">
      <div className="flex items-center justify-between text-xs text-[#6A645B] mb-2">
        <span className="font-semibold text-[#1E1B16] text-[11px] tracking-wide uppercase flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-[#315C4C]" />
          Acoustic Pipeline Latency
        </span>
        <span className="font-mono text-[11px] text-[#315C4C] flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#315C4C] animate-pulse" />
          Live Stream
        </span>
      </div>

      {/* Main Latency Readout */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="p-2 bg-[#FFEDBF]/40 rounded border border-[#D8CCAF]/60">
          <span className="block text-[10px] text-[#6A645B] uppercase font-mono">
            Median Latency (P50)
          </span>
          <span className="text-xl font-bold font-mono text-[#1E1B16]">
            {metrics.medianLatencyMs}
            <span className="text-xs font-normal text-[#6A645B] ml-0.5">ms</span>
          </span>
        </div>

        <div className="p-2 bg-[#FFEDBF]/40 rounded border border-[#D8CCAF]/60">
          <span className="block text-[10px] text-[#6A645B] uppercase font-mono">
            Tail Latency (P95)
          </span>
          <span className="text-xl font-bold font-mono text-[#1E1B16]">
            {metrics.p95LatencyMs}
            <span className="text-xs font-normal text-[#6A645B] ml-0.5">ms</span>
          </span>
        </div>
      </div>

      {/* Pipeline Hop Breakdown */}
      <div className="space-y-1.5 text-[11px] font-mono border-t border-[#D8CCAF]/40 pt-2 text-[#6A645B]">
        <div className="flex items-center justify-between">
          <span>AudioWorklet PCM buffer</span>
          <span className="text-[#1E1B16]">{metrics.audioChunkLatencyMs}ms</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Gemini Live ASR stream</span>
          <span className="text-[#1E1B16]">{metrics.asrLatencyMs}ms</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Multi-Device Fusion &amp; Dedupe</span>
          <span className="text-[#1E1B16]">{metrics.fusionLatencyMs}ms</span>
        </div>
      </div>
    </div>
  );
};

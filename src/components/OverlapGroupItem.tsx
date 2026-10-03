import React from 'react';
import { Layers2, Clock } from 'lucide-react';
import { CaptionSegment } from '../types/realtime';
import { formatTimestampMs } from '../lib/formatting';

interface OverlapGroupItemProps {
  segments: CaptionSegment[];
}

export const OverlapGroupItem: React.FC<OverlapGroupItemProps> = ({ segments }) => {
  const earliestTime = Math.min(...segments.map((s) => s.startMs));

  return (
    <div className="my-3 border border-[#D8CCAF] rounded-md bg-[#FFF8E8] shadow-2xs overflow-hidden">
      {/* Overlap Technical Header */}
      <div className="bg-[#FFEDBF]/60 px-3.5 py-1.5 border-b border-[#D8CCAF] flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Layers2 className="w-3.5 h-3.5 text-[#315C4C]" />
          <span className="font-semibold text-[#1E1B16] text-[11px] tracking-wide uppercase">
            Simultaneous Speech
          </span>
          <span aria-hidden="true" className="text-[#D8CCAF]">
            ·
          </span>
          <span className="font-mono text-[11px] text-[#6A645B]">
            {segments.length} speakers overlapping
          </span>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#6A645B]">
          <Clock className="w-3 h-3 text-[#D8CCAF]" />
          <span>{formatTimestampMs(earliestTime)}</span>
        </div>
      </div>

      {/* Parallel Split Streams */}
      <div className="divide-y divide-[#D8CCAF]/40">
        {segments.map((segment) => (
          <div
            key={segment.segmentId}
            className="p-3 hover:bg-[#FFEDBF]/10 transition-colors"
          >
            <div className="flex items-center justify-between text-xs text-[#6A645B] mb-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#1E1B16] text-[13px]">
                  {segment.speakerName}
                </span>
                <span aria-hidden="true" className="text-[#D8CCAF]">
                  ·
                </span>
                <span className="font-mono text-[11px] text-[#6A645B]">
                  {segment.sourceDeviceId}
                </span>
              </div>
              <span className="font-mono text-[10px] text-[#315C4C]">
                spatial source isolated
              </span>
            </div>

            <p className="text-[15px] text-[#1E1B16] leading-relaxed">
              {segment.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

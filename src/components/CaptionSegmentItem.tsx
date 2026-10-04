import React from 'react';
import { Layers, CheckCircle2, Clock } from 'lucide-react';
import { CaptionSegment } from '../types/realtime';
import { formatTimestampMs } from '../lib/formatting';

interface CaptionSegmentItemProps {
  segment: CaptionSegment;
  isLatest?: boolean;
}

export const CaptionSegmentItem: React.FC<CaptionSegmentItemProps> = ({
  segment,
  isLatest = false,
}) => {
  const isProvisional = segment.status === 'PROVISIONAL';
  const isUpdated = segment.status === 'UPDATED';
  const isFinal = segment.status === 'FINAL';

  return (
    <div
      className={`group relative pl-4 py-2 transition-all duration-200 border-l-2 ${
        isProvisional
          ? 'border-[#A65A32] bg-[#FFEDBF]/20'
          : isUpdated
          ? 'border-[#4D6482] bg-[#FFEDBF]/10'
          : 'border-[#315C4C]'
      }`}
    >
      {/* Speaker and Metadata header */}
      <div className="flex items-center justify-between text-xs text-[#6A645B] mb-1">
        <div className="flex items-center gap-2">
          {/* Speaker Name */}
          <span className="font-semibold text-[#1E1B16] text-[13px]">
            {segment.speakerName}
          </span>

          {/* Typographic separator */}
          <span aria-hidden="true" className="text-[#D8CCAF]">
            ·
          </span>

          {/* Device Label */}
          <span className="font-mono text-[11px] text-[#6A645B]">
            {segment.sourceDeviceId}
          </span>

          {/* Engine indicator */}
          {segment.engine && (
            <>
              <span aria-hidden="true" className="text-[#D8CCAF]">
                ·
              </span>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                  segment.engine === 'GEMINI_LIVE'
                    ? 'bg-[#315C4C]/10 text-[#315C4C]'
                    : segment.engine === 'LOCAL_FALLBACK'
                    ? 'bg-[#A65A32]/15 text-[#A65A32]'
                    : 'bg-[#6A645B]/10 text-[#6A645B]'
                }`}
              >
                {segment.engine === 'GEMINI_LIVE'
                  ? 'GEMINI LIVE'
                  : segment.engine === 'LOCAL_FALLBACK'
                  ? 'LOCAL FALLBACK'
                  : segment.engine}
              </span>
            </>
          )}

          {/* Corroboration badge if multiple devices contributed */}
          {((segment.corroboratingDevices && segment.corroboratingDevices.length > 1) ||
            (segment.duplicateSourcesCount && segment.duplicateSourcesCount > 1)) && (
            <>
              <span aria-hidden="true" className="text-[#D8CCAF]">
                ·
              </span>
              <span className="text-[10px] text-[#315C4C] font-mono flex items-center gap-1 bg-[#315C4C]/10 px-1.5 py-0.5 rounded font-semibold">
                <Layers className="w-3 h-3" />
                {segment.corroboratingDevices?.length || segment.duplicateSourcesCount} devices corroborating
              </span>
              <span aria-hidden="true" className="text-[#D8CCAF]">
                ·
              </span>
              <span className="text-[10px] text-[#315C4C] font-mono capitalize">
                {segment.confidence} confidence
              </span>
            </>
          )}
        </div>

        {/* Right side: Timestamp & status state */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-[#6A645B] flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#D8CCAF]" />
            {formatTimestampMs(segment.startMs)}
          </span>

          <span aria-hidden="true" className="text-[#D8CCAF]">
            ·
          </span>

          {isProvisional ? (
            <span className="text-[#A65A32] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A65A32] animate-pulse" />
              provisional
            </span>
          ) : isUpdated ? (
            <span className="text-[#4D6482] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4D6482]" />
              refined
            </span>
          ) : (
            <span className="text-[#315C4C] flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              final
            </span>
          )}
        </div>
      </div>

      {/* Caption Content Text */}
      <p
        className={`text-[15px] sm:text-[16px] leading-relaxed select-text transition-colors duration-150 ${
          isProvisional
            ? 'text-[#1E1B16]/80 italic'
            : isUpdated
            ? 'text-[#1E1B16] font-normal'
            : 'text-[#1E1B16] font-normal'
        }`}
      >
        {segment.text}
        {isProvisional && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-[#A65A32] animate-pulse align-middle" />
        )}
      </p>
    </div>
  );
};

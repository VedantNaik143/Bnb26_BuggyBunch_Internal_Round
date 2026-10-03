import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowDown, Download, Mic, MicOff, Send } from 'lucide-react';
import { CaptionSegment, Session } from '../types/realtime';
import { CaptionSegmentItem } from './CaptionSegmentItem';
import { OverlapGroupItem } from './OverlapGroupItem';
import { exportTranscriptAsTxt, exportTranscriptAsJson } from '../lib/formatting';

interface LiveTranscriptProps {
  session: Session;
  onSendLocalSpeech?: (text: string) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export const LiveTranscript: React.FC<LiveTranscriptProps> = ({
  session,
  onSendLocalSpeech,
  isMuted = false,
  onToggleMute,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [customText, setCustomText] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Group overlapping segments by overlapGroupId
  const processedItems = React.useMemo(() => {
    const items: Array<{ type: 'single'; segment: CaptionSegment } | { type: 'overlap'; segments: CaptionSegment[] }> = [];
    const seenOverlapGroups = new Set<string>();

    session.transcriptSegments.forEach((segment) => {
      // Apply search filter if query is present
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matches =
          segment.text.toLowerCase().includes(query) ||
          segment.speakerName.toLowerCase().includes(query);
        if (!matches) return;
      }

      if (segment.overlap && segment.overlapGroupId) {
        if (!seenOverlapGroups.has(segment.overlapGroupId)) {
          seenOverlapGroups.add(segment.overlapGroupId);
          const groupSegments = session.transcriptSegments.filter(
            (s) => s.overlapGroupId === segment.overlapGroupId
          );
          items.push({ type: 'overlap', segments: groupSegments });
        }
      } else {
        items.push({ type: 'single', segment });
      }
    });

    return items;
  }, [session.transcriptSegments, searchQuery]);

  // Safe inner auto-scroll: does not hijack the outer window scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [session.transcriptSegments.length, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim() || !onSendLocalSpeech) return;
    onSendLocalSpeech(customText.trim());
    setCustomText('');
  };

  return (
    <div className="flex flex-col h-full bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs overflow-hidden">
      {/* Transcript Toolbar */}
      <div className="p-3 border-b border-[#D8CCAF] bg-[#FFEDBF]/30 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold tracking-tight text-[#1E1B16] text-[13px] uppercase">
            Shared Room Transcript
          </span>
          <span aria-hidden="true" className="text-[#D8CCAF]">
            ·
          </span>
          <span className="font-mono text-[#6A645B]">
            {session.transcriptSegments.length} turns
          </span>
          {!isMuted && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#315C4C] bg-[#315C4C]/10 px-2 py-0.5 rounded border border-[#315C4C]/20">
              <span className="w-1.5 h-1.5 rounded-full bg-[#315C4C] animate-pulse" />
              Mic Active (Continuous)
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6A645B]" />
            <input
              type="text"
              placeholder="Search transcript..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 bg-[#FFF8E8] border border-[#D8CCAF] rounded text-xs text-[#1E1B16] placeholder:text-[#6A645B]/60 focus:outline-none focus:ring-1 focus:ring-[#315C4C] w-36 sm:w-44"
            />
          </div>

          {/* Export Actions */}
          <button
            onClick={() => exportTranscriptAsTxt(session)}
            className="px-2.5 py-1 text-xs font-medium rounded border border-[#D8CCAF] bg-[#FFF8E8] hover:bg-[#FFEDBF]/60 text-[#1E1B16] transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
            title="Download plain text transcript"
          >
            <Download className="w-3 h-3 text-[#315C4C]" />
            .TXT
          </button>

          <button
            onClick={() => exportTranscriptAsJson(session)}
            className="px-2.5 py-1 text-xs font-medium rounded border border-[#D8CCAF] bg-[#FFF8E8] hover:bg-[#FFEDBF]/60 text-[#1E1B16] transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
            title="Download full JSON session data"
          >
            .JSON
          </button>
        </div>
      </div>

      {/* Main Transcript Body */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 select-text bg-[#FFF8E8]"
      >
        {processedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#6A645B] text-center space-y-2">
            <p className="text-sm font-semibold text-[#1E1B16]">Awaiting live speech...</p>
            <p className="text-xs text-[#6A645B] max-w-sm">
              Press the microphone button below to talk freely, or type a sentence and press Transcribe.
            </p>
          </div>
        ) : (
          processedItems.map((item, idx) => {
            if (item.type === 'overlap') {
              return <OverlapGroupItem key={`overlap-${idx}`} segments={item.segments} />;
            }
            return (
              <CaptionSegmentItem
                key={item.segment.segmentId}
                segment={item.segment}
                isLatest={idx === processedItems.length - 1}
              />
            );
          })
        )}
      </div>

      {/* Auto-scroll resume prompt */}
      {!autoScroll && (
        <div className="bg-[#FFEDBF] border-t border-[#D8CCAF] px-3 py-1 flex items-center justify-between text-xs text-[#1E1B16]">
          <span className="italic text-[#6A645B]">Viewing historical transcript</span>
          <button
            onClick={() => {
              setAutoScroll(true);
              if (containerRef.current) {
                containerRef.current.scrollTop = containerRef.current.scrollHeight;
              }
            }}
            className="font-medium text-[#315C4C] hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
          >
            <ArrowDown className="w-3 h-3" />
            Jump to latest caption
          </button>
        </div>
      )}

      {/* Local Participant Input Bar */}
      <div className="p-3 border-t border-[#D8CCAF] bg-[#FFEDBF]/20">
        <form onSubmit={handleCustomSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            {/* Interactive Mic Toggle Button: stays ON until clicked again */}
            <button
              type="button"
              onClick={onToggleMute}
              className={`absolute left-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all cursor-pointer ${
                !isMuted
                  ? 'bg-[#315C4C] text-[#FFF8E8] shadow-xs ring-2 ring-[#315C4C]/30 animate-pulse'
                  : 'bg-[#FFEDBF] text-[#6A645B] hover:text-[#1E1B16] hover:bg-[#FFEDBF]/80'
              }`}
              title={
                !isMuted
                  ? 'Microphone is ON and listening continuously. Click to mute.'
                  : 'Microphone is OFF. Click to start continuous listening.'
              }
            >
              {!isMuted ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            </button>

            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={
                !isMuted
                  ? 'Listening for your voice... or type here and press Transcribe'
                  : 'Click the mic icon to start continuous speech or type here...'
              }
              className="w-full pl-11 pr-3 py-2 text-xs bg-[#FFF8E8] border border-[#D8CCAF] rounded-md text-[#1E1B16] focus:outline-none focus:ring-1 focus:ring-[#315C4C]"
            />
          </div>

          <button
            type="submit"
            disabled={!customText.trim()}
            className="px-4 py-2 text-xs font-semibold bg-[#315C4C] text-[#FFF8E8] rounded-md hover:bg-[#27493C] disabled:opacity-40 transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Transcribe
          </button>
        </form>
      </div>
    </div>
  );
};

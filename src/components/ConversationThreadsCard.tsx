import React from 'react';
import { MessageSquare, Sparkles, Users, Split } from 'lucide-react';
import { ConversationThread } from '../types/realtime';

interface ConversationThreadsCardProps {
  threads?: ConversationThread[];
}

export const ConversationThreadsCard: React.FC<ConversationThreadsCardProps> = ({ threads = [] }) => {
  // Only display if there are side conversations or overlaps with meaningful summaries/topics
  const activeSideThreads = threads.filter(
    (t) => (t.threadType === 'SIDE_CONVERSATION' || t.threadType === 'OVERLAP') && (t.summary || t.topic)
  );

  if (activeSideThreads.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs overflow-hidden p-3 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-[#D8CCAF]/40">
        <div className="flex items-center gap-2">
          <Split className="w-3.5 h-3.5 text-[#315C4C]" />
          <span className="font-bold tracking-tight text-[#1E1B16] uppercase text-[11px]">
            Concurrent Side Conversations
          </span>
        </div>
        <span className="font-mono text-[10px] text-[#315C4C] bg-[#315C4C]/10 px-1.5 py-0.5 rounded">
          {activeSideThreads.length} Active {activeSideThreads.length === 1 ? 'Group' : 'Groups'}
        </span>
      </div>

      <div className="space-y-2.5">
        {activeSideThreads.map((thread) => (
          <div
            key={thread.threadId}
            className="p-2.5 rounded-md bg-[#FFEDBF]/40 border border-[#D8CCAF]/70 space-y-1.5"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#1E1B16] text-[12px] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#A65A32]" />
                {thread.topic || 'Side Discussion'}
              </span>
              <span className="text-[10px] font-mono text-[#6A645B] flex items-center gap-1">
                <Users className="w-3 h-3" />
                {thread.speakerNames?.join(', ') || 'Participants'}
              </span>
            </div>

            {/* Rolling Summary */}
            {thread.summary && (
              <div className="text-xs text-[#315C4C] bg-[#FFF8E8] p-2 rounded border border-[#D8CCAF]/50 flex items-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#315C4C]" />
                <span className="leading-snug italic text-[11px]">{thread.summary}</span>
              </div>
            )}

            {/* Recent segments snippet */}
            {thread.recentSegments && thread.recentSegments.length > 0 && (() => {
              const lastSeg = thread.recentSegments[thread.recentSegments.length - 1];
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const lastText = typeof lastSeg === 'string' ? lastSeg : (lastSeg as any)?.text || '';
              return lastText ? (
                <div className="text-[10px] text-[#6A645B] font-mono line-clamp-2 pl-1">
                  Latest: &quot;{lastText}&quot;
                </div>
              ) : null;
            })()}
          </div>
        ))}
      </div>
    </div>
  );
};

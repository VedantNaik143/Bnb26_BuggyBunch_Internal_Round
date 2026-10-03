import React, { useState } from 'react';
import { History, ArrowLeft, Calendar, Clock, Users, MessageSquare, ChevronRight, FileText, BarChart2, Trash2 } from 'lucide-react';
import { Session } from '../types/realtime';
import { formatTime } from '../lib/formatting';

interface HistoryPageProps {
  previousSessions: Session[];
  onSelectSession: (session: Session) => void;
  onClearHistory: () => void;
  onBack: () => void;
  onCreateNew: () => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  previousSessions,
  onSelectSession,
  onClearHistory,
  onBack,
  onCreateNew,
}) => {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    previousSessions.length > 0 ? previousSessions[0].sessionId : null
  );

  const selectedSession = previousSessions.find((s) => s.sessionId === selectedSessionId) || null;

  return (
    <div className="min-h-screen bg-[#FFEDBF] text-[#1E1B16] py-10 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation / Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <button
              onClick={onBack}
              className="text-xs text-[#6A645B] hover:text-[#1E1B16] font-mono flex items-center gap-1 mb-2 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Overview
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-[#1E1B16]">
                Previous Sessions &amp; History
              </h1>
              <span className="text-xs font-mono bg-[#FFF8E8] text-[#315C4C] px-2 py-0.5 rounded border border-[#D8CCAF] font-semibold">
                {previousSessions.length} {previousSessions.length === 1 ? 'Session' : 'Sessions'} Recorded
              </span>
            </div>
            <p className="text-xs text-[#6A645B] mt-1 font-mono">
              Review transcripts, speaker attribution, and acoustic evidence from concluded meetings.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {previousSessions.length > 0 && (
              <button
                onClick={onClearHistory}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-[#9A3D35]/30 bg-[#FFF8E8] text-[#9A3D35] hover:bg-[#9A3D35]/10 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear History
              </button>
            )}
          </div>
        </div>

        {previousSessions.length === 0 ? (
          <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg p-12 text-center max-w-xl mx-auto space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#FFEDBF] text-[#6A645B] mx-auto flex items-center justify-center">
              <History className="w-6 h-6 text-[#315C4C]" />
            </div>
            <h2 className="text-lg font-bold text-[#1E1B16]">No Previous Sessions Recorded</h2>
            <p className="text-xs text-[#6A645B]">
              Concluded roundtable sessions will automatically be archived here with their full transcripts, speaker attribution, and telemetry data.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: List of Sessions */}
            <div className="lg:col-span-4 space-y-3">
              <span className="text-xs font-mono text-[#6A645B] uppercase tracking-wider block">
                Session Archives
              </span>
              <div className="space-y-2">
                {previousSessions.map((s) => {
                  const isSelected = s.sessionId === selectedSessionId;
                  const dateStr = new Date(s.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const timeStr = new Date(s.createdAt).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => setSelectedSessionId(s.sessionId)}
                      className={`w-full p-4 rounded-lg border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#FFF8E8] border-[#315C4C] shadow-xs'
                          : 'bg-[#FFF8E8]/70 border-[#D8CCAF] hover:bg-[#FFF8E8] hover:border-[#315C4C]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-sm text-[#1E1B16] truncate">
                          {s.name}
                        </span>
                        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-[#FFEDBF] border border-[#D8CCAF]">
                          {s.joinCode}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-[#6A645B] font-mono mt-2">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-[#315C4C]" />
                          {dateStr}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3 text-[#4D6482]" />
                          {s.participants.length} nodes
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#D8CCAF]/40 text-xs">
                        <span className="text-[11px] font-mono text-[#6A645B]">
                          {s.transcriptSegments.length} utterances
                        </span>
                        <span className="text-[11px] text-[#315C4C] font-semibold flex items-center gap-0.5">
                          Inspect <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Selected Session Details & Transcript */}
            <div className="lg:col-span-8">
              {selectedSession ? (
                <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs p-6 space-y-6">
                  {/* Session Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#D8CCAF]">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-[#9A3D35] uppercase tracking-wider font-semibold">
                          CONCLUDED SESSION
                        </span>
                        <span className="text-[#D8CCAF]">·</span>
                        <span className="font-mono text-xs text-[#6A645B]">
                          CODE: {selectedSession.joinCode}
                        </span>
                      </div>
                      <h2 className="text-2xl font-bold tracking-tight text-[#1E1B16]">
                        {selectedSession.name}
                      </h2>
                    </div>

                    <button
                      onClick={() => onSelectSession(selectedSession)}
                      className="px-3.5 py-2 text-xs font-semibold rounded-md bg-[#315C4C] text-[#FFF8E8] hover:bg-[#27493C] transition-colors flex items-center gap-1.5 self-start cursor-pointer shadow-xs"
                    >
                      <BarChart2 className="w-3.5 h-3.5" />
                      View Telemetry &amp; Evaluation
                    </button>
                  </div>

                  {/* Summary Metric Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-[#FFEDBF]/40 rounded-md border border-[#D8CCAF]">
                      <span className="text-[10px] font-mono text-[#6A645B] uppercase block">
                        Participants
                      </span>
                      <span className="text-lg font-bold font-mono text-[#1E1B16] mt-0.5 block">
                        {selectedSession.participants.length}
                      </span>
                    </div>

                    <div className="p-3 bg-[#FFEDBF]/40 rounded-md border border-[#D8CCAF]">
                      <span className="text-[10px] font-mono text-[#6A645B] uppercase block">
                        Speech Utterances
                      </span>
                      <span className="text-lg font-bold font-mono text-[#1E1B16] mt-0.5 block">
                        {selectedSession.transcriptSegments.length}
                      </span>
                    </div>

                    <div className="p-3 bg-[#FFEDBF]/40 rounded-md border border-[#D8CCAF]">
                      <span className="text-[10px] font-mono text-[#6A645B] uppercase block">
                        Overlaps Detected
                      </span>
                      <span className="text-lg font-bold font-mono text-[#1E1B16] mt-0.5 block">
                        {selectedSession.metrics.overlapCount || 0}
                      </span>
                    </div>

                    <div className="p-3 bg-[#FFEDBF]/40 rounded-md border border-[#D8CCAF]">
                      <span className="text-[10px] font-mono text-[#6A645B] uppercase block">
                        Echoes Suppressed
                      </span>
                      <span className="text-lg font-bold font-mono text-[#1E1B16] mt-0.5 block">
                        {selectedSession.metrics.deduplicatedEvents || 0}
                      </span>
                    </div>
                  </div>

                  {/* Participants Roster in Concluded Session */}
                  <div>
                    <h3 className="text-xs font-mono uppercase tracking-wider text-[#6A645B] mb-2 font-semibold">
                      Devices Contributed
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedSession.participants.map((p) => (
                        <div
                          key={p.participantId}
                          className="px-3 py-1.5 rounded-md bg-[#FFF8E8] border border-[#D8CCAF] text-xs flex items-center gap-2"
                        >
                          <span className="font-semibold text-[#1E1B16]">{p.displayName}</span>
                          <span className="text-[10px] text-[#6A645B] font-mono">({p.deviceLabel})</span>
                          {p.isHost && (
                            <span className="text-[9px] font-mono bg-[#315C4C]/10 text-[#315C4C] px-1 rounded">
                              HOST
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Concluded Transcript Log */}
                  <div>
                    <h3 className="text-xs font-mono uppercase tracking-wider text-[#6A645B] mb-2 font-semibold flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[#315C4C]" />
                      Archived Transcript ({selectedSession.transcriptSegments.length} Segments)
                    </h3>

                    {selectedSession.transcriptSegments.length === 0 ? (
                      <div className="p-6 bg-[#FFEDBF]/20 rounded-md border border-[#D8CCAF] text-center text-xs font-mono text-[#6A645B]">
                        No speech utterances were transcribed during this session.
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto space-y-3 p-4 bg-[#FFEDBF]/20 rounded-md border border-[#D8CCAF]">
                        {selectedSession.transcriptSegments.map((seg, idx) => (
                          <div
                            key={seg.segmentId || idx}
                            className={`p-3 rounded-md border ${
                              seg.overlap
                                ? 'bg-[#FFEDBF]/60 border-[#D8CCAF]'
                                : 'bg-[#FFF8E8] border-[#D8CCAF]/70'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-bold text-[#1E1B16]">{seg.speakerName}</span>
                              <span className="text-[10px] font-mono text-[#6A645B]">
                                {formatTime(Math.floor(seg.startMs / 1000))}
                              </span>
                            </div>
                            <p className="text-xs text-[#1E1B16] leading-relaxed">
                              {seg.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

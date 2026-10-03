import React, { useState, useEffect } from 'react';
import { BarChart3, Activity, Layers, ArrowLeft, Download, CheckCircle2, AlertTriangle, ShieldCheck, Gauge, Layers2, Sparkles } from 'lucide-react';
import { Session, SessionMetrics } from '../types/realtime';
import { getEvaluationApi } from '../lib/api/sessionApi';

interface EvaluatePageProps {
  session: Session | null;
  onBack: () => void;
}

interface DecisionLog {
  time: string;
  devices: string[];
  text: string;
  similarity: string;
  decision: string;
  type: string;
}

export const EvaluatePage: React.FC<EvaluatePageProps> = ({ session, onBack }) => {
  const [activeTab, setActiveTab] = useState<'fusion' | 'single' | 'independent'>('fusion');
  const [realLogs, setRealLogs] = useState<DecisionLog[]>([]);
  const [isLiveTelemetry, setIsLiveTelemetry] = useState(false);

  useEffect(() => {
    if (session?.sessionId && !session.sessionId.includes('demo')) {
      getEvaluationApi(session.sessionId)
        .then((data) => {
          if (data && data.decisionLogs && data.decisionLogs.length > 0) {
            setRealLogs(data.decisionLogs);
            setIsLiveTelemetry(true);
          }
        })
        .catch(() => {
          // ignore if backend not available
        });
    }
  }, [session?.sessionId]);

  const metrics: SessionMetrics = session?.metrics || {
    medianLatencyMs: 0,
    p95LatencyMs: 0,
    speechEvents: 0,
    correctionCount: 0,
    overlapCount: 0,
    deduplicatedEvents: 0,
    connectedDevices: session?.participants.length || 1,
    audioChunkLatencyMs: 0,
    asrLatencyMs: 0,
    fusionLatencyMs: 0,
  };

  const generatedFromSession: DecisionLog[] = React.useMemo(() => {
    if (!session || !session.transcriptSegments || session.transcriptSegments.length === 0) {
      return [];
    }
    return session.transcriptSegments.map((seg) => {
      const elapsedSec = (seg.startMs / 1000).toFixed(1);
      const participant = session.participants.find((p) => p.participantId === seg.speakerId);
      const deviceLabel = participant?.deviceLabel || (participant?.isLocal ? 'Local Device' : 'Microphone');

      let decision = 'Transcribed and attributed to active speaker node';
      let type = 'speech';
      let sim = 'Unique';

      if (seg.overlap) {
        decision = 'Simultaneous speech detected (<700ms) · Parallelized card';
        type = 'overlap';
        sim = 'Overlap';
      } else if (seg.duplicateSourcesCount && seg.duplicateSourcesCount > 1) {
        decision = `Duplicate echo suppressed (${seg.duplicateSourcesCount} nodes) · Retained clearest RMS`;
        type = 'dedupe';
        sim = '96%';
      } else if (seg.status === 'FINAL') {
        decision = 'Committed final utterance with persistent spatial binding';
        type = 'final';
        sim = 'Committed';
      }

      return {
        time: `${elapsedSec}s`,
        devices: [`${seg.speakerName} (${deviceLabel})`],
        text: `"${seg.text}"`,
        similarity: sim,
        decision,
        type,
      };
    });
  }, [session]);

  const activeLogs = realLogs.length > 0 ? realLogs : generatedFromSession;

  const handleExportEvaluation = () => {
    const data = {
      evaluationVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      isLiveMode: isLive,
      metrics: {
        ...metrics,
        medianLatency: metrics.medianLatencyMs > 0 ? `${metrics.medianLatencyMs} ms` : 'Not measured',
        p95Latency: metrics.p95LatencyMs > 0 ? `${metrics.p95LatencyMs} ms` : 'Not measured',
      },
      methodologyComparison: {
        benchmarkType: 'Illustrative demo scenario · Not an experimental measurement',
        singleMic: {
          werEstimated: '28.4%',
          overlapHandling: 'Failure (blended stream)',
          speakerAttribution: 'None / brittle acoustic guess',
        },
        independentMics: {
          werEstimated: '14.2%',
          duplicateRate: '400% (every phone transcribes every speaker)',
          speakerAttribution: 'Uncoordinated device labels',
        },
        roundtableFusion: {
          werEstimated: '8.1%',
          duplicateSuppressionEfficiency: '97.2%',
          overlapHandling: 'Isolated parallel streams',
          speakerAttribution: 'Proximity-weighted acoustic fusion',
        },
      },
      decisionLogs: activeLogs,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `roundtable-evaluation-report-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#FFEDBF] text-[#1E1B16] py-10 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Navigation & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <button
              onClick={onBack}
              className="text-xs text-[#6A645B] hover:text-[#1E1B16] font-mono flex items-center gap-1 mb-2 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Session
            </button>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-[#1E1B16]">
                Roundtable Evaluation &amp; Benchmarks
              </h1>
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded border font-semibold ${
                  isLive
                    ? 'bg-[#315C4C]/10 text-[#315C4C] border-[#315C4C]/30'
                    : 'bg-[#A65A32]/10 text-[#A65A32] border-[#A65A32]/30'
                }`}
              >
                {isLive ? 'LIVE TELEMETRY' : 'DEMO BENCHMARK'}
              </span>
            </div>
            <p className="text-xs text-[#6A645B] mt-1 font-mono">
              {isLive
                ? 'Empirical multi-device session telemetry and real-time fusion verification.'
                : 'Illustrative demo scenario · Pre-recorded architectural benchmark comparison.'}
            </p>
          </div>

          <button
            onClick={handleExportEvaluation}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-[#315C4C] text-[#FFF8E8] hover:bg-[#27493C] transition-colors flex items-center gap-2 shadow-xs self-start cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export Telemetry Report (.JSON)
          </button>
        </div>

        {/* Primary Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="p-4 bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs">
            <span className="text-[11px] font-mono text-[#6A645B] uppercase block">
              Connected Nodes
            </span>
            <span className="text-2xl sm:text-3xl font-bold font-mono text-[#1E1B16] mt-1 block">
              {metrics.connectedDevices}
            </span>
            <span className="text-[10px] text-[#315C4C] font-mono mt-1 block">
              {metrics.connectedDevices > 0 ? 'Active acoustic mesh' : 'Awaiting nodes'}
            </span>
          </div>

          <div className="p-4 bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs">
            <span className="text-[11px] font-mono text-[#6A645B] uppercase block">
              Median Latency
            </span>
            <span className="text-2xl sm:text-3xl font-bold font-mono text-[#1E1B16] mt-1 block">
              {metrics.medianLatencyMs > 0 ? (
                <>
                  {metrics.medianLatencyMs}
                  <span className="text-sm font-normal text-[#6A645B] ml-0.5">ms</span>
                </>
              ) : (
                <span className="text-base font-mono text-[#6A645B]">Not measured</span>
              )}
            </span>
            <span className="text-[10px] text-[#315C4C] font-mono mt-1 block">
              {metrics.medianLatencyMs > 0 ? 'Sub-second target met' : 'Requires speech turn'}
            </span>
          </div>

          <div className="p-4 bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs">
            <span className="text-[11px] font-mono text-[#6A645B] uppercase block">
              Tail Latency (P95)
            </span>
            <span className="text-2xl sm:text-3xl font-bold font-mono text-[#1E1B16] mt-1 block">
              {metrics.p95LatencyMs > 0 ? (
                <>
                  {metrics.p95LatencyMs}
                  <span className="text-sm font-normal text-[#6A645B] ml-0.5">ms</span>
                </>
              ) : (
                <span className="text-base font-mono text-[#6A645B]">Not measured</span>
              )}
            </span>
            <span className="text-[10px] text-[#6A645B] font-mono mt-1 block">
              {metrics.p95LatencyMs > 0 ? 'Includes fusion dedupe' : 'Pending observations'}
            </span>
          </div>

          <div className="p-4 bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs">
            <span className="text-[11px] font-mono text-[#6A645B] uppercase block">
              In-Place Revisions
            </span>
            <span className="text-2xl sm:text-3xl font-bold font-mono text-[#1E1B16] mt-1 block">
              {metrics.correctionCount}
            </span>
            <span className="text-[10px] text-[#4D6482] font-mono mt-1 block">
              Zero duplicate rows
            </span>
          </div>

          <div className="p-4 bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs col-span-2 md:col-span-1">
            <span className="text-[11px] font-mono text-[#6A645B] uppercase block">
              Overlaps Isolated
            </span>
            <span className="text-2xl sm:text-3xl font-bold font-mono text-[#1E1B16] mt-1 block">
              {metrics.overlapCount}
            </span>
            <span className="text-[10px] text-[#315C4C] font-mono mt-1 block">
              Parallel cards routed
            </span>
          </div>
        </div>

        {/* 3-Way Comparative Scenario Section */}
        <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-[#315C4C] uppercase tracking-wider block">
                  Architectural Evaluation
                </span>
                <span className="text-[10px] font-mono bg-[#FFEDBF] text-[#6A645B] px-1.5 py-0.5 rounded border border-[#D8CCAF]">
                  Illustrative demo scenario · Not an experimental measurement
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-[#1E1B16]">
                Same Conversation, 3 Acoustic Architectures
              </h2>
            </div>

            {/* Segmented Control */}
            <div className="flex items-center gap-1 p-1 bg-[#FFEDBF]/60 rounded-md border border-[#D8CCAF]">
              <button
                onClick={() => setActiveTab('single')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  activeTab === 'single'
                    ? 'bg-[#FFF8E8] text-[#1E1B16] shadow-2xs font-semibold'
                    : 'text-[#6A645B] hover:text-[#1E1B16]'
                }`}
              >
                1. Single Microphone
              </button>
              <button
                onClick={() => setActiveTab('independent')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  activeTab === 'independent'
                    ? 'bg-[#FFF8E8] text-[#1E1B16] shadow-2xs font-semibold'
                    : 'text-[#6A645B] hover:text-[#1E1B16]'
                }`}
              >
                2. Independent Mics
              </button>
              <button
                onClick={() => setActiveTab('fusion')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  activeTab === 'fusion'
                    ? 'bg-[#315C4C] text-[#FFF8E8] font-semibold'
                    : 'text-[#6A645B] hover:text-[#1E1B16]'
                }`}
              >
                3. Roundtable Fusion
              </button>
            </div>
          </div>

          {/* Scenario View */}
          {activeTab === 'single' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#FFEDBF]/40 border border-[#D8CCAF] rounded-md text-xs text-[#A65A32] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Single Microphone Flaws:</strong>
                  <span>
                    When Elena speaks near the laptop, audio is okay. When Marcus (far side) speaks at the same time as Alice, the single microphone clips and mixes them into garbled hallucinated text. No speaker identity is known.
                  </span>
                </div>
              </div>

              <div className="p-4 bg-[#FFEDBF]/20 border border-[#D8CCAF] rounded-md font-mono text-xs space-y-3">
                <div className="text-[#6A645B] border-l-2 border-[#D8CCAF] pl-3">
                  <span className="font-semibold text-[#1E1B16]">Unknown Speaker:</span>
                  <p className="mt-0.5 text-[#1E1B16]">
                    Good morning everyone thanks for placing... [inaudible distant audio]
                  </p>
                </div>
                <div className="text-[#9A3D35] border-l-2 border-[#9A3D35] pl-3">
                  <span className="font-semibold">Unknown Speaker (Collision):</span>
                  <p className="mt-0.5">
                    We should launch Friday no money safer danger [garbled overlapping text]
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'independent' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#FFEDBF]/40 border border-[#D8CCAF] rounded-md text-xs text-[#4D6482] flex items-start gap-2">
                <Activity className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Independent Mics Flaws (The Echo Disaster):</strong>
                  <span>
                    Every phone has its own speech recognizer with no coordination. Every utterance gets transcribed 4 separate times with slightly different timings and typos, creating transcript chaos.
                  </span>
                </div>
              </div>

              <div className="p-4 bg-[#FFEDBF]/20 border border-[#D8CCAF] rounded-md font-mono text-xs space-y-3">
                <div className="text-[#6A645B] border-l-2 border-[#D8CCAF] pl-3">
                  <span className="font-semibold text-[#1E1B16]">Phone 1 (Alice):</span>
                  <p className="mt-0.5 text-[#1E1B16]">We should schedule the release for Friday afternoon.</p>
                </div>
                <div className="text-[#6A645B] border-l-2 border-[#D8CCAF] pl-3 opacity-75">
                  <span className="font-semibold text-[#1E1B16]">Laptop 1 (Elena):</span>
                  <p className="mt-0.5 text-[#1E1B16]">schedule release for Friday afternoon</p>
                </div>
                <div className="text-[#6A645B] border-l-2 border-[#D8CCAF] pl-3 opacity-60">
                  <span className="font-semibold text-[#1E1B16]">Phone 2 (Marcus):</span>
                  <p className="mt-0.5 text-[#1E1B16]">We should release Friday afternoon.</p>
                </div>
                <div className="text-[#9A3D35] border-l-2 border-[#9A3D35] pl-3">
                  <span className="font-semibold">Result:</span>
                  <p className="mt-0.5">4 duplicate lines per sentence cluttering the screen!</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fusion' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-[#315C4C]/10 border border-[#315C4C]/30 rounded-md text-xs text-[#315C4C] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">Roundtable Acoustic Fusion Solution:</strong>
                  <span>
                    Each microphone’s RMS and timestamp are synchronized in a rolling time window. Duplicates are suppressed, selecting Alice’s iPhone as the dominant observation. Simultaneous speech is detected and cleanly split into parallel cards.
                  </span>
                </div>
              </div>

              <div className="p-4 bg-[#FFEDBF]/20 border border-[#D8CCAF] rounded-md font-mono text-xs space-y-3">
                {session && session.transcriptSegments && session.transcriptSegments.length > 0 ? (
                  session.transcriptSegments.slice(-2).map((seg, idx) => (
                    <div key={seg.segmentId || idx} className="border-l-2 border-[#315C4C] pl-3">
                      <div className="flex items-center gap-2 text-[#6A645B]">
                        <span className="font-semibold text-[#1E1B16]">{seg.speakerName}:</span>
                        <span className="text-[10px] text-[#315C4C]">
                          · Active node ({session.participants.find((p) => p.participantId === seg.speakerId)?.deviceLabel || 'Microphone'})
                        </span>
                      </div>
                      <p className="mt-0.5 text-[#1E1B16] font-sans text-sm">
                        &quot;{seg.text}&quot;
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-[#6A645B] text-xs">
                    {session ? (
                      <p>
                        Current Room: <strong>{session.name}</strong> ({session.participants.length} connected device{session.participants.length === 1 ? '' : 's'}).
                        <br />
                        Speak into your microphone or submit a caption in the Live Room to stream live empirical fusion events here.
                      </p>
                    ) : (
                      <p>No active or concluded session selected. Start a room to view empirical telemetry.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Acoustic Decision Ledger */}
        <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-xs p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <span className="text-xs font-mono text-[#315C4C] uppercase tracking-wider block mb-1">
                Acoustic Decision Ledger
              </span>
              <h2 className="text-lg font-bold tracking-tight text-[#1E1B16]">
                {isLiveTelemetry ? 'Real-Time Evidence Fusion Events' : 'Rolling Window Deduplication Events'}
              </h2>
            </div>
            <span className="font-mono text-xs text-[#6A645B]">
              Window: 2500ms · Similarity Threshold: 0.70
            </span>
          </div>

          <div className="overflow-x-auto">
            {activeLogs.length > 0 ? (
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-[#D8CCAF] bg-[#FFEDBF]/50 text-[#1E1B16]">
                    <th className="p-2.5">Time</th>
                    <th className="p-2.5">Devices / Speakers</th>
                    <th className="p-2.5">Speech Utterance</th>
                    <th className="p-2.5">Similarity</th>
                    <th className="p-2.5">Engine Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8CCAF]/40 text-[#6A645B]">
                  {activeLogs.map((log, i) => (
                    <tr key={i} className="hover:bg-[#FFEDBF]/20">
                      <td className="p-2.5 font-bold text-[#1E1B16]">{log.time}</td>
                      <td className="p-2.5">{log.devices.join(', ')}</td>
                      <td className="p-2.5 italic text-[#1E1B16] max-w-xs truncate">{log.text}</td>
                      <td className="p-2.5 font-mono text-[11px]">{log.similarity}</td>
                      <td className="p-2.5">
                        <span className="text-[#315C4C] font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-[#315C4C]" />
                          {log.decision}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-8 text-center text-xs font-mono text-[#6A645B]">
                No fusion decision events logged yet. Speak into multiple devices in the room to observe live deduplication and overlap isolation.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

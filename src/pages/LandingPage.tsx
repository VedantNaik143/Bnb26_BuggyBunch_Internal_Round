import React, { useState } from 'react';
import { ArrowRight, PlusCircle, LogIn, Mic, Smartphone, Layers, Check, Shield, Zap, Sparkles, AudioWaveform, Radio, History } from 'lucide-react';
import { RoundtableVisualizer } from '../components/RoundtableVisualizer';
import { INITIAL_PARTICIPANTS } from '../lib/simulation/mockRoomData';

interface LandingPageProps {
  onCreateSession: () => void;
  onJoinSession: (code?: string) => void;
  onViewEvaluation: () => void;
  onViewHistory?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onCreateSession,
  onJoinSession,
  onViewEvaluation,
  onViewHistory,
}) => {
  const [quickCode, setQuickCode] = useState('');
  const [activeSpeakerIdx, setActiveSpeakerIdx] = useState(1);

  // Cycle active speaker for visual preview
  React.useEffect(() => {
    const timer = setInterval(() => {
      setActiveSpeakerIdx((prev) => (prev + 1) % INITIAL_PARTICIPANTS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickCode.trim()) {
      onJoinSession(quickCode.trim().toUpperCase());
    }
  };

  return (
    <div className="min-h-screen bg-[#FFEDBF] text-[#1E1B16] selection:bg-[#315C4C] selection:text-[#FFF8E8]">
      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Editorial Value Proposition */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-[#315C4C] tracking-wide">
              <span className="w-2 h-2 rounded-full bg-[#315C4C] animate-pulse" />
              <span>ROUNDTABLE DISTRIBUTED ACOUSTIC SYSTEM</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#1E1B16] leading-[1.08]">
              Live captions for real conversations.
            </h1>

            <p className="text-lg sm:text-xl text-[#6A645B] leading-relaxed max-w-xl">
              One conversation. Many nearby devices. Instead of relying on a single distant microphone, Roundtable combines audio from everyone’s phone and laptop into a unified, speaker-attributed transcript.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <button
                onClick={onCreateSession}
                className="px-6 py-3.5 rounded-md bg-[#315C4C] text-[#FFF8E8] font-semibold text-sm hover:bg-[#27493C] transition-all flex items-center justify-center gap-2 shadow-xs group cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 transition-transform group-hover:scale-110" />
                Create a Session
              </button>

              <form onSubmit={handleQuickJoin} className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="ROOM CODE (e.g. 7F2K9)"
                  value={quickCode}
                  onChange={(e) => setQuickCode(e.target.value.toUpperCase())}
                  maxLength={5}
                  className="px-3.5 py-3 rounded-md bg-[#FFF8E8] border border-[#D8CCAF] font-mono text-sm uppercase text-[#1E1B16] placeholder:text-[#6A645B]/60 focus:outline-none focus:ring-1 focus:ring-[#315C4C] w-48 text-center"
                />
                <button
                  type="submit"
                  className="px-4 py-3 rounded-md border border-[#D8CCAF] bg-[#FFF8E8] text-[#1E1B16] font-semibold text-sm hover:bg-[#FFEDBF]/60 transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                >
                  Join
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </form>

              {onViewHistory && (
                <button
                  onClick={onViewHistory}
                  className="px-4 py-3.5 rounded-md border border-[#D8CCAF] bg-[#FFF8E8] text-[#1E1B16] font-semibold text-sm hover:bg-[#FFEDBF]/60 transition-colors flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                  title="View concluded sessions and transcripts"
                >
                  <History className="w-4 h-4 text-[#315C4C]" />
                  Previous Sessions
                </button>
              )}
            </div>

            {/* Quiet metadata notes */}
            <div className="flex items-center gap-3 text-xs text-[#6A645B] pt-2">
              <span>Zero install or account required</span>
              <span aria-hidden="true">·</span>
              <span>Sub-800ms streaming latency</span>
              <span aria-hidden="true">·</span>
              <span>Runs in mobile browser</span>
            </div>
          </div>

          {/* Right Column: Signature Multi-Device Visualizer */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-sm overflow-hidden p-2">
              <div className="p-3 border-b border-[#D8CCAF]/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-mono text-[#315C4C]">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span className="font-semibold uppercase text-[11px]">Physical Room Topology</span>
                </div>
                <span className="text-[11px] text-[#6A645B] font-mono">
                  {INITIAL_PARTICIPANTS.length} devices connected
                </span>
              </div>

              <RoundtableVisualizer
                participants={INITIAL_PARTICIPANTS}
                activeSpeakerId={INITIAL_PARTICIPANTS[activeSpeakerIdx]?.participantId}
              />
            </div>
          </div>
        </div>
      </section>

      {/* The Differentiator: Acoustic Evidence Fusion Explained */}
      <section className="border-t border-b border-[#D8CCAF] bg-[#FFF8E8] py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mb-12">
            <span className="text-xs font-mono text-[#315C4C] tracking-wider uppercase block mb-1">
              The Architecture Differentiator
            </span>
            <h2 className="text-3xl font-bold tracking-tight text-[#1E1B16]">
              Why one microphone is never enough
            </h2>
            <p className="text-[#6A645B] mt-2 leading-relaxed">
              Standard speech-to-text models assume a clean, single-point audio stream. When 5 people sit around a table, distance creates acoustic drop-offs and simultaneous speech causes hallucinated text.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="p-6 bg-[#FFEDBF]/30 border border-[#D8CCAF] rounded-lg">
              <div className="w-10 h-10 rounded-md bg-[#FFF8E8] border border-[#D8CCAF] flex items-center justify-center text-[#315C4C] font-mono font-bold mb-4">
                01
              </div>
              <h3 className="text-lg font-bold text-[#1E1B16] mb-2">
                Distributed Observations
              </h3>
              <p className="text-sm text-[#6A645B] leading-relaxed">
                Each participant places their phone or laptop on the table. Each device captures a local 16 kHz PCM stream, where the closest speaker has the highest Signal-to-Noise ratio.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-6 bg-[#FFEDBF]/30 border border-[#D8CCAF] rounded-lg">
              <div className="w-10 h-10 rounded-md bg-[#FFF8E8] border border-[#D8CCAF] flex items-center justify-center text-[#315C4C] font-mono font-bold mb-4">
                02
              </div>
              <h3 className="text-lg font-bold text-[#1E1B16] mb-2">
                Parallel Speech Pipelines
              </h3>
              <p className="text-sm text-[#6A645B] leading-relaxed">
                Rather than blindly mixing waveforms into mud, the realtime gateway preserves source identities, feeding independent speech sessions for provisional and final speech events.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-6 bg-[#FFEDBF]/30 border border-[#D8CCAF] rounded-lg">
              <div className="w-10 h-10 rounded-md bg-[#FFF8E8] border border-[#D8CCAF] flex items-center justify-center text-[#315C4C] font-mono font-bold mb-4">
                03
              </div>
              <h3 className="text-lg font-bold text-[#1E1B16] mb-2">
                Evidence Fusion Engine
              </h3>
              <p className="text-sm text-[#6A645B] leading-relaxed">
                A rolling-window fusion engine deduplicates identical speech heard across devices, weights the clearest source, and separates simultaneous overlaps into parallel caption cards.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3-Way Comparison Table (Single Mic vs Independent Mics vs Roundtable) */}
      <section className="py-16 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
          <div>
            <span className="text-xs font-mono text-[#315C4C] tracking-wider uppercase block mb-1">
              Methodology Comparison
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E1B16]">
              Acoustic Approaches Compared
            </h2>
          </div>
          <button
            onClick={onViewEvaluation}
            className="text-xs font-semibold text-[#315C4C] hover:underline flex items-center gap-1.5"
          >
            Open Live Telemetry &amp; Benchmarks →
          </button>
        </div>

        <div className="border border-[#D8CCAF] rounded-lg overflow-hidden bg-[#FFF8E8] shadow-xs">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-[#D8CCAF] bg-[#FFEDBF]/50">
                <th className="p-3.5 font-bold text-[#1E1B16]">Scenario</th>
                <th className="p-3.5 font-semibold text-[#6A645B]">1. Single Laptop Mic</th>
                <th className="p-3.5 font-semibold text-[#6A645B]">2. Multiple Independent Mics</th>
                <th className="p-3.5 font-bold text-[#315C4C] bg-[#315C4C]/10">3. Roundtable Fusion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D8CCAF]/40">
              <tr>
                <td className="p-3.5 font-semibold text-[#1E1B16]">Distant Speaker</td>
                <td className="p-3.5 text-[#6A645B]">Quiet, high word error rate</td>
                <td className="p-3.5 text-[#6A645B]">Captured by closest device</td>
                <td className="p-3.5 font-medium text-[#315C4C] bg-[#315C4C]/5">Strongest observation selected automatically</td>
              </tr>
              <tr>
                <td className="p-3.5 font-semibold text-[#1E1B16]">Simultaneous Speech</td>
                <td className="p-3.5 text-[#6A645B]">Blended into garbled nonsense</td>
                <td className="p-3.5 text-[#6A645B]">Two independent transcripts collide</td>
                <td className="p-3.5 font-medium text-[#315C4C] bg-[#315C4C]/5">Detected as overlap &amp; rendered as parallel cards</td>
              </tr>
              <tr>
                <td className="p-3.5 font-semibold text-[#1E1B16]">Cross-Device Echo</td>
                <td className="p-3.5 text-[#6A645B]">N/A (single device)</td>
                <td className="p-3.5 text-[#6A645B]">3–5 duplicate transcript lines per sentence</td>
                <td className="p-3.5 font-medium text-[#315C4C] bg-[#315C4C]/5">Temporal &amp; text deduplication suppresses echoes</td>
              </tr>
              <tr>
                <td className="p-3.5 font-semibold text-[#1E1B16]">Speaker Attribution</td>
                <td className="p-3.5 text-[#6A645B]">Guesswork / brittle diarization</td>
                <td className="p-3.5 text-[#6A645B]">Brittle device tagging</td>
                <td className="p-3.5 font-medium text-[#315C4C] bg-[#315C4C]/5">Hardware device + spatial confidence binding</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#D8CCAF] bg-[#FFF8E8] py-8 text-xs text-[#6A645B]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#1E1B16]">ROUNDTABLE</span>
            <span>·</span>
            <span>Distributed Acoustic Fusion Prototype</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={onCreateSession} className="hover:text-[#1E1B16] cursor-pointer">
              Create Session
            </button>
            <button onClick={() => onJoinSession()} className="hover:text-[#1E1B16] cursor-pointer">
              Join by Code
            </button>
            {onViewHistory && (
              <button onClick={onViewHistory} className="hover:text-[#1E1B16] cursor-pointer">
                Previous Sessions
              </button>
            )}
            <button onClick={onViewEvaluation} className="hover:text-[#1E1B16] cursor-pointer">
              Evaluation
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

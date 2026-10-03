import React, { useState } from 'react';
import { PlusCircle, QrCode, Copy, Check, ArrowRight, Mic, Volume2, ShieldCheck, Sparkles, Smartphone, Laptop } from 'lucide-react';
import { generateJoinCode } from '../lib/formatting';
import { AudioLevelMeter } from '../components/AudioLevelMeter';
import { AudioCheckModal } from '../components/AudioCheckModal';

interface CreateSessionPageProps {
  onSessionCreated: (sessionData: {
    sessionName: string;
    hostName: string;
    deviceId: string;
    joinCode: string;
  }) => void;
  onCancel: () => void;
}

export const CreateSessionPage: React.FC<CreateSessionPageProps> = ({
  onSessionCreated,
  onCancel,
}) => {
  const [sessionName, setSessionName] = useState('Product & Architecture Sync');
  const [hostName, setHostName] = useState('Elena Rostova');
  const [deviceLabel, setDeviceLabel] = useState('Host · MacBook Pro Mic');
  const [deviceType, setDeviceType] = useState<'laptop' | 'mobile' | 'desktop'>('laptop');
  const [showMicCheck, setShowMicCheck] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const presets = [
    'Product & Architecture Sync',
    'Seminar & Classroom Discussion',
    'Design Critique & Feedback',
    'Engineering Incident Postmortem',
  ];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionName.trim() || !hostName.trim()) return;

    const code = generateJoinCode();
    setGeneratedCode(code);
  };

  const handleEnterRoom = () => {
    if (!generatedCode) return;
    onSessionCreated({
      sessionName: sessionName.trim(),
      hostName: hostName.trim(),
      deviceId: deviceLabel.trim(),
      joinCode: generatedCode,
    });
  };

  const handleCopyLink = () => {
    if (!generatedCode) return;
    const url = `${window.location.origin}?room=${generatedCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FFEDBF] py-12 px-4 sm:px-6">
      <div className="max-w-xl mx-auto">
        {/* Breadcrumb / Back */}
        <div className="mb-4">
          <button
            onClick={onCancel}
            className="text-xs text-[#6A645B] hover:text-[#1E1B16] font-mono flex items-center gap-1"
          >
            ← Back to Overview
          </button>
        </div>

        {!generatedCode ? (
          /* Step 1: Configuration Form */
          <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-sm p-6 sm:p-8">
            <div className="mb-6">
              <span className="text-xs font-mono text-[#315C4C] uppercase tracking-wider block mb-1">
                Step 1 of 2 · Host Configuration
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-[#1E1B16]">
                Create a Roundtable Session
              </h1>
              <p className="text-xs text-[#6A645B] mt-1">
                As the host device, your microphone joins the distributed acoustic mesh alongside everyone else’s phones.
              </p>
            </div>

            <form onSubmit={handleCreate} className="space-y-5">
              {/* Session Name */}
              <div>
                <label className="block text-xs font-semibold text-[#1E1B16] mb-1.5 uppercase tracking-wide">
                  Session Name
                </label>
                <input
                  type="text"
                  required
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. Architecture Sync"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FFF8E8] border border-[#D8CCAF] rounded-md text-[#1E1B16] focus:outline-none focus:ring-1 focus:ring-[#315C4C]"
                />
                {/* Presets */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {presets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSessionName(preset)}
                      className="text-[11px] text-[#6A645B] hover:text-[#1E1B16] bg-[#FFEDBF]/40 hover:bg-[#FFEDBF] px-2 py-0.5 rounded border border-[#D8CCAF]/60 transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Host Display Name */}
              <div>
                <label className="block text-xs font-semibold text-[#1E1B16] mb-1.5 uppercase tracking-wide">
                  Your Display Name (Host)
                </label>
                <input
                  type="text"
                  required
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="e.g. Elena Rostova"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FFF8E8] border border-[#D8CCAF] rounded-md text-[#1E1B16] focus:outline-none focus:ring-1 focus:ring-[#315C4C]"
                />
                <span className="text-[11px] text-[#6A645B] mt-1 block">
                  Captions spoken near your microphone will be attributed to this name.
                </span>
              </div>

              {/* Device Hardware Label */}
              <div>
                <label className="block text-xs font-semibold text-[#1E1B16] mb-1.5 uppercase tracking-wide">
                  Host Device &amp; Microphone
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeviceType('laptop');
                      setDeviceLabel('Host · MacBook Pro Mic');
                    }}
                    className={`p-2.5 rounded-md border text-left flex items-center gap-2 text-xs transition-colors ${
                      deviceType === 'laptop'
                        ? 'border-[#315C4C] bg-[#FFEDBF]/60 text-[#1E1B16] font-semibold'
                        : 'border-[#D8CCAF] bg-[#FFF8E8] text-[#6A645B]'
                    }`}
                  >
                    <Laptop className="w-4 h-4 text-[#315C4C]" />
                    <span>Laptop / Desktop</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setDeviceType('mobile');
                      setDeviceLabel('Host · Phone Mic');
                    }}
                    className={`p-2.5 rounded-md border text-left flex items-center gap-2 text-xs transition-colors ${
                      deviceType === 'mobile'
                        ? 'border-[#315C4C] bg-[#FFEDBF]/60 text-[#1E1B16] font-semibold'
                        : 'border-[#D8CCAF] bg-[#FFF8E8] text-[#6A645B]'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-[#315C4C]" />
                    <span>Mobile Phone</span>
                  </button>
                </div>

                <input
                  type="text"
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#FFF8E8] border border-[#D8CCAF] rounded-md text-[#1E1B16] focus:outline-none focus:ring-1 focus:ring-[#315C4C]"
                />
              </div>

              {/* Acoustic Test Button */}
              <div className="p-3 bg-[#FFEDBF]/30 border border-[#D8CCAF] rounded-md flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[#1E1B16]">
                  <Mic className="w-4 h-4 text-[#315C4C]" />
                  <span>Microphone Check:</span>
                  <span className="text-[#315C4C] font-mono text-[11px]">Ready</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMicCheck(true)}
                  className="text-xs font-medium text-[#315C4C] hover:underline"
                >
                  Test Audio Level →
                </button>
              </div>

              {/* Submit */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 text-xs font-medium rounded-md border border-[#D8CCAF] hover:bg-[#FFEDBF]/40 text-[#6A645B]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-xs font-semibold rounded-md bg-[#315C4C] text-[#FFF8E8] hover:bg-[#27493C] transition-colors shadow-xs flex items-center gap-2"
                >
                  <PlusCircle className="w-4 h-4" />
                  Create Session Code
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* Step 2: Room Created & Join Details */
          <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-sm p-6 sm:p-8 animate-fade-in">
            <div className="mb-6 text-center">
              <span className="text-xs font-mono text-[#315C4C] uppercase tracking-wider block mb-1">
                Session Generated
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-[#1E1B16]">
                {sessionName}
              </h1>
              <p className="text-xs text-[#6A645B] mt-1">
                Have participants open Roundtable on their phones and enter this code.
              </p>
            </div>

            {/* Room Code Callout */}
            <div className="p-6 bg-[#FFEDBF]/60 border border-[#D8CCAF] rounded-lg text-center my-6">
              <span className="text-xs font-mono text-[#6A645B] uppercase tracking-widest block mb-2">
                Room Join Code
              </span>
              <div className="font-mono text-4xl sm:text-5xl font-extrabold tracking-[0.25em] text-[#1E1B16]">
                {generatedCode}
              </div>
            </div>

            {/* Direct Link */}
            <div className="space-y-2 mb-6">
              <label className="text-xs font-semibold text-[#1E1B16] block uppercase tracking-wide">
                Direct Join Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}?room=${generatedCode}`}
                  className="flex-1 text-xs font-mono bg-[#FFF8E8] border border-[#D8CCAF] rounded-md px-3 py-2 text-[#1E1B16] select-all"
                />
                <button
                  onClick={handleCopyLink}
                  className="px-3.5 py-2 text-xs font-medium bg-[#315C4C] text-[#FFF8E8] rounded-md hover:bg-[#27493C] transition-colors flex items-center gap-1.5 shadow-xs shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Next Action: Enter Live Room */}
            <div className="border-t border-[#D8CCAF]/60 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-[#6A645B]">
                Other devices can join before or during the conversation.
              </span>
              <button
                onClick={handleEnterRoom}
                className="w-full sm:w-auto px-6 py-2.5 text-xs font-semibold rounded-md bg-[#315C4C] text-[#FFF8E8] hover:bg-[#27493C] transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                <span>Enter Live Room</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mic Check Modal */}
      {showMicCheck && (
        <AudioCheckModal
          displayName={hostName}
          deviceLabel={deviceLabel}
          onConfirm={() => setShowMicCheck(false)}
          onCancel={() => setShowMicCheck(false)}
        />
      )}
    </div>
  );
};

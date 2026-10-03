import React, { useState, useEffect } from 'react';
import { LogIn, Mic, Smartphone, Laptop, Tablet, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { AudioCheckModal } from '../components/AudioCheckModal';
import { AudioLevelMeter } from '../components/AudioLevelMeter';

interface JoinSessionPageProps {
  initialCode?: string;
  onJoinSession: (joinData: {
    roomCode: string;
    displayName: string;
    deviceLabel: string;
    deviceType: 'mobile' | 'laptop' | 'tablet' | 'desktop';
  }) => void;
  onCancel: () => void;
}

export const JoinSessionPage: React.FC<JoinSessionPageProps> = ({
  initialCode = '',
  onJoinSession,
  onCancel,
}) => {
  const [roomCode, setRoomCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState('');
  const [deviceType, setDeviceType] = useState<'mobile' | 'laptop' | 'tablet'>('mobile');
  const [deviceLabel, setDeviceLabel] = useState('Mobile Device Mic');
  const [micChecked, setMicChecked] = useState(false);
  const [showMicModal, setShowMicModal] = useState(false);

  useEffect(() => {
    if (initialCode) {
      setRoomCode(initialCode.toUpperCase());
    }

    // Guess reasonable device label
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      setDeviceType('mobile');
      setDeviceLabel('Phone Microphone (Web)');
    } else {
      setDeviceType('laptop');
      setDeviceLabel('Browser Audio (16kHz PCM)');
    }
  }, [initialCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomCode.trim() || !displayName.trim()) return;

    onJoinSession({
      roomCode: roomCode.trim().toUpperCase(),
      displayName: displayName.trim(),
      deviceLabel: deviceLabel.trim() || `${displayName}’s Device`,
      deviceType,
    });
  };

  return (
    <div className="min-h-screen bg-[#FFEDBF] py-10 px-4 sm:px-6">
      <div className="max-w-md mx-auto">
        {/* Back navigation */}
        <div className="mb-4">
          <button
            onClick={onCancel}
            className="text-xs text-[#6A645B] hover:text-[#1E1B16] font-mono flex items-center gap-1"
          >
            ← Back to Overview
          </button>
        </div>

        {/* Join Card */}
        <div className="bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-sm p-6 sm:p-7">
          <div className="mb-6">
            <span className="text-xs font-mono text-[#315C4C] uppercase tracking-wider block mb-1">
              Join Acoustic Mesh
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#1E1B16]">
              Connect Your Device
            </h1>
            <p className="text-xs text-[#6A645B] mt-1">
              Your device will contribute an independent microphone stream to the shared conversation transcript.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Room Code */}
            <div>
              <label className="block text-xs font-semibold text-[#1E1B16] mb-1.5 uppercase tracking-wide">
                5-Character Room Code
              </label>
              <input
                type="text"
                required
                maxLength={5}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="7F2K9"
                className="w-full px-3.5 py-3 text-center text-xl font-mono uppercase tracking-[0.25em] bg-[#FFF8E8] border border-[#D8CCAF] rounded-md text-[#1E1B16] placeholder:text-[#6A645B]/40 focus:outline-none focus:ring-1 focus:ring-[#315C4C]"
              />
              <span className="text-[11px] text-[#6A645B] mt-1 block">
                Found on the host’s screen or QR code link.
              </span>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-xs font-semibold text-[#1E1B16] mb-1.5 uppercase tracking-wide">
                Your Name
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alice Zhao"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FFF8E8] border border-[#D8CCAF] rounded-md text-[#1E1B16] focus:outline-none focus:ring-1 focus:ring-[#315C4C]"
              />
              <span className="text-[11px] text-[#6A645B] mt-1 block">
                Captions detected closest to you will show this speaker name.
              </span>
            </div>

            {/* Device Type Selection */}
            <div>
              <label className="block text-xs font-semibold text-[#1E1B16] mb-1.5 uppercase tracking-wide">
                Contributing Device Type
              </label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeviceType('mobile');
                    setDeviceLabel(`${displayName || 'Participant'}’s Phone`);
                  }}
                  className={`p-2 rounded border text-center flex flex-col items-center gap-1 text-xs transition-colors ${
                    deviceType === 'mobile'
                      ? 'border-[#315C4C] bg-[#FFEDBF]/60 text-[#1E1B16] font-semibold'
                      : 'border-[#D8CCAF] bg-[#FFF8E8] text-[#6A645B]'
                  }`}
                >
                  <Smartphone className="w-4 h-4 text-[#315C4C]" />
                  <span>Phone</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeviceType('laptop');
                    setDeviceLabel(`${displayName || 'Participant'}’s Laptop`);
                  }}
                  className={`p-2 rounded border text-center flex flex-col items-center gap-1 text-xs transition-colors ${
                    deviceType === 'laptop'
                      ? 'border-[#315C4C] bg-[#FFEDBF]/60 text-[#1E1B16] font-semibold'
                      : 'border-[#D8CCAF] bg-[#FFF8E8] text-[#6A645B]'
                  }`}
                >
                  <Laptop className="w-4 h-4 text-[#315C4C]" />
                  <span>Laptop</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeviceType('tablet');
                    setDeviceLabel(`${displayName || 'Participant'}’s Tablet`);
                  }}
                  className={`p-2 rounded border text-center flex flex-col items-center gap-1 text-xs transition-colors ${
                    deviceType === 'tablet'
                      ? 'border-[#315C4C] bg-[#FFEDBF]/60 text-[#1E1B16] font-semibold'
                      : 'border-[#D8CCAF] bg-[#FFF8E8] text-[#6A645B]'
                  }`}
                >
                  <Tablet className="w-4 h-4 text-[#315C4C]" />
                  <span>Tablet</span>
                </button>
              </div>

              <input
                type="text"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="Device label"
                className="w-full px-3 py-1.5 text-xs font-mono bg-[#FFF8E8] border border-[#D8CCAF] rounded-md text-[#1E1B16]"
              />
            </div>

            {/* Microphone Permission Pre-Check */}
            <div className="p-3 bg-[#FFEDBF]/30 border border-[#D8CCAF] rounded-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-[#1E1B16]">
                  <Mic className="w-4 h-4 text-[#315C4C]" />
                  <span className="font-medium">Microphone Status:</span>
                  <span className="font-mono text-[11px] text-[#315C4C]">
                    {micChecked ? 'Calibrated' : 'Ready to verify'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMicModal(true)}
                  className="text-xs font-medium text-[#315C4C] hover:underline"
                >
                  Test Mic →
                </button>
              </div>
            </div>

            {/* Submit Join */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 text-xs font-semibold rounded-md bg-[#315C4C] text-[#FFF8E8] hover:bg-[#27493C] transition-colors shadow-xs flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Join Live Session</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Audio Calibration Modal */}
      {showMicModal && (
        <AudioCheckModal
          displayName={displayName || 'You'}
          deviceLabel={deviceLabel}
          onConfirm={() => {
            setMicChecked(true);
            setShowMicModal(false);
          }}
          onCancel={() => setShowMicModal(false)}
        />
      )}
    </div>
  );
};

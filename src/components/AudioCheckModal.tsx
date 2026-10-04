import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, CheckCircle2, AlertTriangle, Volume2, RefreshCw } from 'lucide-react';
import { BrowserMicrophone } from '../lib/audio/microphone';
import { AudioLevelMeter } from './AudioLevelMeter';

interface AudioCheckModalProps {
  displayName: string;
  deviceLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const AudioCheckModal: React.FC<AudioCheckModalProps> = ({
  displayName,
  deviceLabel,
  onConfirm,
  onCancel,
}) => {
  const [isLiveMic, setIsLiveMic] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [testSuccess, setTestSuccess] = useState(false);
  const [peakDetected, setPeakDetected] = useState(false);
  const micRef = useRef<BrowserMicrophone | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const mic = new BrowserMicrophone();
    micRef.current = mic;

    mic.start().then((success) => {
      if (success) {
        setIsLiveMic(true);
        setMicError(null);
        startPolling();
      } else {
        setIsLiveMic(false);
        setMicError(
          mic.getError() || 'Microphone permission required. Click "Allow Microphone & Test" below.'
        );
      }
    });

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      mic.stop();
    };
  }, []);

  const startPolling = () => {
    const poll = () => {
      if (micRef.current) {
        const lvl = micRef.current.getAudioLevel();
        setAudioLevel(lvl);
        if (lvl > 15) {
          setPeakDetected(true);
          setTestSuccess(true);
        }
      }
      animFrameRef.current = requestAnimationFrame(poll);
    };
    animFrameRef.current = requestAnimationFrame(poll);
  };

  const handleRetryMic = async () => {
    if (micRef.current) {
      micRef.current.stop();
    }
    const mic = new BrowserMicrophone();
    micRef.current = mic;
    const ok = await mic.start();
    if (ok) {
      setIsLiveMic(true);
      setMicError(null);
      startPolling();
    } else {
      setIsLiveMic(false);
      setMicError(mic.getError() || 'Microphone access denied. Please allow microphone permissions in your browser settings.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1E1B16]/40 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-md p-6 text-[#1E1B16]">
        {/* Header */}
        <div className="mb-4">
          <span className="text-xs font-mono text-[#315C4C] uppercase tracking-wider block mb-1">
            Pre-Flight Acoustic Check
          </span>
          <h2 className="text-xl font-bold tracking-tight text-[#1E1B16]">
            Microphone &amp; Spatial Calibration
          </h2>
          <p className="text-xs text-[#6A645B] mt-1">
            Verifying 16 kHz acoustic input for <strong className="text-[#1E1B16]">{displayName}</strong> ({deviceLabel}).
          </p>
        </div>

        {/* Status notification */}
        {micError ? (
          <div className="p-3 bg-[#FFEDBF]/60 border border-[#A65A32]/40 rounded-md text-xs text-[#A65A32] flex items-start gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Hardware mic access note:</p>
              <p className="mt-0.5 text-[#6A645B]">{micError}</p>
              <button
                type="button"
                onClick={handleRetryMic}
                className="mt-3 px-3 py-1.5 bg-[#315C4C] text-[#FFF8E8] rounded text-xs font-semibold hover:bg-[#27493C] transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Allow Microphone &amp; Test Audio
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-[#315C4C]/10 border border-[#315C4C]/30 rounded-md text-xs text-[#315C4C] flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Hardware microphone connected and streaming 16-bit PCM buffer.</span>
          </div>
        )}

        {/* Live Level Display */}
        <div className="bg-[#FFEDBF]/40 border border-[#D8CCAF] rounded-md p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#1E1B16] flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-[#315C4C]" />
              Live Input Energy:
            </span>
            <span className="font-mono text-xs text-[#6A645B]">
              {audioLevel}% RMS
            </span>
          </div>

          <div className="w-full bg-[#FFF8E8] border border-[#D8CCAF] rounded h-4 p-0.5 flex items-center overflow-hidden">
            <div
              className={`h-full rounded-xs transition-all duration-75 ${
                audioLevel > 70 ? 'bg-[#A65A32]' : 'bg-[#315C4C]'
              }`}
              style={{ width: `${audioLevel}%` }}
            />
          </div>

          <p className="text-[11px] text-[#6A645B] mt-2 italic">
            Say something out loud: &quot;Roundtable testing one two three.&quot;
          </p>
        </div>

        {/* Recommendations */}
        <div className="space-y-2 text-xs text-[#6A645B] border-t border-[#D8CCAF]/50 pt-3 mb-5">
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#315C4C] mt-1.5 shrink-0" />
            <span>Place device flat on the table, microphone unblocked.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#315C4C] mt-1.5 shrink-0" />
            <span>Ensure you are not wearing isolating closed headphones so natural room acoustics remain open.</span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-md border border-[#D8CCAF] hover:bg-[#FFEDBF]/40 text-[#6A645B] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 text-xs font-semibold rounded-md bg-[#315C4C] text-[#FFF8E8] hover:bg-[#27493C] transition-colors shadow-xs flex items-center gap-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Join Live Room
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { X, Copy, Check, QrCode, Smartphone, ExternalLink, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';

interface JoinCodeModalProps {
  joinCode: string;
  sessionName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const JoinCodeModal: React.FC<JoinCodeModalProps> = ({
  joinCode,
  sessionName,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const joinUrl = `${window.location.origin}?room=${joinCode}`;

  useEffect(() => {
    if (!isOpen) return;

    QRCode.toDataURL(joinUrl, {
      width: 256,
      margin: 1,
      color: {
        dark: '#1E1B16',
        light: '#FFF8E8',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Error generating QR code:', err);
      });
  }, [joinUrl, isOpen]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1E1B16]/40 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md bg-[#FFF8E8] border border-[#D8CCAF] rounded-lg shadow-md p-6 text-[#1E1B16]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-[#6A645B] hover:text-[#1E1B16] rounded-md transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 text-xs font-mono text-[#315C4C] uppercase tracking-wider mb-1">
            <QrCode className="w-3.5 h-3.5" />
            <span>Multi-Device Room Connect</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-[#1E1B16]">
            Invite Nearby Devices
          </h2>
          <p className="text-xs text-[#6A645B] mt-0.5">
            Session: <span className="font-medium text-[#1E1B16]">{sessionName}</span>
          </p>
        </div>

        {/* QR Code and Code Block */}
        <div className="flex flex-col items-center justify-center p-4 bg-[#FFEDBF]/50 border border-[#D8CCAF] rounded-md my-4">
          {/* Real Scannable QR Code */}
          <div className="p-3 bg-[#FFF8E8] border border-[#D8CCAF] rounded-md shadow-xs mb-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`Scan QR Code to join session ${joinCode}`}
                className="w-36 h-36 rounded-xs"
              />
            ) : (
              <div className="w-36 h-36 flex items-center justify-center text-xs font-mono text-[#6A645B]">
                Generating QR...
              </div>
            )}
          </div>

          <p className="text-xs text-[#6A645B] text-center mb-2 flex items-center gap-1.5">
            <Smartphone className="w-3.5 h-3.5 text-[#315C4C]" />
            Scan with phone camera or enter room code:
          </p>

          {/* Room Code */}
          <div className="flex items-center justify-center gap-2 font-mono text-3xl font-bold tracking-[0.25em] text-[#1E1B16] bg-[#FFF8E8] px-5 py-2 rounded-md border border-[#D8CCAF]">
            {joinCode.split('').join(' ')}
          </div>
        </div>

        {/* Direct Link Share */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-[#6A645B] block">
            Direct Shareable Room Link
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={joinUrl}
              className="flex-1 bg-[#FFF8E8] border border-[#D8CCAF] rounded-md px-3 py-1.5 text-xs font-mono text-[#1E1B16] select-all focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-[#1E1B16] text-[#FFEDBF] text-xs font-medium rounded-md hover:bg-[#3E382F] transition-colors flex items-center gap-1.5 shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#315C4C]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-4 pt-3 border-t border-[#D8CCAF]/60 flex items-start gap-2 text-xs text-[#6A645B]">
          <ShieldCheck className="w-4 h-4 text-[#315C4C] shrink-0 mt-0.5" />
          <p>
            Place each phone on the conference table. Each device streams raw audio to the fusion mesh for speaker attribution.
          </p>
        </div>
      </div>
    </div>
  );
};

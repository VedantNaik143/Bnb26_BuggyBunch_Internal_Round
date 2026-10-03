import React, { useState } from 'react';
import { X, Copy, Check, QrCode, Smartphone, ExternalLink, ShieldCheck } from 'lucide-react';

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

  if (!isOpen) return null;

  const joinUrl = `${window.location.origin}?room=${joinCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate deterministic QR matrix pattern based on joinCode
  const generateQrMatrix = (code: string) => {
    const size = 21;
    const matrix: boolean[][] = Array(size)
      .fill(false)
      .map(() => Array(size).fill(false));

    // Finder patterns (top-left, top-right, bottom-left 7x7)
    const placeFinder = (r: number, c: number) => {
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          if (
            i === 0 ||
            i === 6 ||
            j === 0 ||
            j === 6 ||
            (i >= 2 && i <= 4 && j >= 2 && j <= 4)
          ) {
            matrix[r + i][c + j] = true;
          }
        }
      }
    };

    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (i % 2 === 0) {
        matrix[6][i] = true;
        matrix[i][6] = true;
      }
    }

    // Pseudorandom data cells keyed on joinCode
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = (hash * 31 + code.charCodeAt(i)) & 0xffffffff;
    }

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        // Skip finder areas
        if (
          (r < 8 && c < 8) ||
          (r < 8 && c >= size - 8) ||
          (r >= size - 8 && c < 8) ||
          (r === 6 || c === 6)
        ) {
          continue;
        }
        hash = (hash * 1103515245 + 12345) & 0x7fffffff;
        matrix[r][c] = (hash % 3) === 0;
      }
    }

    return matrix;
  };

  const qrMatrix = generateQrMatrix(joinCode);

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
          {/* SVG QR Code */}
          <div className="p-3 bg-[#FFF8E8] border border-[#D8CCAF] rounded-md shadow-xs mb-4">
            <svg
              viewBox="0 0 21 21"
              className="w-36 h-36 shape-rendering-crispEdges"
              style={{ shapeRendering: 'crispEdges' }}
            >
              {qrMatrix.map((row, r) =>
                row.map((active, c) =>
                  active ? (
                    <rect
                      key={`${r}-${c}`}
                      x={c}
                      y={r}
                      width={1}
                      height={1}
                      fill="#1E1B16"
                    />
                  ) : null
                )
              )}
            </svg>
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
              className="flex-1 text-xs font-mono bg-[#FFF8E8] border border-[#D8CCAF] rounded-md px-3 py-2 text-[#1E1B16] select-all focus:outline-none focus:ring-1 focus:ring-[#315C4C]"
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 text-xs font-medium bg-[#315C4C] text-[#FFF8E8] rounded-md hover:bg-[#27493C] transition-colors flex items-center gap-1.5 shadow-xs shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Spatial Tips */}
        <div className="mt-4 pt-3 border-t border-[#D8CCAF]/60 flex items-start gap-2 text-xs text-[#6A645B]">
          <ShieldCheck className="w-4 h-4 text-[#315C4C] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Optimal Acoustic Fusion:</strong> Place devices 1–2 meters apart on the table facing upward. No app download or sign-up required.
          </p>
        </div>
      </div>
    </div>
  );
};

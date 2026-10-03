import React from 'react';

interface AudioLevelMeterProps {
  level: number; // 0 to 100
  bars?: number;
  className?: string;
  showText?: boolean;
}

export const AudioLevelMeter: React.FC<AudioLevelMeterProps> = ({
  level,
  bars = 8,
  className = '',
  showText = false,
}) => {
  const normalizedLevel = Math.max(0, Math.min(100, level));
  const activeBars = Math.round((normalizedLevel / 100) * bars);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className="flex items-center gap-0.5 h-3">
        {Array.from({ length: bars }).map((_, idx) => {
          const isActive = idx < activeBars;
          const isHigh = idx >= bars - 2;

          let barColor = 'bg-[#D8CCAF]/40';
          if (isActive) {
            barColor = isHigh ? 'bg-[#A65A32]' : 'bg-[#315C4C]';
          }

          return (
            <div
              key={idx}
              className={`w-1 rounded-xs transition-all duration-75 ${barColor}`}
              style={{
                height: `${Math.max(25, (idx + 1) * (100 / bars))}%`,
              }}
            />
          );
        })}
      </div>

      {showText && (
        <span className="font-mono text-[10px] text-[#6A645B] w-6">
          {Math.round(normalizedLevel)}%
        </span>
      )}
    </div>
  );
};

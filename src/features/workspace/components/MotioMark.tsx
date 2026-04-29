import React from 'react';

interface MotioMarkProps {
  size?: number;
  active?: boolean;
  className?: string;
}

export const MotioMark: React.FC<MotioMarkProps> = ({ size = 28, active = false, className }) => {
  const radius = size * 0.28;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
    >
      <rect
        x={0}
        y={0}
        width={32}
        height={32}
        rx={radius}
        fill={active ? 'currentColor' : 'transparent'}
        stroke={active ? 'transparent' : 'currentColor'}
        strokeOpacity={active ? 0 : 0.18}
        strokeWidth={1}
      />
      <circle cx={10} cy={20} r={3} fill={active ? 'hsl(var(--background))' : 'currentColor'} />
      <circle cx={22} cy={12} r={3} fill={active ? 'hsl(var(--background))' : 'currentColor'} />
      <path
        d="M10 20 C 14 20, 18 12, 22 12"
        fill="none"
        stroke={active ? 'hsl(var(--background))' : 'currentColor'}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
};

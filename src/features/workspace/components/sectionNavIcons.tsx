import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

const baseProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className,
});

export const TimelineNavIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <rect x={3} y={5} width={18} height={14} rx={2} />
    <path d="M7 11h6M7 15h4" />
  </svg>
);

export const DashboardNavIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M3 13l4-4 4 4 6-6 4 4" />
    <path d="M3 19h18" />
  </svg>
);

export const ProjectsNavIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const TeamNavIcon: React.FC<IconProps> = ({ size = 18, className }) => (
  <svg {...baseProps(size, className)}>
    <circle cx={9} cy={8} r={3.5} />
    <path d="M2 20a7 7 0 0 1 14 0" />
    <path d="M16 11a3 3 0 0 0 0-6" />
    <path d="M22 19a5 5 0 0 0-4-4.9" />
  </svg>
);

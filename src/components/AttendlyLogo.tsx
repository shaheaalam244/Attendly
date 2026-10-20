import React from 'react';

interface AttendlyLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  className?: string;
}

export const AttendlyLogo: React.FC<AttendlyLogoProps> = ({
  size = 'md',
  showWordmark = true,
  className = '',
}) => {
  const dimensions = {
    sm: 28,
    md: 34,
    lg: 44,
    xl: 64,
  }[size];

  const textSize = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
    xl: 'text-2xl',
  }[size];

  return (
    <div className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
      <svg
        width={dimensions}
        height={dimensions}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0 rounded-xl shadow-xs"
      >
        <rect width="512" height="512" rx="115" fill="#16A34A" />
        <circle
          cx="256"
          cy="256"
          r="210"
          stroke="#FFFFFF"
          strokeOpacity="0.18"
          strokeWidth="6"
          strokeDasharray="14 14"
        />
        <path
          d="M256 88C178.68 88 116 150.68 116 228C116 324.5 234.5 415.2 246.2 424.0C252.0 428.4 260.0 428.4 265.8 424.0C277.5 415.2 396 324.5 396 228C396 150.68 333.32 88 256 88Z"
          fill="#FFFFFF"
        />
        <circle cx="256" cy="224" r="88" fill="#166534" />
        <path
          d="M218 225L244 251L298 197"
          stroke="#FFFFFF"
          strokeWidth="24"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && (
        <span
          className={`font-display font-bold tracking-tight text-[#0F172A] whitespace-nowrap shrink-0 ${textSize}`}
        >
          Attendly
        </span>
      )}
    </div>
  );
};

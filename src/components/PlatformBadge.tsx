'use client';

interface PlatformBadgeProps {
  platform: string;
  /** Optional override label. If not provided, uses abbreviation. */
  label?: string;
  size?: 'sm' | 'md';
}

const PLATFORM_CONFIG: Record<string, { abbr: string; full: string; className: string }> = {
  stackadapt: {
    abbr: 'SA',
    full: 'StackAdapt',
    className: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  },
  google_ads: {
    abbr: 'GA',
    full: 'Google Ads',
    className: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  linkedin: {
    abbr: 'LI',
    full: 'LinkedIn',
    className: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  },
};

const DEFAULT_CONFIG = {
  abbr: '?',
  full: 'Unknown',
  className: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

/**
 * Badge showing ad platform (StackAdapt, Google Ads, LinkedIn).
 * Consistent colors across all ABM pages.
 */
export default function PlatformBadge({ platform, label, size = 'sm' }: PlatformBadgeProps) {
  const config = PLATFORM_CONFIG[platform] || DEFAULT_CONFIG;
  const displayLabel = label || config.abbr;

  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`${sizeClasses} rounded border ${config.className}`}>
      {displayLabel}
    </span>
  );
}

/**
 * Get the full name for a platform.
 */
export function getPlatformFullName(platform: string): string {
  return PLATFORM_CONFIG[platform]?.full || platform;
}

/**
 * Get platform colors class string.
 */
export function getPlatformColors(platform: string): string {
  return PLATFORM_CONFIG[platform]?.className || DEFAULT_CONFIG.className;
}

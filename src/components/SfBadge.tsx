'use client';

type SfStatus = 'none' | 'lead' | 'account' | 'opportunity' | 'customer';

interface SfBadgeProps {
  status: SfStatus;
  size?: 'sm' | 'md';
}

const SF_BADGE_CONFIG: Record<SfStatus, { label: string; className: string }> = {
  none: {
    label: 'Not in SF',
    className: 'text-gray-500 bg-gray-500/10 border-gray-500/20',
  },
  lead: {
    label: 'Lead',
    className: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  },
  account: {
    label: 'Account',
    className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  opportunity: {
    label: 'Opp',
    className: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  customer: {
    label: 'Customer',
    className: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  },
};

/**
 * Badge showing Salesforce status.
 * Consistent colors across all ABM pages.
 */
export default function SfBadge({ status, size = 'sm' }: SfBadgeProps) {
  const config = SF_BADGE_CONFIG[status] || SF_BADGE_CONFIG.none;

  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span className={`${sizeClasses} rounded border ${config.className}`}>
      {config.label}
    </span>
  );
}

/**
 * Inline text for SF status (no background, just colored text).
 */
export function SfStatusText({ status, size = 'sm' }: SfBadgeProps) {
  const config = SF_BADGE_CONFIG[status] || SF_BADGE_CONFIG.none;
  const textColor = config.className.split(' ')[0]; // Extract just the text color
  const sizeClass = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return <span className={`${sizeClass} ${textColor}`}>{config.label}</span>;
}

/**
 * Format a date as a relative time string.
 * - <1m: "just now"
 * - <60m: "X min ago"
 * - <24h: "X hours ago"
 * - <7d: "X days ago"
 * - <30d: "X weeks ago"
 * - else: "MMM D, YYYY"
 */
export function formatRelativeTime(date: string | Date | null): string {
  if (!date) return 'Never';

  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  // Handle future dates
  if (diffMs < 0) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  if (diffDays < 30) return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format an ISO date string to a full date/time for tooltips.
 */
export function formatFullDateTime(date: string | Date | null): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

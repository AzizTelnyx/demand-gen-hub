'use client';

interface RelevanceBarProps {
  /** Score from 0 to 1 */
  score: number;
  /** Width of the bar (default: "w-20") */
  width?: string;
}

/**
 * A visual bar showing a relevance score as a percentage.
 * Color coding:
 * - ≥0.8: emerald (high)
 * - ≥0.6: amber (medium-high)
 * - ≥0.4: orange (medium-low)
 * - <0.4: red (low)
 */
export default function RelevanceBar({ score, width = 'w-20' }: RelevanceBarProps) {
  const color =
    score >= 0.8
      ? 'bg-emerald-500'
      : score >= 0.6
        ? 'bg-amber-500'
        : score >= 0.4
          ? 'bg-orange-500'
          : 'bg-red-500';

  const percentage = Math.round(score * 100);

  return (
    <div className="flex items-center gap-2">
      <div className={`${width} h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden`}>
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-[var(--text-muted)] tabular-nums">{percentage}%</span>
    </div>
  );
}

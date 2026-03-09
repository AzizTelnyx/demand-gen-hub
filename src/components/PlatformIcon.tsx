const PLATFORM_ICONS: Record<string, string> = {
  google_ads: "/platforms/google-ads.png",
  linkedin: "/platforms/linkedin.png",
  stackadapt: "/platforms/stackadapt.png",
  reddit: "/platforms/reddit.png",
};

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: "Google Ads",
  linkedin: "LinkedIn",
  stackadapt: "StackAdapt",
  reddit: "Reddit",
};

interface PlatformIconProps {
  platform: string;
  size?: number;
  className?: string;
  showLabel?: boolean;
  labelClassName?: string;
}

export default function PlatformIcon({ platform, size = 16, className = "", showLabel = false, labelClassName = "" }: PlatformIconProps) {
  const src = PLATFORM_ICONS[platform];
  const label = PLATFORM_LABELS[platform] || platform;

  if (!src) return <span className={`text-[10px] text-[var(--text-muted)] ${className}`}>{label}</span>;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <img
        src={src}
        alt={label}
        width={size}
        height={size}
        className="object-contain shrink-0"
        style={{ width: size, height: size }}
      />
      {showLabel && <span className={`text-[11px] text-[var(--text-secondary)] ${labelClassName}`}>{label}</span>}
    </span>
  );
}

export { PLATFORM_ICONS, PLATFORM_LABELS };

/**
 * Cadence mark — three offset bars reading as both a Gantt timeline and a
 * rhythm/beat pattern.
 */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="26" height="26" rx="7" fill="var(--accent)" />
      <rect x="5" y="7" width="12" height="3" rx="1.5" fill="white" />
      <rect x="8" y="11.5" width="13" height="3" rx="1.5" fill="white" opacity="0.85" />
      <rect x="5" y="16" width="9" height="3" rx="1.5" fill="white" opacity="0.7" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Logo />
      <span className="text-[0.9375rem] font-semibold tracking-tight">
        Cadence
      </span>
    </span>
  );
}

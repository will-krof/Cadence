"use client";

export function ViewButton({
  active,
  onClick,
  onHide,
  icon,
  label,
  wide,
}: {
  active: boolean;
  onClick: () => void;
  /** Puts the tool away. It stays put away until it is asked back. */
  onHide?: () => void;
  icon: React.ReactNode;
  label: string;
  wide: boolean;
}) {
  return (
    <span className="group/view relative flex items-center">
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={label}
      className={`flex flex-1 items-center gap-2.5 rounded-[var(--radius)] py-2 text-[0.8125rem] font-medium transition ${
        wide ? "px-3" : "justify-center px-2"
      } ${
        active
          ? "bg-[var(--accent-wash)] text-[var(--accent)]"
          : "text-[var(--ink-secondary)] hover:bg-[var(--plane)] hover:text-[var(--ink)]"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      {wide && (
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      )}
    </button>
      {/* Sits over the row rather than inside it: a button can't hold another
          one, and the tool itself is what the row is for. */}
      {onHide && wide && (
        <button
          onClick={onHide}
          className="absolute right-1.5 rounded p-1 text-[var(--ink-muted)] opacity-0 transition hover:bg-[var(--surface)] hover:text-[var(--ink)] focus:opacity-100 group-hover/view:opacity-100"
          aria-label={`Hide ${label} from the sidebar`}
          title={`Hide ${label}`}
        >
          <HideIcon />
        </button>
      )}
    </span>
  );
}

function HideIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2 6h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CollapseIcon({ pointsLeft }: { pointsLeft: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect
        x="1.6"
        y="2.6"
        width="12.8"
        height="10.8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M6.2 2.6v10.8" stroke="currentColor" strokeWidth="1.4" />
      <path
        d={pointsLeft ? "M11.4 6.4L9.4 8l2 1.6" : "M9.4 6.4L11.4 8l-2 1.6"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
      <path
        d="M6 2v8M2 6h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-sm text-[var(--ink-muted)]">
      {children}
    </div>
  );
}

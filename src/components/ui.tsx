"use client";

import { memo, useEffect, useState } from "react";
import {
  Developer,
  Sprint,
  STATUS_OPTIONS,
  TaskStatus,
  UNPLANNED,
  statusMeta,
} from "@/lib/types";
import { formatRange } from "@/lib/dates";

/**
 * A `<select>` that only holds its options once someone reaches for them.
 *
 * A board row carries two of these, and a few hundred rows meant thousands of
 * `<option>` elements built for a list nobody had opened yet — on a busy board
 * they outnumbered everything else on the page. The options are filled in on
 * the interaction that precedes the dropdown (pointer, focus or key), so the
 * list is complete by the time it can be seen.
 */
export function LazySelect({
  value,
  onChange,
  options,
  className,
  style,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  style?: React.CSSProperties;
  ariaLabel: string;
}) {
  const [ready, setReady] = useState(false);
  const fill = () => setReady(true);

  const selected = options.find((o) => o.value === value);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={fill}
      onFocus={fill}
      onKeyDown={fill}
      className={className}
      style={style}
      aria-label={ariaLabel}
    >
      {ready ? (
        options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))
      ) : (
        <option value={value}>{selected?.label ?? ""}</option>
      )}
    </select>
  );
}

/**
 * Which sprint's board is on show. Both boards carry one, so switching from
 * the timeline and switching from the tracker mean the same thing.
 */
export function SprintPicker({
  sprints,
  sprint,
  sprintId,
  hasUnplanned,
  onSelect,
}: {
  sprints: Sprint[];
  sprint: Sprint | null;
  sprintId: string | null;
  hasUnplanned: boolean;
  onSelect: (id: string | null) => void;
}) {
  if (sprints.length === 0 && !hasUnplanned) {
    return (
      <span className="text-[0.75rem] text-[var(--ink-muted)]">
        No sprints yet — plan one on the project card.
      </span>
    );
  }

  const value = sprintId === UNPLANNED ? UNPLANNED : sprint?.id ?? "";

  return (
    <label className="flex flex-col gap-1">
      <span className="field-label">Sprint</span>
      <select
        value={value}
        onChange={(e) => onSelect(e.target.value || null)}
        className="select w-56"
        aria-label="Sprint on show"
      >
        {sprints.map((s) => (
          <option key={s.id} value={s.id}>
            {`Sprint ${s.number} · ${formatRange(s.startDate, s.endDate)}`}
          </option>
        ))}
        {hasUnplanned && <option value={UNPLANNED}>Unplanned</option>}
      </select>
    </label>
  );
}

/** The assignee picker shared by both boards. */
export const AssigneeSelect = memo(function AssigneeSelect({
  developerId,
  developer,
  developers,
  onChange,
  emptyLabel,
  taskTitle,
}: {
  developerId: string | null;
  developer: Developer | null;
  developers: Developer[];
  onChange: (developerId: string | null) => void;
  emptyLabel: string;
  taskTitle: string;
}) {
  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      {developer && (
        <span className="pointer-events-none absolute left-1.5 z-10">
          <Avatar person={developer} size={18} />
        </span>
      )}
      <LazySelect
        value={developerId ?? ""}
        onChange={(next) => onChange(next || null)}
        options={[
          { value: "", label: emptyLabel },
          ...developers.map((d) => ({ value: d.id, label: d.name })),
        ]}
        className={`select truncate ${developer ? "pl-7" : ""}`}
        ariaLabel={`Assignee for ${taskTitle}`}
      />
    </div>
  );
});

export function Stat({
  label,
  value,
  dot,
}: {
  label: string;
  value: number;
  dot?: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[0.6875rem] text-[var(--ink-secondary)]">
      {dot && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: dot }}
        />
      )}
      {label}
      <span className="font-semibold tabular-nums text-[var(--ink)]">{value}</span>
    </span>
  );
}

export function StatusPill({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}) {
  const meta = statusMeta(status);
  return (
    <div className="relative flex items-center">
      <span
        className="pointer-events-none absolute left-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: meta.color }}
      />
      <LazySelect
        value={status}
        onChange={(next) => onChange(next as TaskStatus)}
        options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
        className="select truncate pl-[1.375rem] font-medium"
        style={{
          background: `color-mix(in srgb, ${meta.color} 12%, var(--surface-raised))`,
          borderColor: `color-mix(in srgb, ${meta.color} 28%, transparent)`,
        }}
        ariaLabel="Task status"
      />
    </div>
  );
}

export function CloseIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 2.5l7 7m0-7l-7 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="thin-scroll max-h-[90vh] w-full overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-5 shadow-xl sm:max-w-md sm:rounded-[var(--radius-lg)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
            aria-label="Close"
          >
            <CloseIcon size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}


/** The per-project tool toggle, shared by the new-project form and the card. */
export function ToolCheckbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border p-2.5 transition ${
        checked
          ? "border-[var(--accent)] bg-[var(--accent-wash)]"
          : "border-[var(--hairline)] hover:bg-[var(--plane)]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[0.8125rem] font-medium leading-none">{label}</span>
        <span className="text-[0.6875rem] text-[var(--ink-muted)]">{hint}</span>
      </span>
    </label>
  );
}

/** Photo when there is one, otherwise a coloured initial. */
export function Avatar({
  person,
  size = 32,
}: {
  person: Pick<Developer, "name" | "avatar" | "color">;
  size?: number;
}) {
  if (person.avatar) {
    return (
      // Data URLs can't go through next/image, and these are already downscaled.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.avatar}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: person.color,
        fontSize: Math.max(9, size * 0.4),
      }}
      aria-hidden="true"
    >
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

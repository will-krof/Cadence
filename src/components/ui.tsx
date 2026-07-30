"use client";

import { memo, useEffect, useState } from "react";
import {
  Developer,
  PRIORITY_OPTIONS,
  Sprint,
  TaskPriority,
  TaskStatus,
  UNPLANNED,
  priorityMeta,
  statusMeta,
} from "@/lib/types";
import { formatRange } from "@/lib/dates";
import { safeColor } from "@/lib/sanitize";
import { offeredStatuses } from "@/lib/prefs";

/** Nothing put away: a stable empty list, so a default can't churn a memo. */
const NONE_HIDDEN: TaskStatus[] = [];

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
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  style?: React.CSSProperties;
  ariaLabel: string;
  /** A role that may watch a board but not work in it reads it like this. */
  disabled?: boolean;
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
      disabled={disabled}
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
        {sprints
          .filter((s) => !s.archived)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {`Sprint ${s.number} · ${formatRange(s.startDate, s.endDate)}`}
            </option>
          ))}
        {hasUnplanned && <option value={UNPLANNED}>Unplanned</option>}
        {/* Archived sprints are still openable — their work didn't go
            anywhere — they just sit apart from the ones being worked through. */}
        {sprints.some((s) => s.archived) && (
          <optgroup label="Archived">
            {sprints
              .filter((s) => s.archived)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {`Sprint ${s.number} · ${formatRange(s.startDate, s.endDate)}`}
                </option>
              ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

/**
 * The roles someone holds on a project, as chips. A person can hold several,
 * so this is a set of toggles rather than a pick-one — and it reads the same
 * whether it can be changed or not.
 */
export function RoleChips({
  roles,
  held,
  editable,
  label,
  onToggle,
}: {
  roles: { id: string; name: string }[];
  held: string[];
  editable: boolean;
  /** Names the group for screen readers, e.g. "Ada on Alpha". */
  label: string;
  onToggle: (roleId: string, on: boolean) => void;
}) {
  if (!editable) {
    const names = roles.filter((r) => held.includes(r.id));
    if (names.length === 0) {
      return (
        <span className="text-[0.75rem] text-[var(--ink-muted)]">No role</span>
      );
    }
    return (
      <span className="flex flex-wrap gap-1">
        {names.map((role) => (
          <span
            key={role.id}
            className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--accent)]"
          >
            {role.name}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {roles.length === 0 && (
        <span className="text-[0.75rem] text-[var(--ink-muted)]">
          No roles on this project yet
        </span>
      )}
      {roles.map((role) => {
        const on = held.includes(role.id);
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => onToggle(role.id, !on)}
            aria-pressed={on}
            className={`rounded-full border px-2 py-0.5 text-[0.6875rem] transition ${
              on
                ? "border-[var(--accent)] bg-[var(--accent-wash)] font-medium text-[var(--accent)]"
                : "border-[var(--hairline)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {role.name}
          </button>
        );
      })}
    </span>
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
  disabled,
}: {
  developerId: string | null;
  developer: Developer | null;
  developers: Developer[];
  onChange: (developerId: string | null) => void;
  emptyLabel: string;
  taskTitle: string;
  disabled?: boolean;
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
        // Whoever is on the task is always among the options, even if they have
        // since been archived in another tab: a picker that can't show its own
        // value would read as unassigned when it isn't.
        options={[
          { value: "", label: emptyLabel },
          ...(developer && !developers.some((d) => d.id === developer.id)
            ? [{ value: developer.id, label: `${developer.name} (archived)` }]
            : []),
          ...developers.map((d) => ({ value: d.id, label: d.name })),
        ]}
        className={`select truncate ${developer ? "pl-7" : ""}`}
        ariaLabel={`Assignee for ${taskTitle}`}
        disabled={disabled}
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
  hidden = NONE_HIDDEN,
  onChange,
  disabled,
}: {
  status: TaskStatus;
  /**
   * The statuses put away in the tracker, passed down rather than read here: a
   * board draws hundreds of these, and each one subscribing to the same
   * preference on its own is hundreds of listeners for one answer.
   */
  hidden?: TaskStatus[];
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
}) {
  const meta = statusMeta(status);
  // A column put away is a state nobody is working in, so it is not offered
  // here either — except to a task already in it, which has to keep being able
  // to say what it is.
  return (
    <div className="relative flex items-center">
      <span
        className="pointer-events-none absolute left-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: meta.color }}
      />
      <LazySelect
        value={status}
        onChange={(next) => onChange(next as TaskStatus)}
        options={offeredStatuses(hidden, status).map((s) => ({
          value: s.value,
          label: s.label,
        }))}
        disabled={disabled}
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

/**
 * How urgent a task is, as a mark rather than a word. Boards are already full
 * of words, and this one has to sit beside a title without pushing it off the
 * row — so the label rides along as the tooltip and the accessible name, and
 * the colour is never the only thing saying it.
 */
export function PriorityMark({ priority }: { priority: TaskPriority }) {
  const meta = priorityMeta(priority);
  // Ordinary work is the common case and says nothing; a row is quieter for it.
  if (priority === "MEDIUM") return null;
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold leading-none"
      style={{
        color: meta.color,
        background: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
      }}
      title={`${meta.label} priority`}
      aria-label={`${meta.label} priority`}
    >
      {meta.mark}
    </span>
  );
}

/** The picker both task forms use, so the wording can't drift between them. */
export function PrioritySelect({
  priority,
  onChange,
  disabled,
}: {
  priority: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  disabled?: boolean;
}) {
  const meta = priorityMeta(priority);
  return (
    <div className="relative flex items-center">
      <span
        className="pointer-events-none absolute left-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: meta.color }}
      />
      <select
        value={priority}
        onChange={(e) => onChange(e.target.value as TaskPriority)}
        disabled={disabled}
        className="select truncate pl-[1.375rem] font-medium"
        aria-label="Task priority"
      >
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A section that can be folded away. Used where a list has no natural length —
 * the people on a project, the sprints that have been archived — so one long
 * list can't push everything else off the card.
 */
export function Disclosure({
  label,
  count,
  hint,
  defaultOpen = true,
  summary,
  children,
}: {
  label: string;
  count?: number;
  hint?: string;
  defaultOpen?: boolean;
  /** Shown in place of the children while folded, if anything should be. */
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-left"
        >
          <Chevron open={open} />
          <span className="text-[0.8125rem] font-semibold tracking-tight">
            {label}
          </span>
          {count !== undefined && (
            <span className="text-[0.8125rem] font-normal text-[var(--ink-muted)]">
              {count}
            </span>
          )}
        </button>
        {hint && (
          <span className="text-[0.75rem] text-[var(--ink-muted)]">{hint}</span>
        )}
      </div>
      {open ? children : summary}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={`shrink-0 text-[var(--ink-muted)] transition-transform ${
        open ? "rotate-90" : ""
      }`}
    >
      <path
        d="M3.5 1.5L7 5l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  /**
   * A dialog that is a workspace rather than a question. Editing a task is the
   * one place everything about it is on offer at once — dates, people, steps,
   * what it waits on, what happened to it — and a phone-width column made that
   * a scroll through a queue instead of a form you can see.
   */
  wide?: boolean;
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
        className={`thin-scroll w-full overflow-y-auto rounded-t-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-5 shadow-xl sm:rounded-[var(--radius-lg)] ${
          wide
            ? "max-h-[94vh] sm:max-w-5xl sm:p-6"
            : "max-h-[90vh] sm:max-w-md"
        }`}
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


/**
 * One thing a project can switch on or off, as a row you can hit anywhere.
 *
 * It is a switch rather than a tick box because that is what it means: these
 * are not answers being collected on the way to a save, they are things that
 * are either on or off right now — and a switch says which without having to
 * read the label twice. The state is also said in words, so "on" doesn't rest
 * on seeing a colour.
 */
export function SettingToggle({
  checked,
  onChange,
  label,
  hint,
  /** Said under the row when this setting, as it stands, needs explaining. */
  note,
  /** A setting that can't be answered yet, because something above it isn't on. */
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  note?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      // Positioned, so the tick box this hides is placed against the row.
      // Left to the page, an absolutely positioned box belongs to the viewport
      // instead — it slips out of the scrolling panel it is drawn in and lands
      // below the window, which stretches the page and shows as a band of
      // empty colour under the app.
      className={`relative flex items-start gap-3 rounded-[var(--radius)] border p-3 transition ${
        disabled
          ? "cursor-not-allowed border-[var(--hairline)] opacity-50"
          : checked
            ? "cursor-pointer border-[var(--accent)] bg-[var(--accent-wash)]"
            : "cursor-pointer border-[var(--hairline)] hover:bg-[var(--plane)]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={`relative mt-0.5 h-4 w-7 shrink-0 rounded-full transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-[var(--accent-wash)] ${
          checked && !disabled ? "bg-[var(--accent)]" : "bg-[var(--baseline)]"
        }`}
        aria-hidden="true"
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
            checked ? "translate-x-3" : ""
          }`}
        />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[0.8125rem] leading-none font-medium">
          {label}
          <span
            className={`text-[0.5625rem] tracking-wide uppercase ${
              checked && !disabled
                ? "text-[var(--accent)]"
                : "text-[var(--ink-muted)]"
            }`}
          >
            {checked ? "On" : "Off"}
          </span>
        </span>
        <span className="text-[0.6875rem] text-[var(--ink-muted)]">{hint}</span>
        {note && (
          <span className="mt-1 text-[0.6875rem] text-[var(--ink-secondary)]">
            {note}
          </span>
        )}
      </span>
    </label>
  );
}

/**
 * A coloured initial, and only ever that. The workspace holds no images —
 * nothing is uploaded, nothing is stored — so who somebody is on a row is their
 * letter and their colour.
 */
export function Avatar({
  person,
  size = 32,
}: {
  person: Pick<Developer, "name" | "color">;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: safeColor(person.color) ?? "var(--gridline)",
        fontSize: Math.max(9, size * 0.4),
      }}
      aria-hidden="true"
    >
      {person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { MAX_ASSIGNEES } from "@/lib/assignees";
import {
  Developer,
  PRIORITY_OPTIONS,
  ProjectColumn,
  ProjectTag,
  Sprint,
  TaskPriority,
  UNPLANNED,
  UNSORTED,
  UNSORTED_COLOR,
  UNSORTED_LABEL,
  columnMeta,
  priorityMeta,
} from "@/lib/types";
import { formatRange } from "@/lib/dates";
import { safeColor } from "@/lib/sanitize";

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

/**
 * One of a project's labels, drawn in its own colour.
 *
 * The colour is a wash behind the word rather than the word itself: a tag has
 * to be readable on both themes, and eight coloured words on a card is a
 * ransom note. `dot` is the same tag with the word taken away, for the places
 * that have a fixed width to keep.
 */
export function TagChip({ tag, dot = false }: { tag: ProjectTag; dot?: boolean }) {
  const color = safeColor(tag.color) ?? "var(--baseline)";
  if (dot) {
    return (
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: color }}
        title={tag.name}
        aria-label={tag.name}
      />
    );
  }
  return (
    <span
      className="inline-flex max-w-40 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-tight"
      style={{
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
        color,
      }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

/**
 * The tags on a board row or a card. Three at most and dots past that, so a
 * task wearing eight labels is the same width as one wearing none.
 */
export function TagDots({ tags, max = 3 }: { tags: ProjectTag[]; max?: number }) {
  if (tags.length === 0) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1"
      title={tags.map((t) => t.name).join(", ")}
    >
      {tags.slice(0, max).map((tag) => (
        <TagChip key={tag.id} tag={tag} dot />
      ))}
      {tags.length > max && (
        <span className="text-[0.625rem] text-[var(--ink-muted)]">
          +{tags.length - max}
        </span>
      )}
    </span>
  );
}

/**
 * Which of a project's tags a task wears. Every tag the project keeps is
 * offered — there are never many — so this is a row of chips to press rather
 * than a list to search.
 */
export function TagPicker({
  tags,
  chosen,
  onChange,
}: {
  tags: ProjectTag[];
  chosen: string[];
  onChange: (ids: string[]) => void;
}) {
  if (tags.length === 0) {
    return (
      <p className="text-[0.75rem] text-[var(--ink-muted)]">
        This project hasn’t made any tags yet — they are set up on the project’s
        settings.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const on = chosen.includes(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(
                on ? chosen.filter((id) => id !== tag.id) : [...chosen, tag.id]
              )
            }
            className={`rounded-full transition ${
              on ? "" : "opacity-40 grayscale hover:opacity-70"
            }`}
          >
            <TagChip tag={tag} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Who is on a task, as faces rather than a name in a box.
 *
 * A task takes up to four people, and a board has no room to grow with them:
 * the stack is a fixed width whatever it holds — three faces overlapping, and
 * a "+1" where the fourth would be — so a Gantt row and a tracker card are the
 * same width for a task shared by four as for one nobody has picked up.
 */
export function AvatarStack({
  people,
  size = 20,
  emptyLabel,
  max = STACK_FACES,
}: {
  people: Developer[];
  size?: number;
  /** What stands in for nobody. */
  emptyLabel?: string;
  /** Faces before the count takes over. Tighter where the room is tighter. */
  max?: number;
}) {
  if (people.length === 0) {
    return (
      <span className="truncate text-[0.75rem] text-[var(--ink-muted)]">
        {emptyLabel ?? "—"}
      </span>
    );
  }

  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex shrink-0 items-center">
      {shown.map((person, i) => (
        <span
          key={person.id}
          // Overlapped, and each face lifted over the one before it, so the
          // row of them reads as one group rather than three things.
          className="rounded-full ring-2 ring-[var(--surface-raised)]"
          style={{ marginLeft: i === 0 ? 0 : -size / 3, zIndex: shown.length - i }}
          title={person.name}
        >
          <Avatar person={person} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="flex items-center justify-center rounded-full bg-[var(--gridline)] font-semibold text-[var(--ink-secondary)] ring-2 ring-[var(--surface-raised)]"
          style={{
            width: size,
            height: size,
            marginLeft: -size / 3,
            fontSize: Math.max(8, size * 0.36),
          }}
          title={people.slice(max).map((p) => p.name).join(", ")}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

/** Faces before the count takes over. Four people read as three and a "+1". */
const STACK_FACES = 3;

/**
 * The picker both boards and both task forms share: the stack, and a list to
 * change it by. Nobody is offered a fifth name — the rows past the fourth go
 * quiet rather than disappearing, so the limit is something you can see rather
 * than something that happens to you.
 */
export function AssigneePicker({
  assignees,
  developers,
  onChange,
  taskTitle,
  disabled,
  emptyLabel = "—",
  size = 20,
}: {
  assignees: Developer[];
  /** Everyone who could be put on it. */
  developers: Developer[];
  onChange: (ids: string[]) => void;
  /** Names the control for a screen reader: "Who is on <task>". */
  taskTitle: string;
  /** A role that may watch a board but not work in it reads the stack alone. */
  disabled?: boolean;
  emptyLabel?: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  if (disabled) {
    return (
      <span className="flex min-w-0 items-center">
        <AvatarStack people={assignees} size={size} emptyLabel={emptyLabel} />
      </span>
    );
  }

  const ids = assignees.map((d) => d.id);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex min-w-0 items-center gap-1 rounded-[var(--radius)] border border-transparent px-1 py-0.5 transition hover:border-[var(--hairline)] hover:bg-[var(--plane)]"
        aria-label={`Who is on ${taskTitle}`}
        title={
          assignees.length > 0
            ? assignees.map((d) => d.name).join(", ")
            : "Nobody on this yet"
        }
      >
        <AvatarStack people={assignees} size={size} emptyLabel={emptyLabel} />
      </button>
      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)}>
          <AssigneeMenu ids={ids} developers={developers} onChange={onChange} />
        </Popover>
      )}
    </>
  );
}

/** The list itself, shared by the stack on a board and the field on a form. */
function AssigneeMenu({
  ids,
  developers,
  onChange,
}: {
  ids: string[];
  developers: Developer[];
  onChange: (ids: string[]) => void;
}) {
  const full = ids.length >= MAX_ASSIGNEES;

  function toggle(id: string) {
    if (ids.includes(id)) onChange(ids.filter((a) => a !== id));
    else if (!full) onChange([...ids, id]);
  }

  return (
    <>
      <p className="field-label mb-1.5 px-1">
        On this task {ids.length}/{MAX_ASSIGNEES}
      </p>
      <div className="thin-scroll flex max-h-64 flex-col overflow-y-auto">
        {developers.length === 0 && (
          <p className="px-1 py-1.5 text-[0.75rem] text-[var(--ink-muted)]">
            Nobody on the roster yet.
          </p>
        )}
        {developers.map((person) => {
          const on = ids.includes(person.id);
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => toggle(person.id)}
              disabled={!on && full}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-[var(--radius)] px-1.5 py-1.5 text-left text-[0.8125rem] transition ${
                on
                  ? "bg-[var(--accent-wash)] text-[var(--accent)]"
                  : full
                    ? "cursor-not-allowed text-[var(--ink-muted)] opacity-50"
                    : "hover:bg-[var(--plane)]"
              }`}
            >
              <Avatar person={person} size={18} />
              <span className="min-w-0 flex-1 truncate">{person.name}</span>
              {on && <span aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
      {ids.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="mt-1 w-full rounded-[var(--radius)] px-1.5 py-1.5 text-left text-[0.75rem] text-[var(--ink-muted)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)]"
        >
          Take everyone off
        </button>
      )}
      {full && (
        <p className="mt-1 px-1.5 text-[0.6875rem] text-[var(--ink-muted)]">
          Four is the most a task takes. Take somebody off to add another.
        </p>
      )}
    </>
  );
}

/**
 * The same list, on a form, where there is room to say the names.
 *
 * A board shows faces because it has a column to fit them in; a form has a
 * field, and a field that says "Ada, Bo" is worth more than one that makes you
 * hover three circles to find out who is on the work.
 */
export function AssigneeField({
  ids,
  developers,
  onChange,
  taskTitle,
}: {
  ids: string[];
  developers: Developer[];
  onChange: (ids: string[]) => void;
  taskTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const chosen = ids
    .map((id) => developers.find((d) => d.id === id))
    .filter((d): d is Developer => d != null);

  return (
    <div className="flex min-h-[2.125rem] flex-wrap items-center gap-1.5 rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--surface-raised)] px-1.5 py-1">
      {chosen.map((person) => (
        <span
          key={person.id}
          className="flex items-center gap-1.5 rounded-full bg-[var(--plane)] py-0.5 pr-1 pl-1 text-[0.75rem]"
        >
          <Avatar person={person} size={16} />
          <span className="max-w-32 truncate">{person.name}</span>
          <button
            type="button"
            onClick={() => onChange(ids.filter((id) => id !== person.id))}
            className="rounded-full p-0.5 text-[var(--ink-muted)] transition hover:text-[var(--danger)]"
            aria-label={`Take ${person.name} off this task`}
          >
            <CloseIcon size={9} />
          </button>
        </span>
      ))}
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        className="rounded-full px-2 py-0.5 text-[0.75rem] text-[var(--ink-muted)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)]"
        aria-label={`Put somebody on ${taskTitle}`}
      >
        {chosen.length === 0 ? "Nobody yet — add someone" : "Add"}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)}>
          <AssigneeMenu ids={ids} developers={developers} onChange={onChange} />
        </Popover>
      )}
    </div>
  );
}

/**
 * A small panel hung off a button, drawn into the page itself rather than into
 * the row that opened it: a board row lives inside two scrolling boxes, and
 * anything drawn inside one of those is cut off at its edge.
 */
export function Popover({
  anchor,
  onClose,
  children,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  // Placed once it can be measured, and kept on screen: a row near the bottom
  // of the window opens its list upwards rather than off the end of it.
  useLayoutEffect(() => {
    const button = anchor.current?.getBoundingClientRect();
    const box = panel.current?.getBoundingClientRect();
    if (!button || !box) return;
    const gap = 4;
    const top =
      button.bottom + gap + box.height > window.innerHeight
        ? Math.max(gap, button.top - gap - box.height)
        : button.bottom + gap;
    const left = Math.min(
      Math.max(gap, button.left),
      Math.max(gap, window.innerWidth - box.width - gap)
    );
    setAt({ top, left });
  }, [anchor]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDown(e: MouseEvent) {
      if (panel.current?.contains(e.target as Node)) return;
      if (anchor.current?.contains(e.target as Node)) return;
      onClose();
    }
    window.addEventListener("keydown", onKey);
    // Capture, so a press inside a board that stops its own bubbling still
    // closes this.
    window.addEventListener("mousedown", onDown, true);
    // Scrolling a board would leave the panel behind, pointing at nothing.
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panel}
      className="fixed z-[70] w-56 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1.5 shadow-xl"
      style={{
        top: at?.top ?? 0,
        left: at?.left ?? 0,
        visibility: at ? "visible" : "hidden",
      }}
      role="dialog"
    >
      {children}
    </div>,
    document.body
  );
}

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

export function ColumnPill({
  columnId,
  columns,
  onChange,
  disabled,
}: {
  /** Which column the task stands in; null is work nobody has sorted. */
  columnId: string | null;
  /**
   * The board's columns, passed down rather than read here: a board draws
   * hundreds of these, and each one reaching for the open project on its own
   * is hundreds of subscriptions to one answer.
   */
  columns: ProjectColumn[];
  onChange: (columnId: string | null) => void;
  disabled?: boolean;
}) {
  const meta = columnMeta(columns, columnId);
  const color = meta?.color ?? UNSORTED_COLOR;
  // Unsorted is offered only to a task that is unsorted. It is where work ends
  // up when its column is deleted, not somewhere anybody files work on purpose
  // — but a task standing there has to be able to say so.
  const options = [
    ...(meta ? [] : [{ value: UNSORTED, label: UNSORTED_LABEL }]),
    ...columns.map((c) => ({ value: c.id, label: c.name })),
  ];

  // A tracker with no columns has nowhere to move a task to, so the pill says
  // where the task stands and stops there.
  if (columns.length === 0) {
    return (
      <span
        className="flex items-center gap-1.5 truncate rounded-[var(--radius)] border border-[var(--hairline)] px-2 py-1 text-[0.75rem] font-medium text-[var(--ink-secondary)]"
        title="This tracker has no columns yet"
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        {meta?.name ?? UNSORTED_LABEL}
      </span>
    );
  }

  return (
    <div className="relative flex items-center">
      <span
        className="pointer-events-none absolute left-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <LazySelect
        value={columnId ?? UNSORTED}
        onChange={(next) => onChange(next === UNSORTED ? null : next)}
        options={options}
        disabled={disabled}
        className="select truncate pl-[1.375rem] font-medium"
        style={{
          background: `color-mix(in srgb, ${color} 12%, var(--surface-raised))`,
          borderColor: `color-mix(in srgb, ${color} 28%, transparent)`,
        }}
        ariaLabel="Tracker column"
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

/**
 * How much room a dialog is given.
 *
 * `ask` is a question with an answer or two. `read` is something to read across
 * two columns — wide enough for that and no wider, because a card with a
 * paragraph in it stretched over a whole desk reads as mostly empty. `work` is
 * the one dialog that is a workspace: editing a task, where dates, people,
 * steps, dependencies and history are all on offer at once.
 */
const MODAL_WIDTHS = {
  ask: "max-h-[90vh] sm:max-w-md",
  read: "max-h-[92vh] sm:max-w-3xl",
  work: "max-h-[94vh] sm:max-w-5xl",
} as const;

export function Modal({
  title,
  onClose,
  size = "ask",
  /** Draw the heading strip, or leave the dialog to head itself. */
  heading = true,
  children,
}: {
  title: string;
  onClose: () => void;
  size?: keyof typeof MODAL_WIDTHS;
  heading?: boolean;
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
          size === "ask" ? "" : "sm:p-6"
        } ${MODAL_WIDTHS[size]}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {heading ? (
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
        ) : (
          // The dialog heads itself: the close button still has to be somewhere,
          // and it belongs in the same corner it always is.
          <button
            onClick={onClose}
            className="float-right -mr-1 -mt-1 rounded p-1 text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
            aria-label="Close"
          >
            <CloseIcon size={14} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * One labelled thing a card has to say. The heading is a small label rather
 * than a rule across the card: a column of short sections is read as a group,
 * and five full-width rules is a card that looks like a form.
 */
export function Section({
  title,
  count,
  meter,
  children,
}: {
  title: string;
  /** A number the heading carries — how many, or how far along. */
  count?: string | number;
  /** A small mark the heading carries beside the count, like a progress bar. */
  meter?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5">
      <h3 className="flex items-center gap-1.5">
        <span className="field-label">{title}</span>
        {count != null && (
          <span className="text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
            {count}
          </span>
        )}
        {meter}
      </h3>
      {children}
    </section>
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

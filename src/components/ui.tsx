"use client";

import { useEffect, useState } from "react";
import { STATUS_OPTIONS, TaskStatus, statusMeta } from "@/lib/types";

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
      <select
        value={status}
        onChange={(e) => onChange(e.target.value as TaskStatus)}
        className="select truncate pl-[1.375rem] font-medium"
        style={{
          background: `color-mix(in srgb, ${meta.color} 12%, var(--surface-raised))`,
          borderColor: `color-mix(in srgb, ${meta.color} 28%, transparent)`,
        }}
        aria-label="Task status"
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
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

export function NewProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    description: string;
    hasTimeline: boolean;
    hasTracker: boolean;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hasTimeline, setHasTimeline] = useState(true);
  const [hasTracker, setHasTracker] = useState(true);

  const noView = !hasTimeline && !hasTracker;

  return (
    <Modal onClose={onClose} title="New project">
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || noView) return;
          onCreate({
            name: name.trim(),
            description: description.trim(),
            hasTimeline,
            hasTracker,
          });
        }}
      >
        <Field label="Project name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. VR Client Q3"
          />
        </Field>
        <Field label="Short description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input min-h-16 resize-y"
            placeholder="What is this project about…"
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="field-label mb-1.5">What do you need?</legend>
          <ToolCheckbox
            checked={hasTimeline}
            onChange={setHasTimeline}
            label="Gantt chart"
            hint="Timeline with sprint dates"
          />
          <ToolCheckbox
            checked={hasTracker}
            onChange={setHasTracker}
            label="Task tracker"
            hint="Kanban board by status"
          />
          {noView && (
            <p className="text-[0.6875rem] text-[#d03b3b]">Pick at least one.</p>
          )}
        </fieldset>

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={noView || !name.trim()}
          >
            Create project
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ToolCheckbox({
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

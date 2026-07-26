"use client";

import { useEffect, useState } from "react";
import { toISODate } from "@/lib/dates";
import {
  Developer,
  DEVELOPER_PALETTE,
  STATUS_OPTIONS,
  TaskStatus,
  statusMeta,
} from "@/lib/types";

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
            <p className="text-[0.6875rem] text-[#d03b3b]">
              Pick at least one.
            </p>
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

export function AddTaskModal({
  developers,
  onClose,
  onCreate,
}: {
  developers: Developer[];
  onClose: () => void;
  onCreate: (input: {
    title: string;
    description: string;
    link: string;
    startDate: string;
    endDate: string;
    developerId: string | null;
  }) => void;
}) {
  const today = toISODate(new Date());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [developerId, setDeveloperId] = useState("");

  return (
    <Modal onClose={onClose} title="New task">
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onCreate({
            title: title.trim(),
            description: description.trim(),
            link: link.trim(),
            startDate,
            endDate: endDate < startDate ? startDate : endDate,
            developerId: developerId || null,
          });
        }}
      >
        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="e.g. [Backend] API update"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input min-h-20 resize-y"
            placeholder="What needs to be done…"
          />
        </Field>
        <Field label="Link">
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="input"
            placeholder="https://…"
          />
        </Field>
        <div className="flex flex-col gap-3.5 sm:flex-row">
          <Field label="Start" className="flex-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="End" className="flex-1">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <Field label="Developer">
          <select
            value={developerId}
            onChange={(e) => setDeveloperId(e.target.value)}
            className="select"
          >
            <option value="">Unassigned</option>
            {developers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Create task
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function DevelopersModal({
  developers,
  onClose,
  onCreate,
  onDelete,
}: {
  developers: Developer[];
  onClose: () => void;
  onCreate: (input: { name: string; color: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(
    DEVELOPER_PALETTE[developers.length % DEVELOPER_PALETTE.length]
  );

  return (
    <Modal onClose={onClose} title="Developers">
      <div className="mb-4 flex flex-col">
        {developers.map((d) => (
          <div
            key={d.id}
            className="group flex items-center gap-2.5 border-b border-[var(--hairline)] py-2 text-[0.8125rem] last:border-0"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: d.color }}
            />
            <span className="flex-1 truncate">{d.name}</span>
            <button
              onClick={() => onDelete(d.id)}
              className="rounded p-0.5 text-[var(--ink-muted)] opacity-0 transition hover:text-[#d03b3b] focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={`Remove ${d.name}`}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
        {developers.length === 0 && (
          <p className="py-2 text-[0.8125rem] text-[var(--ink-muted)]">
            No developers yet.
          </p>
        )}
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onCreate({ name: name.trim(), color });
          setName("");
          setColor(
            DEVELOPER_PALETTE[(developers.length + 1) % DEVELOPER_PALETTE.length]
          );
        }}
      >
        <Field label="Name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. Alex"
          />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap gap-1.5">
            {DEVELOPER_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Select colour ${c}`}
                aria-pressed={color === c}
                className={`h-6 w-6 rounded-full transition ${
                  color === c
                    ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--surface-raised)]"
                    : "hover:scale-110"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <button type="submit" className="btn-primary self-start">
          Add developer
        </button>
      </form>
    </Modal>
  );
}

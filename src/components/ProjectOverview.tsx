"use client";

import { useMemo, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { useFeedback } from "@/components/Feedback";
import { Avatar, Field, ToolCheckbox } from "@/components/ui";
import { diffDays, toISODate } from "@/lib/dates";
import { Developer, STATUS_OPTIONS } from "@/lib/types";

/**
 * The project card: everything about one project in one place — its details,
 * who is on it, when it runs, and which sprint it is in.
 */
export function ProjectOverview({
  onOpenView,
}: {
  onOpenView: (view: "timeline" | "tracker" | "team") => void;
}) {
  const {
    activeProject,
    updateProject,
    deleteProject,
    tasks,
    sprint,
    stats,
    projectLoading,
    updateSprint,
  } = useBoard();
  const { confirm } = useFeedback();

  const [editing, setEditing] = useState(false);

  // Dates aren't stored on the project — the work defines them, so the span of
  // its tasks is the project's span.
  const span = useMemo(() => {
    let start: Date | null = null;
    let end: Date | null = null;
    for (const t of tasks) {
      const s = new Date(t.startDate);
      const e = new Date(t.endDate);
      if (!start || s < start) start = s;
      if (!end || e > end) end = e;
    }
    return start && end ? { start, end, days: diffDays(start, end) + 1 } : null;
  }, [tasks]);

  /** Everyone with at least one task here, in the order they first appear. */
  const people = useMemo(() => {
    const byId = new Map<string, Developer>();
    for (const t of tasks) {
      if (t.developer && !byId.has(t.developer.id)) byId.set(t.developer.id, t.developer);
    }
    return [...byId.values()];
  }, [tasks]);

  if (!activeProject) return null;

  const unassigned = tasks.filter((t) => !t.developerId).length;

  async function remove() {
    if (!activeProject) return;
    const ok = await confirm({
      title: `Delete “${activeProject.name}”?`,
      body: "Its tasks and sprint go with it. This cannot be undone.",
      confirmLabel: "Delete project",
      destructive: true,
    });
    if (!ok) return;
    await deleteProject(activeProject.id);
  }

  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {editing ? (
          <DetailsForm
            key={activeProject.id}
            project={activeProject}
            onCancel={() => setEditing(false)}
            onSave={async (values) => {
              await updateProject(activeProject.id, values);
              setEditing(false);
            }}
          />
        ) : (
          <header className="flex flex-wrap items-start gap-4">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius)] text-lg font-semibold uppercase text-white"
              style={{ background: "var(--accent)" }}
              aria-hidden="true"
            >
              {activeProject.name.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight">
                {activeProject.name}
              </h2>
              <p className="mt-0.5 text-[0.875rem] text-[var(--ink-secondary)]">
                {activeProject.description || "No description yet."}
              </p>
            </div>
            <button onClick={() => setEditing(true)} className="btn-primary">
              Edit project
            </button>
          </header>
        )}

        <section
          className="grid gap-x-6 gap-y-4 rounded-[var(--radius-lg)] border border-[var(--hairline)] p-4 sm:grid-cols-3"
          aria-label="Project statistics"
        >
          <Metric
            label="Developers"
            value={projectLoading ? null : String(people.length)}
            hint={
              unassigned > 0 && !projectLoading
                ? `${unassigned} task${unassigned === 1 ? "" : "s"} unassigned`
                : undefined
            }
          />
          <Metric
            label="Sprint"
            value={sprint ? `#${sprint.number}` : "—"}
            hint={sprint ? "In progress" : "Not started"}
          />
          <Metric
            label="Tasks"
            value={projectLoading ? null : String(stats.total)}
            hint={
              projectLoading ? undefined : `${stats.progress.toFixed(0)}% done`
            }
          />
          <Metric
            label="Start date"
            value={projectLoading ? null : span ? toISODate(span.start) : "—"}
            hint="Earliest task"
          />
          <Metric
            label="End date"
            value={projectLoading ? null : span ? toISODate(span.end) : "—"}
            hint="Latest task"
          />
          <Metric
            label="Duration"
            value={
              projectLoading ? null : span ? `${span.days} days` : "—"
            }
            hint="Start to end"
          />
        </section>

        {!projectLoading && stats.total > 0 && (
          <section>
            <h3 className="field-label mb-2">Task status</h3>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--gridline)]">
              <div
                className="h-full rounded-full bg-[#0ca30c] transition-[width] duration-300"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
              {STATUS_OPTIONS.map((s) => (
                <span
                  key={s.value}
                  className="flex items-center gap-1.5 text-[0.6875rem] text-[var(--ink-secondary)]"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.label}
                  <span className="font-semibold tabular-nums text-[var(--ink)]">
                    {stats.counts[s.value]}
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-2.5">
          <h3 className="text-[0.8125rem] font-semibold tracking-tight">
            Sprint
          </h3>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <SprintNumberInput
              value={sprint?.number ?? 1}
              onCommit={(number) => updateSprint({ number })}
            />
            <Field label="Starts" className="w-[9.5rem]">
              <input
                type="date"
                value={sprint ? toISODate(new Date(sprint.startDate)) : ""}
                onChange={(e) => updateSprint({ startDate: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Ends" className="w-[9.5rem]">
              <input
                type="date"
                value={sprint ? toISODate(new Date(sprint.endDate)) : ""}
                onChange={(e) => updateSprint({ endDate: e.target.value })}
                className="input"
              />
            </Field>
          </div>
          {!sprint && (
            <p className="text-[0.75rem] text-[var(--ink-muted)]">
              Pick the dates to start sprint 1.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[0.8125rem] font-semibold tracking-tight">
            Developers
            {!projectLoading && (
              <span className="ml-2 font-normal text-[var(--ink-muted)]">
                {people.length}
              </span>
            )}
          </h3>
          {projectLoading ? (
            <p className="text-[0.8125rem] text-[var(--ink-muted)]">Loading…</p>
          ) : people.length === 0 ? (
            <p className="text-[0.8125rem] text-[var(--ink-muted)]">
              Nobody is assigned to this project yet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {people.map((person) => {
                const open = tasks.filter(
                  (t) => t.developerId === person.id && t.status !== "DONE"
                ).length;
                return (
                  <li
                    key={person.id}
                    className="flex items-center gap-2 rounded-full border border-[var(--hairline)] py-1 pl-1 pr-3"
                  >
                    <Avatar person={person} size={24} />
                    <span className="text-[0.8125rem]">{person.name}</span>
                    <span className="text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
                      {open} open
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            onClick={() => onOpenView("team")}
            className="btn-secondary mt-2.5"
          >
            Open Team
          </button>
        </section>

        <section>
          <h3 className="mb-2 text-[0.8125rem] font-semibold tracking-tight">
            Tools
          </h3>
          <div className="flex flex-wrap gap-2">
            {activeProject.hasTimeline && (
              <button
                onClick={() => onOpenView("timeline")}
                className="btn-secondary"
              >
                Open Timeline
              </button>
            )}
            {activeProject.hasTracker && (
              <button
                onClick={() => onOpenView("tracker")}
                className="btn-secondary"
              >
                Open Tracker
              </button>
            )}
            {!activeProject.hasTimeline && !activeProject.hasTracker && (
              <p className="text-[0.8125rem] text-[var(--ink-muted)]">
                No board enabled — turn one on in Edit project.
              </p>
            )}
          </div>
        </section>

        <div className="border-t border-[var(--hairline)] pt-4">
          <button onClick={remove} className="btn-secondary !text-[#d03b3b]">
            Delete project
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Held locally while typing so "12" doesn't first save as sprint 1, then
 * committed on blur or Enter.
 */
function SprintNumberInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (number: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const next = Number(draft);
    setDraft(null);
    if (draft !== null && Number.isFinite(next) && next >= 1 && Math.floor(next) !== value) {
      onCommit(Math.floor(next));
    }
  }

  return (
    <Field label="Number" className="w-24">
      <input
        type="number"
        min={1}
        step={1}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="input"
      />
    </Field>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className="mt-0.5 text-[1.125rem] font-semibold tabular-nums tracking-tight">
        {value ?? <span className="text-[var(--ink-muted)]">…</span>}
      </p>
      {hint && (
        <p className="text-[0.6875rem] text-[var(--ink-muted)]">{hint}</p>
      )}
    </div>
  );
}

interface DetailsValues {
  name: string;
  description: string;
  hasTimeline: boolean;
  hasTracker: boolean;
  hasTeam: boolean;
}

function DetailsForm({
  project,
  onCancel,
  onSave,
}: {
  project: Omit<DetailsValues, "description"> & { description: string | null };
  onCancel: () => void;
  onSave: (values: DetailsValues) => Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [hasTimeline, setHasTimeline] = useState(project.hasTimeline);
  const [hasTracker, setHasTracker] = useState(project.hasTracker);
  const [hasTeam, setHasTeam] = useState(project.hasTeam);
  const [pending, setPending] = useState(false);

  const noTool = !hasTimeline && !hasTracker && !hasTeam;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || noTool) return;
    setPending(true);
    await onSave({
      name: name.trim(),
      description: description.trim(),
      hasTimeline,
      hasTracker,
      hasTeam,
    });
    setPending(false);
  }

  return (
    <form className="flex flex-col gap-3.5" onSubmit={submit}>
      <Field label="Project name">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
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

      <fieldset className="flex flex-col gap-2 sm:flex-row">
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
        <ToolCheckbox
          checked={hasTeam}
          onChange={setHasTeam}
          label="Team"
          hint="People profiles and roster"
        />
      </fieldset>
      {noTool && (
        <p className="text-[0.6875rem] text-[#d03b3b]">Pick at least one.</p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || noTool || !name.trim()}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

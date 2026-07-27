"use client";

import { useMemo, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { useFeedback } from "@/components/Feedback";
import { PeopleSection } from "@/components/project/PeopleSection";
import { RolesSection } from "@/components/project/RolesSection";
import { SprintsSection } from "@/components/project/SprintsSection";
import { Field, ToolCheckbox } from "@/components/ui";
import { diffDays, formatDay } from "@/lib/dates";
import { Developer, STATUS_OPTIONS, TaskStatus } from "@/lib/types";

/**
 * The project card: everything about one project in one place — its details,
 * who is on it, when it runs, and which sprint it is in.
 */
type OpenableView = "timeline" | "tracker" | "wiki" | "team";

export function ProjectOverview({
  onOpenView,
  visibleViews,
  canEdit,
}: {
  onOpenView: (view: OpenableView) => void;
  /** What the current role is allowed to open from here. */
  visibleViews: OpenableView[];
  /** Only an admin changes the project's settings; everyone else reads them. */
  canEdit: boolean;
}) {
  const {
    activeProject,
    updateProject,
    deleteProject,
    projectTasks,
    developers,
    memberships,
    addMember,
    removeMember,
    setMemberRoles,
    rotateInvite,
    revokeInvite,
    sprints,
    sprint,
    projectLoading,
    createSprint,
    updateSprint,
    deleteSprint,
    createRole,
    updateRole,
    deleteRole,
  } = useBoard();
  const tasks = projectTasks;
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

  /**
   * Who is on this project: everyone given a role on it, plus anyone carrying
   * its work — being handed a task puts you on the project as surely as being
   * named does.
   *
   * Walking the roster (rather than the memberships) is what fixes the order in
   * place: the list reads the same however roles are edited, so ticking a role
   * never makes the rows swap places under the cursor.
   */
  const people = useMemo(() => {
    if (!activeProject) return [];
    const onProject = new Set(
      memberships
        .filter((m) => m.projectId === activeProject.id)
        .map((m) => m.developerId)
    );
    for (const t of tasks) if (t.developerId) onProject.add(t.developerId);

    const roster = developers.filter((d) => onProject.has(d.id));
    // Someone can carry a task without a profile in the roster we hold — take
    // the copy joined onto the task so they still appear.
    const known = new Set(roster.map((d) => d.id));
    const strays: Developer[] = [];
    for (const t of tasks) {
      if (t.developer && !known.has(t.developer.id)) {
        known.add(t.developer.id);
        strays.push(t.developer);
      }
    }
    return [...roster, ...strays];
  }, [activeProject, memberships, developers, tasks]);

  // Project-wide, whichever sprint the boards happen to be showing.
  const stats = useMemo(() => {
    const counts: Record<TaskStatus, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      IN_TEST: 0,
      ON_HOLD: 0,
      DONE: 0,
    };
    for (const task of tasks) counts[task.status]++;
    const total = tasks.length;
    return {
      total,
      counts,
      progress: total === 0 ? 0 : (counts.DONE / total) * 100,
    };
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
        {editing && canEdit ? (
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
            {canEdit && (
              <button onClick={() => setEditing(true)} className="btn-primary">
                Edit project
              </button>
            )}
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
            label="Sprints"
            value={projectLoading ? null : String(sprints.length)}
            hint={
              sprint
                ? `Sprint ${sprint.number} on show`
                : sprints.length > 0
                  ? "All archived"
                  : "None planned"
            }
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
            value={projectLoading ? null : span ? formatDay(span.start) : "—"}
            hint="Earliest task"
          />
          <Metric
            label="End date"
            value={projectLoading ? null : span ? formatDay(span.end) : "—"}
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

        <SprintsSection
          sprints={sprints}
          tasks={tasks}
          canEdit={canEdit}
          onCreate={createSprint}
          onUpdate={updateSprint}
          onDelete={deleteSprint}
        />

        <PeopleSection
          project={activeProject}
          people={people}
          developers={developers}
          memberships={memberships}
          tasks={tasks}
          loading={projectLoading}
          canEdit={canEdit}
          onAdd={addMember}
          onRemove={removeMember}
          onRolesChange={setMemberRoles}
          onRotateInvite={rotateInvite}
          onRevokeInvite={revokeInvite}
          onOpenTeam={
            visibleViews.includes("team") ? () => onOpenView("team") : undefined
          }
        />

        {canEdit ? (
          <RolesSection
            project={activeProject}
            onAdd={(name) => createRole(activeProject.id, name)}
            onToggle={(roleId, patch) =>
              updateRole(activeProject.id, roleId, patch)
            }
            onRename={(roleId, name) =>
              updateRole(activeProject.id, roleId, { name })
            }
            onRemove={(roleId) => deleteRole(activeProject.id, roleId)}
          />
        ) : null}

        {canEdit && (
          <div className="border-t border-[var(--hairline)] pt-4">
            <button onClick={remove} className="btn-secondary !text-[#d03b3b]">
              Delete project
            </button>
          </div>
        )}
      </div>
    </div>
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
  hasWiki: boolean;
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
  const [hasWiki, setHasWiki] = useState(project.hasWiki);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    await onSave({
      name: name.trim(),
      description: description.trim(),
      hasTimeline,
      hasTracker,
      hasWiki,
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
          checked={hasWiki}
          onChange={setHasWiki}
          label="Wiki"
          hint="Pages the project writes down for itself"
        />
      </fieldset>
      <p className="text-[0.6875rem] text-[var(--ink-muted)]">
        The team roster isn’t a tool to switch off — every project has people.
        Which roles may open it is in the table below.
      </p>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || !name.trim()}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

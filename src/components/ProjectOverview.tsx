"use client";

import { useMemo, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { useFeedback } from "@/components/Feedback";
import { PeopleSection } from "@/components/project/PeopleSection";
import { ProjectSettingsForm } from "@/components/project/ProjectSettingsForm";
import { RolesSection } from "@/components/project/RolesSection";
import { TagsSection } from "@/components/project/TagsSection";
import { SprintsSection } from "@/components/project/SprintsSection";
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
  startEditing = false,
  onEditingChange,
}: {
  onOpenView: (view: OpenableView) => void;
  /** What the current role is allowed to open from here. */
  visibleViews: OpenableView[];
  /** Only an admin changes the project's settings; everyone else reads them. */
  canEdit: boolean;
  /**
   * Open straight into the settings form. A project is created with a name and
   * nothing switched on, so what it is made of is the first thing it asks.
   */
  startEditing?: boolean;
  /** Told when the form is left, so the caller can stop asking for it. */
  onEditingChange?: (editing: boolean) => void;
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
    createTag,
    updateTag,
    deleteTag,
  } = useBoard();
  const tasks = projectTasks;
  const { confirm } = useFeedback();

  // Keyed on the project by its caller, so this starts fresh for each one:
  // switching projects closes a form left open on the last, and a project just
  // created opens straight into it.
  const [editing, setEditingState] = useState(startEditing);

  const setEditing = (next: boolean) => {
    setEditingState(next);
    onEditingChange?.(next);
  };

  /**
   * When the project runs. A project can say so itself — which is what a team
   * that doesn't plan in sprints needs — and otherwise the work says it: the
   * earliest task to the latest. Either end can be stated on its own, so a
   * project with a deadline and no start still gets the deadline it typed.
   */
  const span = useMemo(() => {
    let start: Date | null = null;
    let end: Date | null = null;
    for (const t of tasks) {
      const s = new Date(t.startDate);
      const e = new Date(t.endDate);
      if (!start || s < start) start = s;
      if (!end || e > end) end = e;
    }
    const statedStart = activeProject?.startDate
      ? new Date(activeProject.startDate)
      : null;
    const statedEnd = activeProject?.endDate
      ? new Date(activeProject.endDate)
      : null;
    start = statedStart ?? start;
    end = statedEnd ?? end;
    return {
      start,
      end,
      stated: { start: statedStart != null, end: statedEnd != null },
      days: start && end ? diffDays(start, end) + 1 : null,
    };
  }, [tasks, activeProject]);

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
    for (const t of tasks) for (const id of t.assigneeIds) onProject.add(id);

    const roster = developers.filter((d) => onProject.has(d.id));
    // Someone can carry a task without a profile in the roster we hold — take
    // the copy joined onto the task so they still appear.
    const known = new Set(roster.map((d) => d.id));
    const strays: Developer[] = [];
    for (const t of tasks) {
      for (const person of t.assignees) {
        if (known.has(person.id)) continue;
        known.add(person.id);
        strays.push(person);
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

  const unassigned = tasks.filter((t) => t.assigneeIds.length === 0).length;


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

  /**
   * Editing is a screen of its own, not a form wedged into the card.
   *
   * The two used to be shown together, which meant switching Sprints off at
   * the top while the sprints themselves sat a little further down, still
   * listed — a screen arguing with itself. Settings are now the only thing on
   * show while they are being changed, under a strip saying whose they are and
   * how to get back.
   */
  if (editing && canEdit) {
    return (
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <header className="flex items-center gap-3">
            <ProjectInitial name={activeProject.name} size="sm" />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight">
                Project settings
              </h2>
              <p className="truncate text-[0.75rem] text-[var(--ink-muted)]">
                {activeProject.name}
              </p>
            </div>
          </header>

          <ProjectSettingsForm
            key={activeProject.id}
            project={activeProject}
            tagEditor={
              <TagsSection
                project={activeProject}
                onAdd={(name, color) =>
                  createTag(activeProject.id, name, color)
                }
                onUpdate={(tagId, patch) =>
                  updateTag(activeProject.id, tagId, patch)
                }
                onRemove={(tagId) => deleteTag(activeProject.id, tagId)}
              />
            }
            onCancel={() => setEditing(false)}
            onSave={async (values) => {
              await updateProject(activeProject.id, values);
              setEditing(false);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-start gap-4">
          <ProjectInitial name={activeProject.name} />
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight">
              {activeProject.name}
              {activeProject.archived && (
                <span className="rounded-full bg-[var(--gridline)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--ink-secondary)]">
                  Archived
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-[0.875rem] text-[var(--ink-secondary)]">
              {activeProject.description || "No description yet."}
            </p>
          </div>
          {canEdit && (
            <button onClick={() => setEditing(true)} className="btn-primary">
              Project settings
            </button>
          )}
        </header>

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
          {activeProject.hasSprints && (
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
          )}
          <Metric
            label="Tasks"
            value={projectLoading ? null : String(stats.total)}
            hint={
              projectLoading ? undefined : `${stats.progress.toFixed(0)}% done`
            }
          />
          <Metric
            label="Start date"
            value={projectLoading ? null : span.start ? formatDay(span.start) : "—"}
            hint={span.stated.start ? "Set for the project" : "Earliest task"}
          />
          <Metric
            label="End date"
            value={projectLoading ? null : span.end ? formatDay(span.end) : "—"}
            hint={span.stated.end ? "Set for the project" : "Latest task"}
          />
          <Metric
            label="Duration"
            value={projectLoading ? null : span.days ? `${span.days} days` : "—"}
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

        {activeProject.hasSprints && (
          <SprintsSection
            sprints={sprints}
            tasks={tasks}
            canEdit={canEdit}
            onCreate={createSprint}
            onUpdate={updateSprint}
            onDelete={deleteSprint}
          />
        )}

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

        {canEdit && activeProject.hasRoles ? (
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
          <section className="flex flex-col gap-2.5 border-t border-[var(--hairline)] pt-4">
            <h3 className="text-[0.8125rem] font-semibold tracking-tight">
              Finishing with this project
            </h3>
            {/* Archiving is the reversible one, so it leads — and each button
                now says what it does before it is pressed, rather than leaving
                two bare verbs side by side and one of them final. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
              <div className="flex-1">
                <button
                  onClick={() =>
                    updateProject(activeProject.id, {
                      archived: !activeProject.archived,
                    })
                  }
                  className="btn-secondary"
                >
                  {activeProject.archived
                    ? "Restore project"
                    : "Archive project"}
                </button>
                <p className="mt-1.5 text-[0.6875rem] text-[var(--ink-muted)]">
                  {activeProject.archived
                    ? "Put it back among the projects being worked on."
                    : "Keeps everything and stays openable — it just leaves the run of projects being worked on."}
                </p>
              </div>
              <div className="flex-1">
                <button
                  onClick={remove}
                  className="btn-secondary !text-[var(--danger)]"
                >
                  Delete project
                </button>
                <p className="mt-1.5 text-[0.6875rem] text-[var(--ink-muted)]">
                  Its tasks, sprints and pages go with it. This cannot be
                  undone.
                </p>
              </div>
            </div>
          </section>
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

/** The project's letter, as its mark on the card and on its settings. */
function ProjectInitial({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-[var(--radius)] font-semibold text-white uppercase ${
        size === "sm" ? "h-9 w-9 text-base" : "h-12 w-12 text-lg"
      }`}
      style={{ background: "var(--accent)" }}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  );
}

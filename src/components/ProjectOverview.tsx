"use client";

import { useMemo, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { useFeedback } from "@/components/Feedback";
import { InviteRow } from "@/components/InviteRow";
import {
  Avatar,
  CloseIcon,
  Field,
  LazySelect,
  RoleChips,
  ToolCheckbox,
} from "@/components/ui";
import {
  addDays,
  diffDays,
  formatDay,
  formatRange,
  toISODate,
} from "@/lib/dates";
import {
  Developer,
  Membership,
  Project,
  ProjectRole,
  ROLE_VIEWS,
  Sprint,
  STATUS_OPTIONS,
  TaskStatus,
} from "@/lib/types";

/**
 * The project card: everything about one project in one place — its details,
 * who is on it, when it runs, and which sprint it is in.
 */
type OpenableView = "timeline" | "tracker" | "team";

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
            hint={sprint ? `Sprint ${sprint.number} on show` : "None planned"}
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
            onRemove={(roleId) => deleteRole(activeProject.id, roleId)}
          />
        ) : null}

        <section>
          <h3 className="mb-2 text-[0.8125rem] font-semibold tracking-tight">
            Tools
          </h3>
          <div className="flex flex-wrap gap-2">
            {visibleViews.includes("timeline") && (
              <button
                onClick={() => onOpenView("timeline")}
                className="btn-secondary"
              >
                Open Timeline
              </button>
            )}
            {visibleViews.includes("tracker") && (
              <button
                onClick={() => onOpenView("tracker")}
                className="btn-secondary"
              >
                Open Tracker
              </button>
            )}
            {!visibleViews.includes("timeline") &&
              !visibleViews.includes("tracker") && (
                <p className="text-[0.8125rem] text-[var(--ink-muted)]">
                  {canEdit
                    ? "No board enabled — turn one on in Edit project."
                    : "This role has no board on this project."}
                </p>
              )}
          </div>
        </section>

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

/**
 * The people on this project. Anyone already in the workspace can be put on it
 * and given one of its roles; being handed a task puts them here too, which is
 * why someone can appear without a role.
 */
function PeopleSection({
  project,
  people,
  developers,
  memberships,
  tasks,
  loading,
  canEdit,
  onAdd,
  onRemove,
  onRolesChange,
  onRotateInvite,
  onRevokeInvite,
  onOpenTeam,
}: {
  project: Project;
  people: Developer[];
  developers: Developer[];
  memberships: Membership[];
  tasks: { developerId: string | null; status: string }[];
  loading: boolean;
  canEdit: boolean;
  onAdd: (projectId: string, developerId: string) => Promise<void>;
  onRemove: (projectId: string, developerId: string) => Promise<void>;
  onRolesChange: (
    projectId: string,
    developerId: string,
    roleIds: string[]
  ) => Promise<void>;
  onRotateInvite: (projectId: string, developerId: string) => Promise<void>;
  onRevokeInvite: (projectId: string, developerId: string) => Promise<void>;
  onOpenTeam?: () => void;
}) {
  const { confirm } = useFeedback();
  const [adding, setAdding] = useState("");

  const membershipOf = (developerId: string) =>
    memberships.find(
      (m) => m.projectId === project.id && m.developerId === developerId
    );


  const onProject = new Set(people.map((p) => p.id));
  const available = developers.filter((d) => d.active && !onProject.has(d.id));

  async function remove(person: Developer) {
    const open = tasks.filter(
      (t) => t.developerId === person.id && t.status !== "DONE"
    ).length;
    const ok = await confirm({
      title: `Take ${person.name} off ${project.name}?`,
      body: open
        ? `Their ${open} open task${open === 1 ? "" : "s"} stay where they are — reassign them first if they shouldn't.`
        : "They keep their profile and their work elsewhere.",
      confirmLabel: "Take off project",
      destructive: true,
    });
    if (ok) await onRemove(project.id, person.id);
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h3 className="text-[0.8125rem] font-semibold tracking-tight">
          People
          {!loading && (
            <span className="ml-2 font-normal text-[var(--ink-muted)]">
              {people.length}
            </span>
          )}
        </h3>
        <p className="text-[0.75rem] text-[var(--ink-muted)]">
          Who works on this project, and in which of its roles.
        </p>
      </div>

      {loading ? (
        <p className="text-[0.8125rem] text-[var(--ink-muted)]">Loading…</p>
      ) : people.length === 0 ? (
        <p className="text-[0.8125rem] text-[var(--ink-muted)]">
          Nobody on this project yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {people.map((person) => {
            const open = tasks.filter(
              (t) => t.developerId === person.id && t.status !== "DONE"
            ).length;
            const membership = membershipOf(person.id);
            const held = membership?.roleIds ?? [];
            return (
              <li
                key={person.id}
                className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--hairline)] px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Avatar person={person} size={24} />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                    {person.name}
                    {person.role && (
                      <span className="ml-2 text-[0.6875rem] text-[var(--ink-muted)]">
                        {person.role}
                      </span>
                    )}
                  </span>
                  <span className="text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
                    {open} open
                  </span>

                  <RoleChips
                    roles={project.roles}
                    held={held}
                    editable={canEdit}
                    label={`${person.name} on ${project.name}`}
                    onToggle={(roleId, on) =>
                      onRolesChange(
                        project.id,
                        person.id,
                        on ? [...held, roleId] : held.filter((r) => r !== roleId)
                      )
                    }
                  />

                  {canEdit && (
                    <button
                      onClick={() => remove(person)}
                      className="rounded p-1 text-[var(--ink-muted)] transition hover:text-[#d03b3b]"
                      aria-label={`Take ${person.name} off this project`}
                      title="Take off project"
                    >
                      <CloseIcon />
                    </button>
                  )}
                </div>

                {/* Inviting somebody is this card's business, and it waits for
                    a role: the link is only worth sending once it opens
                    something. Carrying a task isn't being put on the project,
                    so those rows have no link either. */}
                {canEdit &&
                  membership &&
                  (held.length > 0 || membership.hasLogin ? (
                    <InviteRow
                      person={person}
                      invite={membership.invite}
                      hasLogin={membership.hasLogin}
                      onRotate={() => onRotateInvite(project.id, person.id)}
                      onRevoke={() => onRevokeInvite(project.id, person.id)}
                    />
                  ) : (
                    <p className="border-t border-[var(--hairline)] pt-2 text-[0.75rem] text-[var(--ink-muted)]">
                      Give them a role to invite them to this project.
                    </p>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <LazySelect
            value={adding}
            onChange={async (developerId) => {
              if (!developerId) return;
              setAdding("");
              await onAdd(project.id, developerId);
            }}
            options={[
              {
                value: "",
                label: available.length
                  ? "Add someone from the team…"
                  : "Everyone is already on this project",
              },
              ...available.map((d) => ({ value: d.id, label: d.name })),
            ]}
            className="select w-60"
            ariaLabel="Add someone to this project"
          />
          {onOpenTeam && (
            <button onClick={onOpenTeam} className="btn-secondary">
              Open Team
            </button>
          )}
        </div>
      )}

      {!canEdit && onOpenTeam && (
        <button onClick={onOpenTeam} className="btn-secondary self-start">
          Open Team
        </button>
      )}
    </section>
  );
}

/**
 * Who sees what. The checkboxes are the whole point of a role, so they sit in
 * a grid: one row per role, one column per tool.
 */
function RolesSection({
  project,
  onAdd,
  onToggle,
  onRemove,
}: {
  project: Project;
  onAdd: (name: string) => Promise<ProjectRole | null>;
  onToggle: (roleId: string, patch: Record<string, boolean>) => Promise<void>;
  onRemove: (roleId: string) => Promise<void>;
}) {
  const { confirm } = useFeedback();
  const [adding, setAdding] = useState("");
  const [pending, setPending] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = adding.trim();
    if (!name) return;
    setPending(true);
    const created = await onAdd(name);
    setPending(false);
    if (created) setAdding("");
  }

  async function remove(role: ProjectRole) {
    const ok = await confirm({
      title: `Remove the “${role.name}” role?`,
      body: "People on this project stop being described by it. Nothing else is deleted.",
      confirmLabel: "Remove role",
      destructive: true,
    });
    if (ok) await onRemove(role.id);
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h3 className="text-[0.8125rem] font-semibold tracking-tight">Roles</h3>
        <p className="text-[0.75rem] text-[var(--ink-muted)]">
          Admins choose which of this project’s tools each role can open.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-[0.8125rem]">
          <thead>
            <tr>
              <th className="w-full pb-1.5 text-left">
                <span className="field-label">Role</span>
              </th>
              {ROLE_VIEWS.map((view) => (
                <th key={view.key} className="px-3 pb-1.5">
                  <span className="field-label">{view.label}</span>
                </th>
              ))}
              <th className="pb-1.5" />
            </tr>
          </thead>
          <tbody>
            {project.roles.map((role) => (
              <tr
                key={role.id}
                className="border-t border-[var(--hairline)] align-middle"
              >
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{role.name}</span>
                    {role.isAdmin && (
                      <span className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.5625rem] uppercase tracking-wide text-[var(--accent)]">
                        Admin
                      </span>
                    )}
                  </span>
                </td>
                {ROLE_VIEWS.map((view) => {
                  const enabled = project[view.tool];
                  return (
                    <td key={view.key} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={role.isAdmin ? true : role[view.key]}
                        disabled={role.isAdmin || !enabled}
                        onChange={(e) =>
                          onToggle(role.id, { [view.key]: e.target.checked })
                        }
                        className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`${role.name} can see ${view.label}`}
                        title={
                          role.isAdmin
                            ? "Admins always see everything"
                            : enabled
                              ? undefined
                              : `${view.label} is turned off for this project`
                        }
                      />
                    </td>
                  );
                })}
                <td className="py-2 pl-2 text-right">
                  {!role.isAdmin && (
                    <button
                      onClick={() => remove(role)}
                      className="rounded p-1 text-[var(--ink-muted)] transition hover:text-[#d03b3b]"
                      aria-label={`Remove the ${role.name} role`}
                      title="Remove role"
                    >
                      <CloseIcon />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="flex items-center gap-2" onSubmit={add}>
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          className="input w-48"
          placeholder="e.g. designer"
          aria-label="New role name"
        />
        <button
          type="submit"
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || !adding.trim()}
        >
          {pending ? "Adding…" : "Add role"}
        </button>
      </form>
      <p className="text-[0.6875rem] text-[var(--ink-muted)]">
        A new role starts with nothing visible — tick what it should see.
      </p>
    </section>
  );
}

/**
 * The project's sprints, in order. Each is its own board, so planning one ahead
 * gives an empty board waiting for the work that will go in it.
 */
function SprintsSection({
  sprints,
  tasks,
  canEdit,
  onCreate,
  onUpdate,
  onDelete,
}: {
  sprints: Sprint[];
  tasks: { sprintId: string | null }[];
  canEdit: boolean;
  onCreate: (input: {
    number?: number;
    startDate: string;
    endDate: string;
  }) => Promise<Sprint | null>;
  onUpdate: (id: string, patch: SprintPatch) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const { confirm } = useFeedback();
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      if (!task.sprintId) continue;
      map.set(task.sprintId, (map.get(task.sprintId) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const unplanned = tasks.filter((t) => !t.sprintId).length;

  // A new sprint follows the last one: the next number, the fortnight after.
  const last = sprints[sprints.length - 1];
  const suggested = {
    number: (last?.number ?? 0) + 1,
    startDate: last
      ? toISODate(addDays(new Date(last.endDate), 1))
      : toISODate(new Date()),
    endDate: last
      ? toISODate(addDays(new Date(last.endDate), 14))
      : toISODate(addDays(new Date(), 13)),
  };

  async function remove(sprint: Sprint) {
    const held = counts.get(sprint.id) ?? 0;
    const ok = await confirm({
      title: `Delete sprint ${sprint.number}?`,
      body: held
        ? `Its ${held} task${held === 1 ? "" : "s"} won't be deleted — they become unplanned, and you can move them into another sprint.`
        : "This sprint has no tasks in it.",
      confirmLabel: "Delete sprint",
      destructive: true,
    });
    if (ok) await onDelete(sprint.id);
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-[0.8125rem] font-semibold tracking-tight">
            Sprints
          </h3>
          <p className="text-[0.75rem] text-[var(--ink-muted)]">
            Each sprint is its own board. Plan them ahead; the timeline and
            tracker switch between them.
          </p>
        </div>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary">
            Plan a sprint
          </button>
        )}
      </div>

      {sprints.length === 0 && !adding && (
        <p className="text-[0.8125rem] text-[var(--ink-muted)]">
          No sprints yet.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {sprints.map((sprint) => (
          <SprintRow
            key={sprint.id}
            sprint={sprint}
            taskCount={counts.get(sprint.id) ?? 0}
            canEdit={canEdit}
            onUpdate={onUpdate}
            onDelete={() => remove(sprint)}
          />
        ))}
      </ul>

      {adding && (
        <SprintForm
          initial={suggested}
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            const created = await onCreate(values);
            if (created) setAdding(false);
          }}
        />
      )}

      {unplanned > 0 && (
        <p className="text-[0.75rem] text-[var(--ink-muted)]">
          {unplanned} task{unplanned === 1 ? "" : "s"} not in any sprint — the
          boards list them under “Unplanned”.
        </p>
      )}
    </section>
  );
}

function SprintRow({
  sprint,
  taskCount,
  canEdit,
  onUpdate,
  onDelete,
}: {
  sprint: Sprint;
  taskCount: number;
  canEdit: boolean;
  onUpdate: (id: string, patch: SprintPatch) => void;
  onDelete: () => void;
}) {
  const today = toISODate(new Date());
  const running =
    toISODate(new Date(sprint.startDate)) <= today &&
    toISODate(new Date(sprint.endDate)) >= today;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border border-[var(--hairline)] px-3 py-2">
      <span className="flex items-center gap-2">
        <span className="text-[0.8125rem] font-medium">
          Sprint {sprint.number}
        </span>
        {running && (
          <span className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.5625rem] uppercase tracking-wide text-[var(--accent)]">
            Running
          </span>
        )}
      </span>

      {canEdit ? (
        <span className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={toISODate(new Date(sprint.startDate))}
            onChange={(e) => onUpdate(sprint.id, { startDate: e.target.value })}
            className="input w-[9.5rem]"
            aria-label={`Sprint ${sprint.number} starts`}
          />
          <input
            type="date"
            value={toISODate(new Date(sprint.endDate))}
            onChange={(e) => onUpdate(sprint.id, { endDate: e.target.value })}
            className="input w-[9.5rem]"
            aria-label={`Sprint ${sprint.number} ends`}
          />
        </span>
      ) : (
        <span className="text-[0.8125rem] text-[var(--ink-secondary)]">
          {formatRange(sprint.startDate, sprint.endDate)}
        </span>
      )}

      <span className="ml-auto text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
        {taskCount} task{taskCount === 1 ? "" : "s"}
      </span>

      {canEdit && (
        <button
          onClick={onDelete}
          className="rounded p-1 text-[var(--ink-muted)] transition hover:text-[#d03b3b]"
          aria-label={`Delete sprint ${sprint.number}`}
          title="Delete sprint"
        >
          <CloseIcon />
        </button>
      )}
    </li>
  );
}

function SprintForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: { number: number; startDate: string; endDate: string };
  onCancel: () => void;
  onSubmit: (values: {
    number: number;
    startDate: string;
    endDate: string;
  }) => Promise<void>;
}) {
  const [number, setNumber] = useState(String(initial.number));
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [pending, setPending] = useState(false);

  const valid =
    Number(number) >= 1 && startDate !== "" && endDate !== "" && endDate >= startDate;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setPending(true);
    await onSubmit({ number: Math.floor(Number(number)), startDate, endDate });
    setPending(false);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-[var(--radius)] border border-[var(--accent)] bg-[var(--accent-wash)] p-3"
    >
      <Field label="Number" className="w-24">
        <input
          type="number"
          min={1}
          step={1}
          autoFocus
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Starts" className="w-[9.5rem]">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Ends" className="w-[9.5rem]">
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="input"
        />
      </Field>
      <div className="flex items-center gap-2 pb-0.5">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || !valid}
        >
          {pending ? "Planning…" : "Plan sprint"}
        </button>
      </div>
      {endDate < startDate && (
        <p className="w-full text-[0.6875rem] text-[#d03b3b]">
          A sprint can’t end before it starts.
        </p>
      )}
    </form>
  );
}

interface SprintPatch {
  number?: number;
  startDate?: string;
  endDate?: string;
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

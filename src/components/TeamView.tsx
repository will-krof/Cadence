"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { Avatar, Field, LazySelect } from "@/components/ui";
import { useFeedback } from "@/components/Feedback";
import {
  CURRENCIES,
  Developer,
  DeveloperInput,
  DEVELOPER_PALETTE,
  EMPLOYMENT_TYPES,
  EmploymentType,
  statusMeta,
  Assignment,
  DeveloperTask,
  Project,
  ProjectRole,
} from "@/lib/types";
import { toISODate } from "@/lib/dates";

/** Avatars are stored inline in the row, so downscale before upload. */
const AVATAR_SIZE = 256;

async function fileToAvatar(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read that image"));
    el.src = dataUrl;
  });

  // Square centre-crop, then re-encode as JPEG to keep the payload small.
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(
    img,
    (img.width - side) / 2,
    (img.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE
  );
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function TeamView() {
  const {
    developers,
    projects,
    memberships,
    setMemberRole,
    removeMember,
    createDeveloper,
    updateDeveloper,
    setDeveloperActive,
    deleteDeveloper,
  } = useBoard();
  const { confirm } = useFeedback();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Who works on what lives in the tasks, which span every project — the board
  // itself only holds the active one.
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tasks?scope=all");
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (!cancelled) setAssignments(data);
      } catch {
        if (!cancelled) setAssignments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [developers.length]);

  /** Index for "what role does this person hold on that project". */
  const roleFor = useCallback(
    (projectId: string, developerId: string) =>
      memberships.find(
        (m) => m.projectId === projectId && m.developerId === developerId
      )?.roleId ?? null,
    [memberships]
  );

  /** An empty pick means "not on this project" rather than "no role yet". */
  const chooseRole = useCallback(
    (projectId: string, developerId: string, roleId: string | null) =>
      roleId
        ? setMemberRole(projectId, developerId, roleId)
        : removeMember(projectId, developerId),
    [setMemberRole, removeMember]
  );

  const selected = useMemo(
    () => developers.find((d) => d.id === selectedId) ?? null,
    [developers, selectedId]
  );

  const active = useMemo(() => developers.filter((d) => d.active), [developers]);
  const archived = useMemo(
    () => developers.filter((d) => !d.active),
    [developers]
  );

  /** Active people bucketed by the projects they have tasks in. */
  const groups = useMemo(() => {
    const byProject = new Map<string, Set<string>>();
    const add = (projectId: string, developerId: string) => {
      const set = byProject.get(projectId) ?? new Set<string>();
      set.add(developerId);
      byProject.set(projectId, set);
    };
    for (const { developerId, projectId } of assignments ?? []) {
      add(projectId, developerId);
    }
    // Being given a role puts someone on the project, tasks or not.
    for (const { developerId, projectId } of memberships) {
      add(projectId, developerId);
    }

    const assignedAnywhere = new Set<string>();
    for (const set of byProject.values()) {
      for (const id of set) assignedAnywhere.add(id);
    }

    const result = projects
      .filter((project) => project.hasTeam)
      .map((project) => ({
        id: project.id,
        name: project.name,
        roles: project.roles,
        people: active.filter((d) => byProject.get(project.id)?.has(d.id)),
      }))
      .filter((g) => g.people.length > 0);

    const unassigned = active.filter((d) => !assignedAnywhere.has(d.id));
    if (unassigned.length) {
      result.push({
        id: "__none__",
        name: "No project yet",
        roles: [],
        people: unassigned,
      });
    }
    return result;
  }, [assignments, memberships, projects, active]);

  const showingDetail = creating || selected != null;
  const editing = creating || (selected != null && editingId === selected.id);

  async function removePerson(person: Developer) {
    const ok = await confirm({
      title: `Delete ${person.name}?`,
      body: "This erases their profile for good. Archive them instead if you only want them out of the way.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await deleteDeveloper(person.id);
    setSelectedId(null);
    setEditingId(null);
  }

  function openPerson(id: string) {
    setCreating(false);
    setEditingId(null);
    setSelectedId(id);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        className={`thin-scroll flex flex-col gap-4 overflow-y-auto border-b border-[var(--hairline)] p-4 lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-5 ${
          showingDetail ? "hidden lg:flex" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[0.8125rem] font-semibold tracking-tight">
            Team
            <span className="ml-2 font-normal text-[var(--ink-muted)]">
              {active.length}
            </span>
          </h2>
          <button
            onClick={() => {
              setSelectedId(null);
              setEditingId(null);
              setCreating(true);
            }}
            className="btn-primary"
          >
            Add person
          </button>
        </div>

        {developers.length === 0 && (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">
            No one on the team yet.
          </p>
        )}

        {groups.map((group) => (
          <section key={group.id} className="flex flex-col gap-1.5">
            <h3 className="field-label">{group.name}</h3>
            {group.people.map((d) => (
              <PersonRow
                key={d.id}
                person={d}
                role={
                  group.roles.find((r) => r.id === roleFor(group.id, d.id))
                    ?.name ?? null
                }
                selected={d.id === selectedId}
                onClick={() => openPerson(d.id)}
              />
            ))}
          </section>
        ))}

        {archived.length > 0 && (
          <section className="flex flex-col gap-1.5 border-t border-[var(--hairline)] pt-3">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="flex items-center gap-1.5 text-left"
              aria-expanded={showArchived}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                className={`shrink-0 text-[var(--ink-muted)] transition-transform ${
                  showArchived ? "rotate-90" : ""
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
              <span className="field-label">Archived</span>
              <span className="text-[0.6875rem] text-[var(--ink-muted)]">
                {archived.length}
              </span>
            </button>
            {showArchived &&
              archived.map((d) => (
                <PersonRow
                  key={d.id}
                  person={d}
                  role={null}
                  selected={d.id === selectedId}
                  onClick={() => openPerson(d.id)}
                />
              ))}
          </section>
        )}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {editing ? (
          <ProfileForm
            key={selected?.id ?? "new"}
            person={selected ?? undefined}
            existingCount={developers.length}
            onCancel={() => {
              setCreating(false);
              setEditingId(null);
              if (creating) setSelectedId(null);
            }}
            onSave={async (values) => {
              if (selected) {
                await updateDeveloper(selected.id, values);
                setEditingId(null);
              } else {
                const created = await createDeveloper(values);
                if (created) {
                  setCreating(false);
                  setSelectedId(created.id);
                }
              }
            }}
            onDelete={selected ? () => removePerson(selected) : undefined}
          />
        ) : selected ? (
          <ProfileCard
            key={selected.id}
            person={selected}
            projects={projects.filter((p) => p.hasTeam)}
            roleFor={roleFor}
            onRoleChange={chooseRole}
            onEdit={() => setEditingId(selected.id)}
            onBack={() => setSelectedId(null)}
            onDelete={() => removePerson(selected)}
            onToggleArchive={() =>
              setDeveloperActive(selected.id, !selected.active)
            }
          />
        ) : (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">
            Select someone to see their profile, or add a new person.
          </p>
        )}
      </div>
    </div>
  );
}

function PersonRow({
  person,
  role,
  selected,
  onClick,
}: {
  person: Developer;
  role: string | null;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-[var(--radius)] border p-2.5 text-left transition ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent-wash)]"
          : "border-[var(--hairline)] hover:bg-[var(--plane)]"
      } ${person.active ? "" : "opacity-60"}`}
    >
      <Avatar person={person} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[0.8125rem] font-medium">
            {person.name}
          </span>
          {!person.active && (
            <span className="shrink-0 rounded-full bg-[var(--gridline)] px-1.5 py-0.5 text-[0.5625rem] uppercase tracking-wide text-[var(--ink-secondary)]">
              Archived
            </span>
          )}
        </span>
        <span className="block truncate text-[0.75rem] text-[var(--ink-muted)]">
          {person.role || person.email || "—"}
        </span>
        {role && (
          <span className="mt-0.5 inline-block rounded-full bg-[var(--accent-wash)] px-1.5 py-0.5 text-[0.5625rem] uppercase tracking-wide text-[var(--accent)]">
            {role}
          </span>
        )}
      </span>
    </button>
  );
}

function ProfileCard({
  person,
  projects,
  roleFor,
  onRoleChange,
  onEdit,
  onBack,
  onDelete,
  onToggleArchive,
}: {
  person: Developer;
  projects: Project[];
  roleFor: (projectId: string, developerId: string) => string | null;
  onRoleChange: (
    projectId: string,
    developerId: string,
    roleId: string | null
  ) => void;
  onEdit: () => void;
  onBack: () => void;
  onDelete: () => void;
  onToggleArchive: () => void;
}) {
  const [tasks, setTasks] = useState<DeveloperTask[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/developers/${person.id}/tasks`);
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (!cancelled) setTasks(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [person.id]);

  const openCount = tasks?.filter((t) => t.status !== "DONE").length ?? 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex flex-wrap items-start gap-4">
        <Avatar person={person} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{person.name}</h2>
            {!person.active && (
              <span className="rounded-full bg-[var(--gridline)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--ink-secondary)]">
                Archived
              </span>
            )}
          </div>
          {person.role && (
            <p className="mt-0.5 text-[0.875rem] text-[var(--ink-secondary)]">
              {person.role}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className="btn-secondary lg:hidden">
            Back
          </button>
          <button onClick={onEdit} className="btn-primary">
            Edit profile
          </button>
        </div>
      </header>

      <section className="grid gap-x-6 gap-y-4 rounded-[var(--radius-lg)] border border-[var(--hairline)] p-4 sm:grid-cols-2">
        <Detail label="Email" value={person.email} href={person.email ? `mailto:${person.email}` : undefined} />
        <Detail label="Phone" value={person.phone} href={person.phone ? `tel:${person.phone}` : undefined} />
        <Detail
          label="Started"
          value={person.startDate ? toISODate(new Date(person.startDate)) : null}
        />
        <Detail
          label="Employment"
          value={
            EMPLOYMENT_TYPES.find((t) => t.value === person.employmentType)
              ?.label ?? null
          }
        />
        <Detail
          label="Salary"
          value={
            person.salary != null
              ? `${person.salary.toLocaleString()} ${person.currency}`
              : null
          }
        />
        <Detail label="Open tasks" value={tasks ? String(openCount) : null} />
      </section>

      {person.notes && (
        <section>
          <h3 className="field-label mb-1.5">Notes</h3>
          <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
            {person.notes}
          </p>
        </section>
      )}

      <section>
        <h3 className="text-[0.8125rem] font-semibold tracking-tight">
          Project roles
        </h3>
        <p className="mb-2 text-[0.75rem] text-[var(--ink-muted)]">
          Each project has its own roles, and what a role sees is set on that
          project’s card.
        </p>

        {projects.length === 0 ? (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">
            No projects with a team yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {projects.map((project) => {
              // A role deleted from the project leaves the person on it with
              // nothing held; fall back rather than showing a stale id.
              const held = roleFor(project.id, person.id);
              const current = project.roles.some((r) => r.id === held)
                ? held ?? ""
                : "";
              return (
              <li
                key={project.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--radius)] border border-[var(--hairline)] px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                  {project.name}
                </span>
                <LazySelect
                  value={current}
                  onChange={(roleId) =>
                    onRoleChange(project.id, person.id, roleId || null)
                  }
                  options={[
                    { value: "", label: "Not on this project" },
                    ...project.roles.map((role: ProjectRole) => ({
                      value: role.id,
                      label: role.name,
                    })),
                  ]}
                  className="select w-44"
                  ariaLabel={`${person.name}’s role on ${project.name}`}
                />
              </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[0.8125rem] font-semibold tracking-tight">
          Assigned tasks
          {tasks && (
            <span className="ml-2 font-normal text-[var(--ink-muted)]">
              {tasks.length}
            </span>
          )}
        </h3>

        {failed && (
          <p className="text-[0.8125rem] text-[#d03b3b]">
            Could not load their tasks.
          </p>
        )}
        {!failed && tasks === null && (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">Loading…</p>
        )}
        {tasks?.length === 0 && (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">
            Nothing assigned right now.
          </p>
        )}

        <ul className="flex flex-col gap-1.5">
          {tasks?.map((task) => {
            const meta = statusMeta(task.status);
            return (
              <li
                key={task.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius)] border border-[var(--hairline)] px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                  {task.title}
                </span>
                <span className="shrink-0 rounded-full bg-[var(--plane)] px-2 py-0.5 text-[0.6875rem] text-[var(--ink-secondary)]">
                  {task.project.name}
                </span>
                <span
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                  style={{
                    background: `color-mix(in srgb, ${meta.color} 14%, var(--surface-raised))`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: meta.color }}
                  />
                  {meta.label}
                </span>
                <span className="shrink-0 text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
                  {toISODate(new Date(task.endDate))}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-4">
        <button onClick={onToggleArchive} className="btn-secondary">
          {person.active ? "Archive" : "Restore to team"}
        </button>
        <button onClick={onDelete} className="btn-secondary !text-[#d03b3b]">
          Delete permanently
        </button>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string;
}) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <p className="mt-0.5 text-[0.8125rem]">
        {value ? (
          href ? (
            <a href={href} className="text-[var(--accent)] hover:underline">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-[var(--ink-muted)]">—</span>
        )}
      </p>
    </div>
  );
}

function ProfileForm({
  person,
  existingCount,
  onSave,
  onCancel,
  onDelete,
}: {
  person?: Developer;
  existingCount: number;
  onSave: (values: Partial<DeveloperInput>) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState(person?.role ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [avatar, setAvatar] = useState<string | null>(person?.avatar ?? null);
  const [startDate, setStartDate] = useState(
    person?.startDate ? toISODate(new Date(person.startDate)) : ""
  );
  const [salary, setSalary] = useState(
    person?.salary != null ? String(person.salary) : ""
  );
  const [currency, setCurrency] = useState(person?.currency ?? "USD");
  const [employmentType, setEmploymentType] = useState<EmploymentType | "">(
    person?.employmentType ?? "FULL_TIME"
  );
  const [active, setActive] = useState(person?.active ?? true);
  const [notes, setNotes] = useState(person?.notes ?? "");
  const [color, setColor] = useState(
    person?.color ?? DEVELOPER_PALETTE[existingCount % DEVELOPER_PALETTE.length]
  );

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function pickAvatar(file: File) {
    setError(null);
    try {
      setAvatar(await fileToAvatar(file));
    } catch {
      setError("Could not read that image.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        role,
        email,
        phone,
        avatar,
        startDate: startDate || null,
        salary: salary === "" ? null : Number(salary),
        currency,
        employmentType: employmentType || null,
        active,
        notes,
        color,
      });
    } catch {
      setError("Could not save. Try again.");
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar person={{ name: name || "?", avatar, color }} size={64} />
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn-secondary"
            >
              {avatar ? "Change photo" : "Upload photo"}
            </button>
            {avatar && (
              <button
                type="button"
                onClick={() => setAvatar(null)}
                className="btn-secondary"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[0.6875rem] text-[var(--ink-muted)]">
            Square crop, resized to {AVATAR_SIZE}px.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) pickAvatar(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <section className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Full name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Alex Ivanenko"
          />
        </Field>
        <Field label="Job title">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input"
            placeholder="Backend engineer"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="alex@company.com"
          />
        </Field>
        <Field label="Phone">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input"
            placeholder="+380 …"
          />
        </Field>
      </section>

      <section className="grid gap-3.5 sm:grid-cols-2">
        <Field label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Employment">
          <select
            value={employmentType}
            onChange={(e) =>
              setEmploymentType(e.target.value as EmploymentType | "")
            }
            className="select"
          >
            <option value="">Not set</option>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Salary">
          <input
            type="number"
            min="0"
            step="1"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            className="input"
            placeholder="4000"
          />
        </Field>
        <Field label="Currency">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="select"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <Field label="Timeline colour">
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
                  ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--surface)]"
                  : "hover:scale-110"
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>

      <Field label="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input min-h-20 resize-y"
          placeholder="Anything worth remembering…"
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-[0.8125rem] text-[var(--ink-secondary)]">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
        />
        Currently working
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-[#d03b3b]/30 bg-[#d03b3b]/10 px-3 py-2 text-[0.75rem] text-[#d03b3b]"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-[var(--hairline)] pt-4">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="btn-secondary mr-auto !text-[#d03b3b]"
          >
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className={`btn-secondary ${onDelete ? "" : "ml-auto"}`}
        >
          Close
        </button>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : person ? "Save changes" : "Add person"}
        </button>
      </div>
    </form>
  );
}

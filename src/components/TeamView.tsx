"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { Avatar, Field, RoleChips } from "@/components/ui";
import { useFeedback } from "@/components/Feedback";
import {
  CURRENCIES,
  Membership,
  Developer,
  DeveloperInput,
  DEVELOPER_PALETTE,
  EMPLOYMENT_TYPES,
  EmploymentType,
  statusMeta,
  DeveloperTask,
  Project,
} from "@/lib/types";
import { formatDay, toISODate } from "@/lib/dates";

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
    setMemberRoles,
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
  const teamProjects = useMemo(
    () => projects.filter((p) => p.hasTeam),
    [projects]
  );

  /**
   * Writes what the form staged: only the projects whose answer changed, so
   * saving a profile doesn't churn every membership the person has.
   */
  const applyPlaces = useCallback(
    async (developerId: string, places: Map<string, string[]>) => {
      const before = new Map<string, string[]>();
      for (const m of memberships) {
        if (m.developerId === developerId) before.set(m.projectId, m.roleIds);
      }

      const same = (a: string[] = [], b: string[] = []) =>
        a.length === b.length && a.every((id) => b.includes(id));

      const work: Promise<void>[] = [];
      for (const project of teamProjects) {
        const was = before.has(project.id);
        const now = places.has(project.id);
        if (!was && !now) continue;
        if (was && !now) {
          work.push(removeMember(project.id, developerId));
        } else if (!same(before.get(project.id), places.get(project.id))) {
          work.push(
            setMemberRoles(project.id, developerId, places.get(project.id) ?? [])
          );
        }
      }
      await Promise.all(work);
    },
    [memberships, teamProjects, removeMember, setMemberRoles]
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

        <section className="flex flex-col gap-1.5">
          {active.map((d) => (
            <PersonRow
              key={d.id}
              person={d}
              projectCount={
                memberships.filter((m) => m.developerId === d.id).length
              }
              selected={d.id === selectedId}
              onClick={() => openPerson(d.id)}
            />
          ))}
        </section>

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
                  projectCount={
                    memberships.filter((m) => m.developerId === d.id).length
                  }
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
            projects={teamProjects}
            memberships={memberships}
            onCancel={() => {
              setCreating(false);
              setEditingId(null);
              if (creating) setSelectedId(null);
            }}
            onSave={async (values, places) => {
              if (selected) {
                await updateDeveloper(selected.id, values);
                await applyPlaces(selected.id, places);
                setEditingId(null);
              } else {
                const created = await createDeveloper(values);
                if (created) {
                  await applyPlaces(created.id, places);
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
            projects={teamProjects}
            memberships={memberships}
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
  projectCount,
  selected,
  onClick,
}: {
  person: Developer;
  projectCount: number;
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
        {projectCount > 0 && (
          <span className="block text-[0.6875rem] text-[var(--ink-muted)]">
            {projectCount} project{projectCount === 1 ? "" : "s"}
          </span>
        )}
      </span>
    </button>
  );
}

function ProfileCard({
  person,
  projects,
  memberships,
  onEdit,
  onBack,
  onDelete,
  onToggleArchive,
}: {
  person: Developer;
  projects: Project[];
  memberships: Membership[];
  onEdit: () => void;
  onBack: () => void;
  onDelete: () => void;
  onToggleArchive: () => void;
}) {
  const [tasks, setTasks] = useState<DeveloperTask[] | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * Where this person works: the projects they were put on, plus any they
   * carry tasks for. Holding no role is still being on a project, so
   * membership decides the first list, not whether a role happens to be set.
   */
  const onProjects = useMemo(() => {
    const rows: {
      id: string;
      name: string;
      roles: { id: string; name: string }[];
      viaTasks: boolean;
    }[] = [];
    const seen = new Set<string>();

    for (const project of projects) {
      const membership = memberships.find(
        (m) => m.projectId === project.id && m.developerId === person.id
      );
      if (!membership) continue;
      seen.add(project.id);
      rows.push({
        id: project.id,
        name: project.name,
        roles: project.roles.filter((r) => membership.roleIds.includes(r.id)),
        viaTasks: false,
      });
    }

    for (const task of tasks ?? []) {
      if (seen.has(task.project.id)) continue;
      seen.add(task.project.id);
      rows.push({
        id: task.project.id,
        name: task.project.name,
        roles: [],
        viaTasks: true,
      });
    }

    return rows;
  }, [projects, memberships, person.id, tasks]);

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

  const details = [
    person.email
      ? { label: "Email", value: person.email, href: `mailto:${person.email}` }
      : null,
    person.phone
      ? { label: "Phone", value: person.phone, href: `tel:${person.phone}` }
      : null,
    person.startDate
      ? { label: "Started", value: formatDay(person.startDate) }
      : null,
    person.employmentType
      ? {
          label: "Employment",
          value:
            EMPLOYMENT_TYPES.find((t) => t.value === person.employmentType)
              ?.label ?? null,
        }
      : null,
    person.salary != null
      ? {
          label: "Salary",
          value: `${person.salary.toLocaleString()} ${person.currency}`,
        }
      : null,
  ].filter((d): d is { label: string; value: string; href?: string } =>
    Boolean(d?.value)
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar person={person} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {person.name}
            </h2>
            {!person.active && (
              <span className="rounded-full bg-[var(--gridline)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--ink-secondary)]">
                Archived
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[0.8125rem] text-[var(--ink-secondary)]">
            {person.role || "No job title yet"}
            <span className="text-[var(--ink-muted)]">
              {" · "}
              {openCount} open task{openCount === 1 ? "" : "s"}
              {onProjects.length > 0 &&
                ` · ${onProjects.length} project${onProjects.length === 1 ? "" : "s"}`}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={onBack} className="btn-secondary lg:hidden">
            Back
          </button>
          <button onClick={onEdit} className="btn-primary">
            Edit profile
          </button>
        </div>
      </header>

      {/* Empty fields say nothing worth the room, so they aren't shown. */}
      {details.length > 0 && (
        <section className="grid gap-x-6 gap-y-3 rounded-[var(--radius-lg)] border border-[var(--hairline)] p-4 sm:grid-cols-2">
          {details.map((detail) => (
            <Detail
              key={detail.label}
              label={detail.label}
              value={detail.value}
              href={detail.href}
            />
          ))}
        </section>
      )}

      <Panel
        title="Projects"
        count={onProjects.length > 0 ? onProjects.length : undefined}
      >
        {onProjects.length === 0 ? (
          <Empty>
            {tasks === null
              ? "Loading…"
              : "Not on any project yet — “Edit profile” puts them on one."}
          </Empty>
        ) : (
          <ul className="divide-y divide-[var(--hairline)]">
            {onProjects.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                  {row.name}
                </span>
                {row.roles.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {row.roles.map((role) => (
                      <span
                        key={role.id}
                        className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--accent)]"
                      >
                        {role.name}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-[0.75rem] text-[var(--ink-muted)]">
                    {row.viaTasks ? "Has tasks, no role" : "No role"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Assigned tasks" count={tasks?.length}>
        {failed && (
          <Empty tone="error">Could not load their tasks.</Empty>
        )}
        {!failed && tasks === null && <Empty>Loading…</Empty>}
        {tasks?.length === 0 && <Empty>Nothing assigned right now.</Empty>}
        {tasks && tasks.length > 0 && (
          <ul className="thin-scroll max-h-72 divide-y divide-[var(--hairline)] overflow-y-auto">
            {tasks.map((task) => {
              const meta = statusMeta(task.status);
              return (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
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
                    {formatDay(task.endDate)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {person.notes && (
        <Panel title="Notes">
          <p className="whitespace-pre-wrap px-3 py-2.5 text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
            {person.notes}
          </p>
        </Panel>
      )}

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

/** A titled box. Every section of the card is one, so they line up. */
function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--hairline)]">
      <h3 className="border-b border-[var(--hairline)] bg-[var(--plane)] px-3 py-2 text-[0.75rem] font-semibold tracking-tight">
        {title}
        {count !== undefined && (
          <span className="ml-2 font-normal text-[var(--ink-muted)]">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function Empty({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <p
      className={`px-3 py-3 text-[0.8125rem] ${
        tone === "error" ? "text-[#d03b3b]" : "text-[var(--ink-muted)]"
      }`}
    >
      {children}
    </p>
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
  projects,
  memberships,
  onSave,
  onCancel,
  onDelete,
}: {
  person?: Developer;
  existingCount: number;
  projects: Project[];
  memberships: Membership[];
  /** Profile and project roles are saved together, on one press of Save. */
  onSave: (
    values: Partial<DeveloperInput>,
    places: Map<string, string[]>
  ) => Promise<void>;
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

  // projectId -> the roles held there. An empty list is still "on the
  // project"; a project that isn't in the map is one they aren't on.
  const [places, setPlaces] = useState<Map<string, string[]>>(() => {
    const map = new Map<string, string[]>();
    if (person) {
      for (const m of memberships) {
        if (m.developerId === person.id) map.set(m.projectId, m.roleIds);
      }
    }
    return map;
  });

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setOnProject(projectId: string, on: boolean) {
    setPlaces((prev) => {
      const next = new Map(prev);
      if (on) next.set(projectId, next.get(projectId) ?? []);
      else next.delete(projectId);
      return next;
    });
  }

  function toggleRole(projectId: string, roleId: string, on: boolean) {
    setPlaces((prev) => {
      const next = new Map(prev);
      const held = next.get(projectId) ?? [];
      next.set(
        projectId,
        on ? [...held, roleId] : held.filter((id) => id !== roleId)
      );
      return next;
    });
  }

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
      await onSave(
        {
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
        },
        places
      );
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

      <fieldset className="flex flex-col gap-1.5">
        <legend className="field-label mb-1.5">Projects and roles</legend>
        {projects.length === 0 ? (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">
            No projects with a team yet.
          </p>
        ) : (
          projects.map((project) => {
            const on = places.has(project.id);
            return (
              <div
                key={project.id}
                className={`flex flex-col gap-2 rounded-[var(--radius)] border p-2.5 transition ${
                  on
                    ? "border-[var(--accent)] bg-[var(--accent-wash)]"
                    : "border-[var(--hairline)]"
                }`}
              >
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setOnProject(project.id, e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                  />
                  <span className="text-[0.8125rem] font-medium">
                    {project.name}
                  </span>
                </label>
                {on && (
                  <span className="pl-6">
                    <RoleChips
                      roles={project.roles}
                      held={places.get(project.id) ?? []}
                      editable
                      label={`Roles on ${project.name}`}
                      onToggle={(roleId, next) =>
                        toggleRole(project.id, roleId, next)
                      }
                    />
                  </span>
                )}
              </div>
            );
          })
        )}
      </fieldset>

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

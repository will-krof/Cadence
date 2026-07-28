"use client";

import { useState } from "react";
import { Avatar, Field, RoleChips } from "@/components/ui";
import {
  CURRENCIES,
  WORK_STATUSES,
  WorkStatus,
  DEVELOPER_PALETTE,
  Developer,
  DeveloperInput,
  EMPLOYMENT_TYPES,
  EmploymentType,
  Membership,
  Project,
} from "@/lib/types";
import { toISODate } from "@/lib/dates";

export function ProfileForm({
  person,
  existingCount,
  projects,
  memberships,
  onSave,
  onCancel,
  onDelete,
  limited = false,
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
  /**
   * A role that keeps the roster tidy writes the working half of a card and no
   * more: what somebody is paid, what an admin wrote about them, and where they
   * are on which project stay with the workspace's owner.
   */
  limited?: boolean;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState(person?.role ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [birthday, setBirthday] = useState(
    person?.birthday ? toISODate(new Date(person.birthday)) : ""
  );
  const [workStatus, setWorkStatus] = useState<WorkStatus | "">(
    person?.workStatus ?? "WORKING"
  );
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      // What travels is what this form is allowed to write: a limited form
      // sends the working half and nothing else, so a field it never showed
      // can't be cleared by saving.
      await onSave(
        limited
          ? {
              name: name.trim(),
              role,
              email,
              phone,
              birthday: birthday || null,
              workStatus: workStatus || null,
              color,
            }
          : {
              name: name.trim(),
              role,
              email,
              phone,
              birthday: birthday || null,
              workStatus: workStatus || null,
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
      {/* A profile is a letter and a colour. Nothing is uploaded and nothing is
          stored, so this is the whole of how somebody looks. */}
      <div className="flex items-center gap-4">
        <Avatar person={{ name: name || "?", color }} size={64} />
        <p className="text-[0.6875rem] text-[var(--ink-muted)]">
          The initial of the name, in the colour below.
        </p>
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
        <Field label="Birthday">
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Where they are">
          <select
            value={workStatus}
            onChange={(e) => setWorkStatus(e.target.value as WorkStatus | "")}
            className="select"
          >
            {WORK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {!limited && (
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
      )}

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

      {!limited && (
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
      )}

      {!limited && (
      <>
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
        On the team
      </label>
      </>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-[0.75rem] text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 border-t border-[var(--hairline)] pt-4">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="btn-secondary mr-auto !text-[var(--danger)]"
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

"use client";

import { useMemo, useRef, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { Field } from "@/components/ui";
import { useFeedback } from "@/components/Feedback";
import {
  CURRENCIES,
  Developer,
  DeveloperInput,
  DEVELOPER_PALETTE,
  EMPLOYMENT_TYPES,
  EmploymentType,
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
  const { developers, createDeveloper, updateDeveloper, deleteDeveloper } =
    useBoard();
  const { confirm } = useFeedback();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = useMemo(
    () => developers.find((d) => d.id === selectedId) ?? null,
    [developers, selectedId]
  );

  const editing = creating || Boolean(selected);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        className={`thin-scroll flex flex-col gap-2 overflow-y-auto border-b border-[var(--hairline)] p-4 lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-5 ${
          editing ? "hidden lg:flex" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[0.8125rem] font-semibold tracking-tight">
            Team
            <span className="ml-2 font-normal text-[var(--ink-muted)]">
              {developers.length}
            </span>
          </h2>
          <button
            onClick={() => {
              setSelectedId(null);
              setCreating(true);
            }}
            className="btn-primary"
          >
            Add person
          </button>
        </div>

        {developers.length === 0 && (
          <p className="py-4 text-[0.8125rem] text-[var(--ink-muted)]">
            No one on the team yet.
          </p>
        )}

        {developers.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              setCreating(false);
              setSelectedId(d.id);
            }}
            className={`flex items-center gap-3 rounded-[var(--radius)] border p-2.5 text-left transition ${
              d.id === selectedId
                ? "border-[var(--accent)] bg-[var(--accent-wash)]"
                : "border-[var(--hairline)] hover:bg-[var(--plane)]"
            }`}
          >
            <Avatar person={d} size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[0.8125rem] font-medium">
                  {d.name}
                </span>
                {!d.active && (
                  <span className="shrink-0 rounded-full bg-[var(--gridline)] px-1.5 py-0.5 text-[0.5625rem] uppercase tracking-wide text-[var(--ink-secondary)]">
                    Inactive
                  </span>
                )}
              </span>
              <span className="block truncate text-[0.75rem] text-[var(--ink-muted)]">
                {d.role || d.email || "—"}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {editing ? (
          <ProfileForm
            key={selected?.id ?? "new"}
            person={selected ?? undefined}
            existingCount={developers.length}
            onCancel={() => {
              setCreating(false);
              setSelectedId(null);
            }}
            onSave={async (values) => {
              if (selected) {
                await updateDeveloper(selected.id, values);
              } else {
                const created = await createDeveloper(values);
                if (created) {
                  setCreating(false);
                  setSelectedId(created.id);
                }
              }
            }}
            onDelete={
              selected
                ? async () => {
                    const ok = await confirm({
                      title: `Remove ${selected.name}?`,
                      body: "Their tasks stay, but become unassigned.",
                      confirmLabel: "Remove",
                      destructive: true,
                    });
                    if (!ok) return;
                    await deleteDeveloper(selected.id);
                    setSelectedId(null);
                  }
                : undefined
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

export function Avatar({
  person,
  size = 32,
}: {
  person: Pick<Developer, "name" | "avatar" | "color">;
  size?: number;
}) {
  if (person.avatar) {
    return (
      // Data URLs can't go through next/image, and these are already downscaled.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.avatar}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: person.color,
        fontSize: size * 0.4,
      }}
    >
      {person.name.slice(0, 1).toUpperCase()}
    </span>
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

"use client";

import { useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { CloseIcon, TagChip } from "@/components/ui";
import { Project, ProjectTag, TAG_COLORS } from "@/lib/types";
import { LIMITS } from "@/lib/sanitize";

/**
 * The labels this project puts on its work.
 *
 * Written as they are typed rather than with the rest of the settings: a tag
 * is a thing that exists, like a sprint or a role, and the tasks wearing it
 * are pointing at the row. Renaming or recolouring one changes it everywhere
 * it is worn, which is the point of having them at all.
 */
export function TagsSection({
  project,
  onAdd,
  onUpdate,
  onRemove,
}: {
  project: Project;
  onAdd: (name: string, color: string) => Promise<ProjectTag | null>;
  onUpdate: (
    tagId: string,
    patch: { name?: string; color?: string }
  ) => Promise<void>;
  onRemove: (tagId: string) => Promise<void>;
}) {
  const { confirm } = useFeedback();
  const [name, setName] = useState("");
  // The next tag's colour, kept where it was left: a run of tags for one part
  // of the work is usually one colour.
  const [color, setColor] = useState<string>(TAG_COLORS[0]);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  // Not a <form>: this sits inside the settings form, and a form inside a form
  // is not something a browser will build. Enter adds a tag the way it would
  // there, and the button says so too.
  async function add() {
    const asked = name.trim();
    if (!asked) return;
    setPending(true);
    const created = await onAdd(asked, color);
    setPending(false);
    if (created) setName("");
  }

  async function remove(tag: ProjectTag) {
    const ok = await confirm({
      title: `Remove the “${tag.name}” tag?`,
      body: "It comes off every task wearing it. Nothing else is deleted.",
      confirmLabel: "Remove tag",
      destructive: true,
    });
    if (ok) await onRemove(tag.id);
  }

  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--hairline)] p-3">
      <p className="field-label mb-2">This project’s tags</p>

      {project.tags.length === 0 ? (
        <p className="mb-2 text-[0.75rem] text-[var(--ink-muted)]">
          None yet. A tag is a word or two — “backend”, “needs design”,
          “customer asked” — in a colour you can pick a task out by.
        </p>
      ) : (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <span key={tag.id} className="flex items-center">
              <button
                type="button"
                onClick={() => setEditing(editing === tag.id ? null : tag.id)}
                aria-expanded={editing === tag.id}
                title="Rename it, or change its colour"
              >
                <TagChip tag={tag} />
              </button>
              <button
                type="button"
                onClick={() => remove(tag)}
                className="ml-0.5 rounded p-1 text-[var(--ink-muted)] transition hover:text-[var(--danger)]"
                aria-label={`Remove the ${tag.name} tag`}
              >
                <CloseIcon size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* One tag opened for changes at a time, under the row it is in. */}
      {editing && (
        <TagEditor
          key={editing}
          tag={project.tags.find((t) => t.id === editing)!}
          onChange={(patch) => onUpdate(editing, patch)}
          onDone={() => setEditing(null)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Swatches value={color} onChange={setColor} label="Colour for the new tag" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, LIMITS.tagName))}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void add();
          }}
          className="input w-40"
          placeholder="e.g. backend"
          aria-label="New tag"
        />
        <button
          type="button"
          onClick={add}
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || !name.trim()}
        >
          {pending ? "Adding…" : "Add tag"}
        </button>
      </div>
    </div>
  );
}

/** One tag opened up: its name, and the colour it is drawn in. */
function TagEditor({
  tag,
  onChange,
  onDone,
}: {
  tag: ProjectTag;
  onChange: (patch: { name?: string; color?: string }) => Promise<void>;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(tag.name);

  async function commit() {
    const next = draft.trim();
    if (next && next !== tag.name) await onChange({ name: next });
    else setDraft(tag.name);
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[var(--radius)] bg-[var(--plane)] p-2">
      <Swatches
        value={tag.color}
        onChange={(color) => onChange({ color })}
        label={`Colour of the ${tag.name} tag`}
      />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, LIMITS.tagName))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(tag.name);
            onDone();
          }
        }}
        className="input w-40"
        aria-label={`Name of the ${tag.name} tag`}
      />
      <button type="button" onClick={onDone} className="btn-secondary">
        Done
      </button>
    </div>
  );
}

/** The colours on offer, as the colours themselves. */
function Swatches({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1" role="group" aria-label={label}>
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-pressed={value.toLowerCase() === color}
          aria-label={color}
          className={`h-4 w-4 rounded-full transition ${
            value.toLowerCase() === color
              ? "ring-2 ring-[var(--ink)] ring-offset-1 ring-offset-[var(--surface)]"
              : "hover:scale-110"
          }`}
          style={{ background: color }}
        />
      ))}
    </span>
  );
}

"use client";

import { useState } from "react";
import { Field, Modal } from "@/components/ui";
import { Project } from "@/lib/types";

export interface ProjectFormValues {
  name: string;
  description: string;
  hasTimeline: boolean;
  hasTracker: boolean;
  hasTeam: boolean;
}

/** One form for creating and editing, so both expose the same tool toggles. */
export function ProjectModal({
  project,
  onClose,
  onSubmit,
  onDelete,
}: {
  project?: Project;
  onClose: () => void;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
  onDelete?: () => void;
}) {
  const isEdit = Boolean(project);

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [hasTimeline, setHasTimeline] = useState(project?.hasTimeline ?? true);
  const [hasTracker, setHasTracker] = useState(project?.hasTracker ?? true);
  const [hasTeam, setHasTeam] = useState(project?.hasTeam ?? true);
  const [pending, setPending] = useState(false);

  const noTool = !hasTimeline && !hasTracker && !hasTeam;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || noTool) return;
    setPending(true);
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      hasTimeline,
      hasTracker,
      hasTeam,
    });
    setPending(false);
  }

  return (
    <Modal onClose={onClose} title={isEdit ? "Project settings" : "New project"}>
      <form className="flex flex-col gap-3.5" onSubmit={submit}>
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
          <ToolCheckbox
            checked={hasTeam}
            onChange={setHasTeam}
            label="Team"
            hint="People profiles and roster"
          />
          {noTool && (
            <p className="text-[0.6875rem] text-[#d03b3b]">Pick at least one.</p>
          )}
        </fieldset>

        <div className="mt-1 flex items-center justify-end gap-2">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="btn-secondary mr-auto !text-[#d03b3b]"
            >
              Delete project
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending || noTool || !name.trim()}
          >
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create project"}
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

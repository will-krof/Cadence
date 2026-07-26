"use client";

import { useState } from "react";
import { Field, Modal, ToolCheckbox } from "@/components/ui";

export interface ProjectFormValues {
  name: string;
  description: string;
  hasTimeline: boolean;
  hasTracker: boolean;
  hasTeam: boolean;
}

/** Creating a project. Editing one happens on its card, in the Overview view. */
export function ProjectModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hasTimeline, setHasTimeline] = useState(true);
  const [hasTracker, setHasTracker] = useState(true);
  const [hasTeam, setHasTeam] = useState(true);
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
    <Modal onClose={onClose} title="New project">
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
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending || noTool || !name.trim()}
          >
            {pending ? "Saving…" : "Create project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

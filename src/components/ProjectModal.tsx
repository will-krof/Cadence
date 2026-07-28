"use client";

import { useState } from "react";
import { Field, Modal, ToolCheckbox } from "@/components/ui";

export interface ProjectFormValues {
  name: string;
  description: string;
  hasTimeline: boolean;
  hasTracker: boolean;
  hasWiki: boolean;
  hasSprints: boolean;
  hasRoles: boolean;
  /** Empty leaves the span to the work — the earliest task to the latest. */
  startDate: string | null;
  endDate: string | null;
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
  const [hasWiki, setHasWiki] = useState(true);
  const [hasSprints, setHasSprints] = useState(true);
  const [hasRoles, setHasRoles] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pending, setPending] = useState(false);

  // Said here rather than only refused by the server: the two fields are side
  // by side, and the answer is one glance away from the mistake.
  const backwards = Boolean(startDate && endDate && endDate < startDate);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || backwards) return;
    setPending(true);
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      hasTimeline,
      hasTracker,
      hasWiki,
      hasSprints,
      hasRoles,
      startDate: startDate || null,
      endDate: endDate || null,
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

        {/* A project that plans in sprints gets its span from them. One that
            doesn't still has a beginning and an end, and says so here. */}
        <div className="flex flex-col gap-3.5 sm:flex-row">
          <Field label="Start date" className="flex-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="End date" className="flex-1">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <p className="-mt-1.5 text-[0.6875rem] text-[var(--ink-muted)]">
          {backwards ? (
            <span className="text-[var(--danger)]">
              The project can’t end before it starts.
            </span>
          ) : (
            "Leave these empty to let the work say when the project runs — the earliest task to the latest."
          )}
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="field-label mb-1.5">What do you need?</legend>
          <ToolCheckbox
            checked={hasTimeline}
            onChange={setHasTimeline}
            label="Gantt chart"
            hint="Timeline of the work, with its dependencies"
          />
          <ToolCheckbox
            checked={hasTracker}
            onChange={setHasTracker}
            label="Task tracker"
            hint="Kanban board by status"
          />
          <ToolCheckbox
            checked={hasSprints}
            onChange={setHasSprints}
            label="Sprints"
            hint="Plan the work in rounds. Off, the boards show it all at once"
          />
          <ToolCheckbox
            checked={hasWiki}
            onChange={setHasWiki}
            label="Wiki"
            hint="Pages the project writes down for itself"
          />
          <ToolCheckbox
            checked={hasRoles}
            onChange={setHasRoles}
            label="Roles"
            hint="Decide what each group may open. Off, the project is yours alone"
          />
          <p className="text-[0.6875rem] text-[var(--ink-muted)]">
            Every project has a team — the roster is always there. Which of a
            task’s fields the forms ask about is set on the project card.
          </p>
        </fieldset>

        <div className="mt-1 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending || !name.trim() || backwards}
          >
            {pending ? "Saving…" : "Create project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

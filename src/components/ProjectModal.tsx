"use client";

import { useState } from "react";
import { Field, Modal } from "@/components/ui";

export interface ProjectFormValues {
  name: string;
  description: string;
}

/**
 * Creating a project: what it is called, and what it is about. Nothing else.
 *
 * Everything a project is made of — its boards, its sprints, its roles, when it
 * runs, which of a task's fields its forms ask about — is decided on the card
 * that opens the moment it is created, where the answers can be seen against
 * each other and changed again later. A project arrives empty and is built up,
 * rather than arriving with everything and having to be pared back through a
 * modal nobody reads on the way to naming a thing.
 */
export function ProjectModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    await onSubmit({ name: name.trim(), description: description.trim() });
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

        <p className="text-[0.6875rem] text-[var(--ink-muted)]">
          What it’s made of comes next: the boards, sprints, roles, when it runs
          and what a task asks for are all on the project’s own card, which opens
          as soon as this is made.
        </p>

        <div className="mt-1 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending || !name.trim()}
          >
            {pending ? "Saving…" : "Create project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

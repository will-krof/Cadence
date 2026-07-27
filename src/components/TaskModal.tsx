"use client";

import { useState } from "react";
import { toISODate } from "@/lib/dates";
import { Developer, Task, TaskStatus } from "@/lib/types";
import { offeredStatuses, useHiddenStatuses } from "@/lib/prefs";
import { CloseIcon, Field, Modal } from "@/components/ui";
import { TaskHistory } from "@/components/TaskHistory";

export interface TaskFormValues {
  title: string;
  description: string;
  link: string;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  developerId: string | null;
  /** Steps to create along with a new task, as titles. */
  subtasks: string[];
}

/**
 * One form for both creating and editing. Passing a task switches it to edit
 * mode, so the two paths can't drift apart in which fields they expose.
 */
export function TaskModal({
  task,
  subtasks = [],
  developers,
  onClose,
  onSubmit,
  onDelete,
  onAddSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
}: {
  task?: Task;
  /** The steps this task already has, when there is a task to have them. */
  subtasks?: Task[];
  developers: Developer[];
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => void | Promise<void>;
  onDelete?: () => void;
  /** Editing a task writes its steps as they are changed, not on save. */
  onAddSubtask?: (title: string) => Promise<void>;
  onUpdateSubtask?: (id: string, patch: { status?: TaskStatus; title?: string }) => Promise<void>;
  onDeleteSubtask?: (id: string) => Promise<void>;
}) {
  const today = toISODate(new Date());
  const isEdit = Boolean(task);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [link, setLink] = useState(task?.link ?? "");
  const [startDate, setStartDate] = useState(
    task ? toISODate(new Date(task.startDate)) : today
  );
  const [endDate, setEndDate] = useState(
    task ? toISODate(new Date(task.endDate)) : today
  );
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "TODO");
  const [hiddenStatuses] = useHiddenStatuses();
  const [developerId, setDeveloperId] = useState(task?.developerId ?? "");
  const [pending, setPending] = useState(false);

  // A task being created has nowhere to hang its steps yet, so they are staged
  // here and made with it. One being edited writes them as they are typed.
  const [staged, setStaged] = useState<string[]>([]);
  const [stepTitle, setStepTitle] = useState("");

  // A step of a step is a task in its own right, so a subtask's form doesn't
  // offer any.
  const takesSteps = !task?.parentId;

  async function addStep() {
    const title = stepTitle.trim();
    if (!title) return;
    setStepTitle("");
    if (isEdit && onAddSubtask) await onAddSubtask(title);
    else setStaged((prev) => [...prev, title]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    await onSubmit({
      title: title.trim(),
      description: description.trim(),
      link: link.trim(),
      startDate,
      // Guard against an end before the start rather than rejecting the save.
      endDate: endDate < startDate ? startDate : endDate,
      status,
      developerId: developerId || null,
      subtasks: staged,
    });
    setPending(false);
  }

  return (
    <Modal onClose={onClose} title={isEdit ? "Edit task" : "New task"}>
      <form className="flex flex-col gap-3.5" onSubmit={submit}>
        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="e.g. [Backend] API update"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input min-h-20 resize-y"
            placeholder="What needs to be done…"
          />
        </Field>

        <Field label="Link">
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            className="input"
            placeholder="https://…"
          />
        </Field>

        <div className="flex flex-col gap-3.5 sm:flex-row">
          <Field label="Start" className="flex-1">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="End" className="flex-1">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3.5 sm:flex-row">
          <Field label="Status" className="flex-1">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="select"
            >
              {offeredStatuses(hiddenStatuses, status).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assignee" className="flex-1">
            <select
              value={developerId}
              onChange={(e) => setDeveloperId(e.target.value)}
              className="select"
            >
              <option value="">Unassigned</option>
              {developers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {isEdit && task && <TaskHistory taskId={task.id} />}

        {takesSteps && (
          <fieldset className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
            <legend className="field-label mb-1.5">
              Subtasks
              {(subtasks.length > 0 || staged.length > 0) && (
                <span className="ml-1.5 text-[var(--ink-muted)]">
                  {subtasks.filter((s) => s.status === "DONE").length +
                    "/" +
                    (subtasks.length + staged.length)}
                </span>
              )}
            </legend>

            {subtasks.map((step) => (
              <div key={step.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={step.status === "DONE"}
                  onChange={(e) =>
                    onUpdateSubtask?.(step.id, {
                      status: e.target.checked ? "DONE" : "TODO",
                    })
                  }
                  className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--accent)]"
                  aria-label={`${step.title} is done`}
                />
                <input
                  defaultValue={step.title}
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next && next !== step.title) {
                      onUpdateSubtask?.(step.id, { title: next });
                    } else {
                      e.target.value = step.title;
                    }
                  }}
                  className={`input flex-1 ${
                    step.status === "DONE"
                      ? "text-[var(--ink-muted)] line-through"
                      : ""
                  }`}
                  aria-label={`Title of ${step.title}`}
                />
                <button
                  type="button"
                  onClick={() => onDeleteSubtask?.(step.id)}
                  className="shrink-0 rounded p-1 text-[var(--ink-muted)] transition hover:text-[#d03b3b]"
                  aria-label={`Delete ${step.title}`}
                  title="Delete this subtask"
                >
                  <CloseIcon />
                </button>
              </div>
            ))}

            {staged.map((title, i) => (
              <div key={`${title}-${i}`} className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-[var(--baseline)]" />
                <span className="flex-1 truncate text-[0.8125rem]">{title}</span>
                <button
                  type="button"
                  onClick={() =>
                    setStaged((prev) => prev.filter((_, n) => n !== i))
                  }
                  className="shrink-0 rounded p-1 text-[var(--ink-muted)] transition hover:text-[#d03b3b]"
                  aria-label={`Remove ${title}`}
                >
                  <CloseIcon />
                </button>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <input
                value={stepTitle}
                onChange={(e) => setStepTitle(e.target.value)}
                onKeyDown={(e) => {
                  // Enter adds a step rather than submitting the whole form,
                  // which is what it would do in a form with one button.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStep();
                  }
                }}
                className="input flex-1"
                placeholder="Add a step…"
                aria-label="New subtask"
              />
              <button
                type="button"
                onClick={addStep}
                disabled={!stepTitle.trim()}
                className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <p className="text-[0.6875rem] text-[var(--ink-muted)]">
              Each step is a task of its own — it starts with this task’s dates
              and assignee, and appears under it on both boards.
            </p>
          </fieldset>
        )}

        <div className="mt-1 flex items-center justify-end gap-2">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="btn-secondary mr-auto !text-[#d03b3b]"
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !title.trim()}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

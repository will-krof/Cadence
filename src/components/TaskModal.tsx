"use client";

import { useState } from "react";
import { toISODate } from "@/lib/dates";
import { Developer, Task, TaskStatus } from "@/lib/types";
import { offeredStatuses, useHiddenStatuses } from "@/lib/prefs";
import { Field, Modal } from "@/components/ui";

export interface TaskFormValues {
  title: string;
  description: string;
  link: string;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  developerId: string | null;
}

/**
 * One form for both creating and editing. Passing a task switches it to edit
 * mode, so the two paths can't drift apart in which fields they expose.
 */
export function TaskModal({
  task,
  developers,
  onClose,
  onSubmit,
  onDelete,
}: {
  task?: Task;
  developers: Developer[];
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => void | Promise<void>;
  onDelete?: () => void;
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

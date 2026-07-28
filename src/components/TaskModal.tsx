"use client";

import { useMemo, useState } from "react";
import { formatDay, toISODate } from "@/lib/dates";
import {
  Developer,
  Task,
  TaskPriority,
  TaskStatus,
  priorityMeta,
} from "@/lib/types";
import { offeredStatuses, useHiddenStatuses } from "@/lib/prefs";
import {
  CloseIcon,
  Field,
  Modal,
  PriorityMark,
  PrioritySelect,
} from "@/components/ui";
import { TaskHistory } from "@/components/TaskHistory";

export interface TaskFormValues {
  title: string;
  description: string;
  link: string;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  developerId: string | null;
  /** The tasks this one waits on, by id. */
  blockedBy: string[];
  /** Steps to create along with a new task, each with whoever will do it. */
  subtasks: NewStep[];
}

/** A step staged for a task that doesn't exist yet. */
export interface NewStep {
  title: string;
  developerId: string | null;
}

/** Nothing to pick from: a stable empty list, so a default can't churn a memo. */
const NO_TASKS: Task[] = [];

/**
 * One form for both creating and editing. Passing a task switches it to edit
 * mode, so the two paths can't drift apart in which fields they expose.
 *
 * It is laid out as two columns on anything wider than a tablet: the task
 * itself on the left, and everything that surrounds it — what it waits on, what
 * it is made of, what has happened to it — on the right. A task is the one
 * thing here with that much to say about it, and saying it in a phone-width
 * column turned reading a task into scrolling a queue.
 */
export function TaskModal({
  task,
  subtasks = [],
  projectTasks = NO_TASKS,
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
  /**
   * Everything on the project, which is what a dependency can point at. A task
   * waits on work in its own plan; the server holds to that too.
   */
  projectTasks?: Task[];
  developers: Developer[];
  onClose: () => void;
  onSubmit: (values: TaskFormValues) => void | Promise<void>;
  onDelete?: () => void;
  /** Editing a task writes its steps as they are changed, not on save. */
  onAddSubtask?: (step: NewStep) => Promise<void>;
  onUpdateSubtask?: (
    id: string,
    patch: { status?: TaskStatus; title?: string; developerId?: string | null }
  ) => Promise<void>;
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
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "MEDIUM"
  );
  const [hiddenStatuses] = useHiddenStatuses();
  const [developerId, setDeveloperId] = useState(task?.developerId ?? "");
  const [pending, setPending] = useState(false);

  // What this task waits on. Held in the form rather than written as it is
  // picked: a dependency and the dates it argues with are one thought, and
  // they are saved together.
  const [blockedBy, setBlockedBy] = useState<string[]>(task?.blockedBy ?? []);

  // A task being created has nowhere to hang its steps yet, so they are staged
  // here and made with it. One being edited writes them as they are typed.
  const [staged, setStaged] = useState<NewStep[]>([]);
  const [stepTitle, setStepTitle] = useState("");
  // Whoever the next step is for. It stays put after adding one, so a run of
  // steps for the same person is typed rather than picked over and over.
  const [stepWho, setStepWho] = useState("");

  // A step of a step is a task in its own right, so a subtask's form doesn't
  // offer any.
  const takesSteps = !task?.parentId;

  const byId = useMemo(
    () => new Map(projectTasks.map((t) => [t.id, t])),
    [projectTasks]
  );

  /**
   * What this task could be made to wait on. Itself is out, so is anything
   * already picked, and so is everything downstream of it — a task can't wait
   * on work that is waiting on it, and the server refuses the same set. Doing
   * the walk here means the offer never contains an answer that would be
   * rejected.
   */
  const candidates = useMemo(() => {
    if (projectTasks.length === 0) return NO_TASKS;
    if (!task) {
      return projectTasks.filter((t) => !blockedBy.includes(t.id));
    }
    const waitingOn = new Map<string, string[]>();
    for (const t of projectTasks) {
      for (const blocker of t.blockedBy) {
        waitingOn.set(blocker, [...(waitingOn.get(blocker) ?? []), t.id]);
      }
    }
    const downstream = new Set<string>([task.id]);
    const queue = [task.id];
    while (queue.length > 0) {
      for (const next of waitingOn.get(queue.pop()!) ?? []) {
        if (downstream.has(next)) continue;
        downstream.add(next);
        queue.push(next);
      }
    }
    return projectTasks.filter(
      (t) =>
        !downstream.has(t.id) &&
        // A task waiting on one of its own steps is a task waiting on itself
        // the long way round.
        t.parentId !== task.id &&
        !blockedBy.includes(t.id)
    );
  }, [projectTasks, task, blockedBy]);

  /** The work waiting on this one. Read-only: it is the other task's answer. */
  const blocking = useMemo(
    () => (task ? projectTasks.filter((t) => t.blockedBy.includes(task.id)) : NO_TASKS),
    [projectTasks, task]
  );

  async function addStep() {
    const title = stepTitle.trim();
    if (!title) return;
    const step: NewStep = { title, developerId: stepWho || null };
    setStepTitle("");
    if (isEdit && onAddSubtask) await onAddSubtask(step);
    else setStaged((prev) => [...prev, step]);
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
      priority,
      developerId: developerId || null,
      blockedBy,
      subtasks: staged,
    });
    setPending(false);
  }

  return (
    <Modal wide onClose={onClose} title={isEdit ? "Edit task" : "New task"}>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-7">
          {/* The task itself. `min-w-0` on both columns because a grid child
              sizes to its widest content by default, and one row of the step
              editor is wider than a phone. */}
          <div className="flex min-w-0 flex-col gap-3.5">
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
                className="input min-h-40 resize-y leading-relaxed lg:min-h-56"
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
              {/* Not a kind of status: one says where the work is, this says
                  which of two waiting tasks is picked up first. */}
              <Field label="Priority" className="flex-1">
                <PrioritySelect priority={priority} onChange={setPriority} />
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
          </div>

          {/* Everything around it. */}
          <div className="flex min-w-0 flex-col gap-4">
            <Dependencies
              startDate={startDate}
              blockedBy={blockedBy}
              blocking={blocking}
              byId={byId}
              candidates={candidates}
              onAdd={(id) => setBlockedBy((prev) => [...prev, id])}
              onRemove={(id) =>
                setBlockedBy((prev) => prev.filter((b) => b !== id))
              }
            />

            {takesSteps && (
              <fieldset className="flex min-w-0 flex-col gap-2 border-t border-[var(--hairline)] pt-3.5">
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
                      className={`input min-w-0 flex-1 ${
                        step.status === "DONE"
                          ? "text-[var(--ink-muted)] line-through"
                          : ""
                      }`}
                      aria-label={`Title of ${step.title}`}
                    />
                    <select
                      value={step.developerId ?? ""}
                      onChange={(e) =>
                        onUpdateSubtask?.(step.id, {
                          developerId: e.target.value || null,
                        })
                      }
                      className="select w-32 shrink-0"
                      aria-label={`Assignee for ${step.title}`}
                    >
                      <option value="">Unassigned</option>
                      {developers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
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

                {staged.map((step, i) => (
                  <div
                    key={`${step.title}-${i}`}
                    className="flex items-center gap-2"
                  >
                    <span className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-[var(--baseline)]" />
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                      {step.title}
                    </span>
                    <select
                      value={step.developerId ?? ""}
                      onChange={(e) =>
                        setStaged((prev) =>
                          prev.map((s, n) =>
                            n === i
                              ? { ...s, developerId: e.target.value || null }
                              : s
                          )
                        )
                      }
                      className="select w-32 shrink-0"
                      aria-label={`Assignee for ${step.title}`}
                    >
                      <option value="">Unassigned</option>
                      {developers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setStaged((prev) => prev.filter((_, n) => n !== i))
                      }
                      className="shrink-0 rounded p-1 text-[var(--ink-muted)] transition hover:text-[#d03b3b]"
                      aria-label={`Remove ${step.title}`}
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
                    className="input min-w-0 flex-1"
                    placeholder="Add a step…"
                    aria-label="New subtask"
                  />
                  <select
                    value={stepWho}
                    onChange={(e) => setStepWho(e.target.value)}
                    className="select w-32 shrink-0"
                    aria-label="Assignee for the new subtask"
                  >
                    <option value="">Unassigned</option>
                    {developers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
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
                  Each step is a task of its own — it starts with this task’s
                  dates, goes to whoever is picked beside it, and appears under
                  it on both boards.
                </p>
              </fieldset>
            )}

            {/* What happened to this task, under the work it is made of. */}
            {isEdit && task && <TaskHistory taskId={task.id} />}
          </div>
        </div>

        <div className="mt-1 flex items-center justify-end gap-2 border-t border-[var(--hairline)] pt-4">
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

/**
 * What a task waits on, and what waits on it. Only the first half is editable:
 * "X blocks me" and "I block X" are one fact written once, and it belongs to
 * the task that is being held up.
 */
function Dependencies({
  startDate,
  blockedBy,
  blocking,
  byId,
  candidates,
  onAdd,
  onRemove,
}: {
  /** This task's start, for saying when a blocker finishes after it. */
  startDate: string;
  blockedBy: string[];
  blocking: Task[];
  byId: Map<string, Task>;
  candidates: Task[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [picked, setPicked] = useState("");

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="field-label mb-1.5">
        Dependencies
        {blockedBy.length > 0 && (
          <span className="ml-1.5 text-[var(--ink-muted)]">
            waits on {blockedBy.length}
          </span>
        )}
      </legend>

      {blockedBy.length === 0 && (
        <p className="text-[0.75rem] text-[var(--ink-muted)]">
          Nothing is holding this up.
        </p>
      )}

      {blockedBy.map((id) => {
        const blocker = byId.get(id);
        // A blocker that finishes after this task is meant to start is the
        // thing a plan most often gets wrong, so the row says so rather than
        // leaving it to be noticed on the chart.
        const late =
          blocker != null && toISODate(new Date(blocker.endDate)) >= startDate;
        return (
          <div
            key={id}
            className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--plane)] px-2.5 py-1.5"
          >
            <span className="shrink-0 text-[var(--ink-muted)]" aria-hidden="true">
              ⇢
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5">
                {blocker && <PriorityMark priority={blocker.priority} />}
                <span className="truncate text-[0.8125rem]">
                  {blocker?.title ?? "A task on another board"}
                </span>
              </span>
              {blocker && (
                <span
                  className={`text-[0.6875rem] tabular-nums ${
                    late ? "text-[#d03b3b]" : "text-[var(--ink-muted)]"
                  }`}
                >
                  {late
                    ? `Finishes ${formatDay(blocker.endDate)} — after this starts`
                    : `Finishes ${formatDay(blocker.endDate)}`}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onRemove(id)}
              className="shrink-0 rounded p-1 text-[var(--ink-muted)] transition hover:text-[#d03b3b]"
              aria-label={`Stop waiting on ${blocker?.title ?? "this task"}`}
              title="Remove this dependency"
            >
              <CloseIcon />
            </button>
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          className="select min-w-0 flex-1"
          aria-label="A task this one waits on"
          disabled={candidates.length === 0}
        >
          <option value="">
            {candidates.length === 0
              ? "Nothing left to wait on"
              : "Wait on a task…"}
          </option>
          {candidates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
              {t.priority !== "MEDIUM"
                ? ` · ${priorityMeta(t.priority).label}`
                : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (!picked) return;
            onAdd(picked);
            setPicked("");
          }}
          disabled={!picked}
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {blocking.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          <span className="field-label">
            Blocks {blocking.length === 1 ? "1 task" : `${blocking.length} tasks`}
          </span>
          <span className="flex flex-wrap gap-1">
            {blocking.map((t) => (
              <span
                key={t.id}
                className="max-w-full truncate rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[0.6875rem] text-[var(--ink-secondary)]"
                title={`${t.title} can’t start until this is done`}
              >
                {t.title}
              </span>
            ))}
          </span>
        </div>
      )}

      <p className="text-[0.6875rem] text-[var(--ink-muted)]">
        A blocker has to finish before this task starts. The timeline draws the
        links, and the longest chain through them is the critical path.
      </p>
    </fieldset>
  );
}

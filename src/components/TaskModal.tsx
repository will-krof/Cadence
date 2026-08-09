"use client";

import { useMemo, useState } from "react";
import { formatDay, toISODate } from "@/lib/dates";
import {
  ALL_TASK_FIELDS,
  Developer,
  ProjectTag,
  Task,
  TaskFields,
  TaskPriority,
  TaskStatus,
  priorityMeta,
} from "@/lib/types";
import { offeredStatuses, useHiddenStatuses } from "@/lib/prefs";
import {
  amountFor,
  ESTIMATE_UNITS,
  EstimateUnit,
  HOURS_PER_DAY,
  isEstimateUnit,
  otherUnit,
  toMinutes,
} from "@/lib/estimate";
import {
  AssigneeField,
  AssigneePicker,
  CloseIcon,
  Field,
  Modal,
  PriorityMark,
  PrioritySelect,
  TagPicker,
} from "@/components/ui";
import { MAX_ASSIGNEES } from "@/lib/assignees";
// The cap, not the module that enforces it: `task-deps` opens the database.
import { LIMITS } from "@/lib/sanitize";
import { TaskHistory } from "@/components/TaskHistory";
import { TaskComments } from "@/components/TaskComments";

export interface TaskFormValues {
  title: string;
  description: string;
  link: string;
  /** Empty where the work hasn't been placed in time. */
  startDate: string | null;
  endDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Who is on it, by id: up to four, in the order they were picked. */
  assigneeIds: string[];
  /** The project's labels it wears, by id. */
  tagIds: string[];
  /** How long it should take, in minutes. Null where nobody has guessed. */
  estimateMinutes: number | null;
  /** Which unit that was written in, so the form says it back the same way. */
  estimateUnit: EstimateUnit;
  /** The tasks this one waits on, by id. */
  blockedBy: string[];
  /** Steps to create along with a new task, each with whoever will do it. */
  subtasks: NewStep[];
}

/** A step staged for a task that doesn't exist yet. */
export interface NewStep {
  title: string;
  assigneeIds: string[];
}

/** Nothing to pick from: a stable empty list, so a default can't churn a memo. */
const NO_TASKS: Task[] = [];

/** A project with no labels of its own. */
const NO_TAGS: ProjectTag[] = [];

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
  initialStatus,
  subtasks = [],
  projectTasks = NO_TASKS,
  developers,
  tags = NO_TAGS,
  fields = ALL_TASK_FIELDS,
  onClose,
  onSubmit,
  onDelete,
  onAddSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
}: {
  task?: Task;
  /**
   * What a new task starts as. The tracker writes tasks into a column, and the
   * column it was written from is the answer — a task written under "In test"
   * shouldn't arrive as To Do and need moving straight afterwards.
   */
  initialStatus?: TaskStatus;
  /** The steps this task already has, when there is a task to have them. */
  subtasks?: Task[];
  /**
   * Everything on the project, which is what a dependency can point at. A task
   * waits on work in its own plan; the server holds to that too.
   */
  projectTasks?: Task[];
  developers: Developer[];
  /** The labels this project keeps, for the task to wear some of. */
  tags?: ProjectTag[];
  /**
   * Which of a task's fields this project asks about. A field put away isn't
   * offered here — but what is already written in it is kept and sent back
   * untouched, so switching it on again finds everything where it was.
   */
  fields?: TaskFields;
  onClose: () => void;
  /**
   * Writes the task. Answering with a message means it wasn't written — the
   * form stays open, holding everything that was typed, and says so. Closing
   * on a refusal was how a rejected dependency came to look like nothing at
   * all having happened.
   */
  onSubmit: (
    values: TaskFormValues
  ) => void | Promise<void> | Promise<string | null>;
  onDelete?: () => void;
  /**
   * Editing a task writes its steps as they are changed, not on save. Each of
   * these answers the same way the save does — a message when it was refused —
   * and the form shows it in the same place.
   */
  onAddSubtask?: (step: NewStep) => Promise<string | null | void>;
  onUpdateSubtask?: (
    id: string,
    patch: { status?: TaskStatus; title?: string; assigneeIds?: string[] }
  ) => Promise<string | null | void>;
  onDeleteSubtask?: (id: string) => Promise<string | null | void>;
}) {
  const isEdit = Boolean(task);

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [link, setLink] = useState(task?.link ?? "");
  // Blank until somebody says. A new task used to arrive already dated today
  // at both ends, which put a bar on the timeline for work nobody had placed —
  // so the fields start empty and a task without them is simply unplanned.
  const [startDate, setStartDate] = useState(
    task?.startDate ? toISODate(new Date(task.startDate)) : ""
  );
  const [endDate, setEndDate] = useState(
    task?.endDate ? toISODate(new Date(task.endDate)) : ""
  );
  // A task written from a tracker column starts in that column. Nothing else
  // asks, so everywhere else this is To Do, as it was.
  const [status, setStatus] = useState<TaskStatus>(
    task?.status ?? initialStatus ?? "TODO"
  );
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "MEDIUM"
  );
  const [hiddenStatuses] = useHiddenStatuses();
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task?.assigneeIds ?? []
  );
  const [tagIds, setTagIds] = useState<string[]>(task?.tagIds ?? []);
  const [pending, setPending] = useState(false);
  /** Why the last attempt to save didn't happen, when it didn't. */
  const [problem, setProblem] = useState<string | null>(null);

  // How long the work should take. The unit is a way of saying it rather than
  // part of the answer, so the two are held apart: the number is whatever is in
  // the box, and changing the unit rewrites that number instead of quietly
  // meaning something else by it.
  const [estimateUnit, setEstimateUnit] = useState<EstimateUnit>(
    isEstimateUnit(task?.estimateUnit) ? task.estimateUnit : "HOURS"
  );
  const [estimate, setEstimate] = useState(() =>
    amountFor(
      task?.estimateMinutes ?? null,
      isEstimateUnit(task?.estimateUnit) ? task.estimateUnit : "HOURS"
    )
  );
  /** What is in the box right now, as the one quantity that gets stored. */
  const estimateMinutes = toMinutes(estimate, estimateUnit);

  /**
   * Switching hours to days, or back. The length of the job hasn't changed —
   * only the unit it is being said in — so the number is converted rather than
   * left to be read as the other unit's worth of the same digits.
   */
  function changeUnit(next: EstimateUnit) {
    if (next === estimateUnit) return;
    setEstimate(amountFor(estimateMinutes, next));
    setEstimateUnit(next);
  }

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
  const [stepWho, setStepWho] = useState<string[]>([]);

  /** The roster rows behind a list of ids, for the pickers on this form. */
  const peopleOf = (ids: string[]) =>
    ids
      .map((id) => developers.find((d) => d.id === id))
      .filter((d): d is Developer => d != null);

  // A step of a step is a task in its own right, so a subtask's form doesn't
  // offer any — and a project that doesn't break work down isn't asked at all.
  const takesSteps = fields.subtasks && !task?.parentId;

  /** Whether anything at all belongs beside the task. */
  const aside =
    fields.dependencies ||
    takesSteps ||
    (isEdit && (fields.history || fields.comments));

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
    const step: NewStep = { title, assigneeIds: stepWho };
    setStepTitle("");
    if (isEdit && onAddSubtask) {
      // A step is written as it is typed rather than on save, so a refusal has
      // to be said the moment it comes back — otherwise the row simply never
      // appears and nobody is told why.
      const refused = await onAddSubtask(step);
      if (typeof refused === "string") {
        setProblem(refused);
        setStepTitle(title);
      }
    } else setStaged((prev) => [...prev, step]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    // Said here rather than left to the server to refuse, because the server's
    // refusal would arrive after the dialog had closed.
    if (blockedBy.length > LIMITS.blockers) {
      setProblem(`A task can wait on ${LIMITS.blockers} others at most.`);
      return;
    }

    setProblem(null);
    setPending(true);
    const refused = await onSubmit({
      title: title.trim(),
      description: description.trim(),
      link: link.trim(),
      startDate: startDate || null,
      // Guard against an end before the start rather than rejecting the save.
      // With only one end given, that end is the whole of what is known and the
      // other stays empty — half a span is still not a bar.
      endDate: endDate && startDate && endDate < startDate
        ? startDate
        : endDate || null,
      status,
      priority,
      assigneeIds,
      tagIds,
      estimateMinutes,
      estimateUnit,
      blockedBy,
      subtasks: staged,
    });
    setPending(false);
    // A string is the reason it wasn't saved. The dialog stays where it is,
    // with everything still typed into it, and says what the server said.
    if (typeof refused === "string") setProblem(refused);
  }

  return (
    <Modal wide onClose={onClose} title={isEdit ? "Edit task" : "New task"}>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        {/* Two columns while there is something to put in the second. A
            project that asks for neither steps nor dependencies, and keeps
            neither history nor comments, has nothing to say around the task —
            and an empty half of a dialog reads as something failing to load. */}
        <div
          className={`grid gap-5 lg:gap-7 ${
            aside ? "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : ""
          }`}
        >
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

            {fields.tags && (
              <Field label="Tags">
                <TagPicker tags={tags} chosen={tagIds} onChange={setTagIds} />
              </Field>
            )}

            {fields.link && (
              <Field label="Link">
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className="input"
                  placeholder="https://…"
                />
              </Field>
            )}

            {/* When the work runs, if anybody knows yet. Left empty, the task
                is written all the same and the timeline draws no bar for it —
                which is what a plan looks like before it is a plan. Put away,
                the form stops asking and the task keeps whatever it had. */}
            {fields.dates && (
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
            )}

            {/* How long the job should take. One box and one picker: the
                number is the answer and the unit is how it is being said, so
                changing the picker converts what is already typed rather than
                letting the same digits quietly mean eight times as much. */}
            {fields.estimate && (
              // A div rather than a `Field`, which is a label: two controls
              // under one label leaves the second one unnamed, so each carries
              // its own instead.
              <div className="flex flex-col gap-1.5">
                <span className="field-label">Estimate</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.25"
                    value={estimate}
                    onChange={(e) => setEstimate(e.target.value)}
                    className="input min-w-0 flex-1"
                    placeholder="How long?"
                    aria-label={`How long this takes, in ${
                      estimateUnit === "DAYS" ? "days" : "hours"
                    }`}
                  />
                  <select
                    value={estimateUnit}
                    onChange={(e) => changeUnit(e.target.value as EstimateUnit)}
                    className="select w-28 shrink-0"
                    aria-label="Hours or days"
                  >
                    {ESTIMATE_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </span>
                <span className="text-[0.6875rem] text-[var(--ink-muted)]">
                  {estimateMinutes == null
                    ? `Left empty, nobody has guessed. A day is ${HOURS_PER_DAY} hours.`
                    : `= ${otherUnit(estimateMinutes, estimateUnit)}`}
                </span>
              </div>
            )}

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
              {fields.priority && (
                <Field label="Priority" className="flex-1">
                  <PrioritySelect priority={priority} onChange={setPriority} />
                </Field>
              )}
              {/* Up to four people, as a list of names rather than faces:
                  this is the one place with room to say who they are. */}
              <Field label={`On it ${assigneeIds.length}/${MAX_ASSIGNEES}`} className="flex-1">
                <AssigneeField
                  ids={assigneeIds}
                  developers={developers}
                  onChange={setAssigneeIds}
                  taskTitle={title || "this task"}
                />
              </Field>
            </div>
          </div>

          {/* Everything around it. */}
          {aside && (
          <div className="flex min-w-0 flex-col gap-4">
            {fields.dependencies && (
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
            )}

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
                    <span className="shrink-0">
                      <AssigneePicker
                        assignees={peopleOf(step.assigneeIds)}
                        developers={developers}
                        onChange={(assigneeIds) =>
                          onUpdateSubtask?.(step.id, { assigneeIds })
                        }
                        taskTitle={step.title}
                        size={18}
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteSubtask?.(step.id)}
                      className="shrink-0 rounded p-1 text-[var(--ink-muted)] transition hover:text-[var(--danger)]"
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
                    <span className="shrink-0">
                      <AssigneePicker
                        assignees={peopleOf(step.assigneeIds)}
                        developers={developers}
                        onChange={(ids) =>
                          setStaged((prev) =>
                            prev.map((s, n) =>
                              n === i ? { ...s, assigneeIds: ids } : s
                            )
                          )
                        }
                        taskTitle={step.title}
                        size={18}
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setStaged((prev) => prev.filter((_, n) => n !== i))
                      }
                      className="shrink-0 rounded p-1 text-[var(--ink-muted)] transition hover:text-[var(--danger)]"
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
                  <span className="shrink-0">
                    <AssigneePicker
                      assignees={peopleOf(stepWho)}
                      developers={developers}
                      onChange={setStepWho}
                      taskTitle="the next step"
                      size={18}
                    />
                  </span>
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

            {/* What happened to this task, under the work it is made of, and
                what people made of it under that. Both need a task to hang off,
                so neither appears until there is one. */}
            {isEdit && task && (
              <>
                {fields.history && <TaskHistory taskId={task.id} />}
                {fields.comments && <TaskComments taskId={task.id} />}
              </>
            )}
          </div>
          )}
        </div>

        {/* Where a refusal lands: beside the button that was pressed, in the
            dialog that still holds the work, rather than as a note that flashes
            up somewhere else after the form has already closed. */}
        {problem && (
          <p
            role="alert"
            className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-[0.75rem] leading-relaxed text-[var(--danger)]"
          >
            {problem} Nothing has been saved — the dialog is as you left it.
          </p>
        )}

        <div className="mt-1 flex items-center justify-end gap-2 border-t border-[var(--hairline)] pt-4">
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="btn-secondary mr-auto !text-[var(--danger)]"
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
  /** This task's start, for saying when a blocker finishes after it. Empty
   *  where this task has no dates, and then there is nothing to be late for. */
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
          blocker?.endDate != null &&
          startDate !== "" &&
          toISODate(new Date(blocker.endDate)) >= startDate;
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
                    late ? "text-[var(--danger)]" : "text-[var(--ink-muted)]"
                  }`}
                >
                  {blocker.endDate == null
                    ? "No dates yet"
                    : late
                      ? `Finishes ${formatDay(blocker.endDate)} — after this starts`
                      : `Finishes ${formatDay(blocker.endDate)}`}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onRemove(id)}
              className="shrink-0 rounded p-1 text-[var(--ink-muted)] transition hover:text-[var(--danger)]"
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

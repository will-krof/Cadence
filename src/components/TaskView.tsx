"use client";

import { useMemo } from "react";
import { formatRange } from "@/lib/dates";
import { isHttpUrl } from "@/lib/sanitize";
import { formatEstimate, inUnit, isEstimateUnit } from "@/lib/estimate";
import { ALL_TASK_FIELDS, Task, TaskFields, priorityMeta, statusMeta } from "@/lib/types";
import { AvatarStack, Modal, PriorityMark, TagChip } from "@/components/ui";
import { TaskHistory } from "@/components/TaskHistory";
import { TaskComments } from "@/components/TaskComments";

/**
 * A task as a card: everything it says, and nothing to type in.
 *
 * Opening a task and changing one are two different intentions, and the form
 * was answering both — which meant a role that may only watch a board was shown
 * a screen of inputs whose every save would be refused, and a role that may
 * change one had to read its own work through form fields. So a click opens
 * this, and the pencil opens the form.
 *
 * Comments are the exception, and they sit here in full. Saying something about
 * a task is not changing it: the card is where reading happens, so it is where
 * the conversation belongs, whatever the reader's role lets them do next.
 */
export function TaskView({
  task,
  subtasks,
  projectTasks,
  canEdit,
  fields = ALL_TASK_FIELDS,
  onEdit,
  onClose,
}: {
  task: Task;
  /** The steps this task is made of. */
  subtasks: Task[];
  /** The plan around it, for naming what it waits on and what waits on it. */
  projectTasks: Task[];
  /** Whether this viewer's role lets them change the work at all. */
  canEdit: boolean;
  /** Which of a task's fields this project asks about — the rest aren't drawn. */
  fields?: TaskFields;
  onEdit: () => void;
  onClose: () => void;
}) {
  const byId = useMemo(
    () => new Map(projectTasks.map((t) => [t.id, t])),
    [projectTasks]
  );
  const blocking = useMemo(
    () => projectTasks.filter((t) => t.blockedBy.includes(task.id)),
    [projectTasks, task.id]
  );

  const status = statusMeta(task.status);
  const priority = priorityMeta(task.priority);
  const link = isHttpUrl(task.link) ? task.link : null;
  const done = subtasks.filter((s) => s.status === "DONE").length;
  /** Whether anything at all belongs beside the task, as on the form. */
  const aside =
    fields.dependencies ||
    (fields.subtasks && subtasks.length > 0) ||
    fields.history ||
    fields.comments;

  return (
    // The dialog is headed "Task", the way the form is headed "Edit task" — the
    // title itself leads the card rather than being said twice.
    <Modal wide onClose={onClose} title="Task">
      <div className="flex flex-col gap-5">
        <div
          className={`grid gap-5 lg:gap-7 ${
            aside ? "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : ""
          }`}
        >
          {/* The task itself. */}
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="flex items-start gap-2 text-[1.0625rem] font-medium leading-snug">
                {fields.priority && (
                  <span className="mt-1 shrink-0">
                    <PriorityMark priority={task.priority} />
                  </span>
                )}
                <span className="min-w-0 break-words">{task.title}</span>
              </h2>

              {/* What it is, in one line: where the work is, how much it wants
                  doing first, when it runs, and whose it is. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.75rem]">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] px-2 py-0.5"
                  style={{
                    background: `color-mix(in srgb, ${status.color} 12%, var(--surface-raised))`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: status.color }}
                    aria-hidden="true"
                  />
                  {status.label}
                </span>
                {fields.priority && (
                  <span className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[var(--ink-secondary)]">
                    {priority.label} priority
                  </span>
                )}
                {fields.dates && task.startDate && task.endDate && (
                  <span className="tabular-nums text-[var(--ink-muted)]">
                    {formatRange(task.startDate, task.endDate)}
                  </span>
                )}
                {/* How long it should take, said in the unit it was written
                    in, with the plain reading of it in the tooltip. */}
                {fields.estimate && task.estimateMinutes != null && (
                  <span
                    className="rounded-full border border-[var(--hairline)] px-2 py-0.5 tabular-nums text-[var(--ink-secondary)]"
                    title={estimateTitle(task.estimateMinutes, task.estimateUnit)}
                  >
                    {formatEstimate(task.estimateMinutes)}
                  </span>
                )}
                <span className="text-[var(--ink-muted)]">
                  ·{" "}
                  {task.assignees.length > 0 ? (
                    <span className="text-[var(--ink-secondary)]">
                      {task.assignees.map((d) => d.name).join(", ")}
                    </span>
                  ) : (
                    "Nobody on it"
                  )}
                </span>
              </div>
            </div>

            {fields.tags && task.tags.length > 0 && (
              <Block label="Tags">
                <span className="flex flex-wrap gap-1.5">
                  {task.tags.map((tag) => (
                    <TagChip key={tag.id} tag={tag} />
                  ))}
                </span>
              </Block>
            )}

            <Block label="Description">
              {task.description ? (
                /* Read as written: the line breaks somebody typed are part of
                   what they wrote down. */
                <p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-relaxed">
                  {task.description}
                </p>
              ) : (
                <Empty>Nothing written down.</Empty>
              )}
            </Block>

            {fields.link && link && (
              <Block label="Link">
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-[0.8125rem] text-[var(--accent)] hover:underline"
                >
                  {link}
                </a>
              </Block>
            )}
          </div>

          {/* Everything around it, in the order the form puts it in. */}
          {aside && (
          <div className="flex min-w-0 flex-col gap-4">
            {fields.dependencies && (
            <Block label="Dependencies">
              {task.blockedBy.length === 0 && blocking.length === 0 ? (
                <Empty>Nothing is holding this up.</Empty>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {task.blockedBy.map((id) => (
                    <span
                      key={id}
                      className="flex items-center gap-2 text-[0.8125rem]"
                    >
                      <span
                        className="shrink-0 text-[var(--ink-muted)]"
                        aria-hidden="true"
                      >
                        ⇢
                      </span>
                      <span className="truncate">
                        Waits on {byId.get(id)?.title ?? "a task on another board"}
                      </span>
                    </span>
                  ))}
                  {blocking.map((t) => (
                    <span
                      key={t.id}
                      className="flex items-center gap-2 text-[0.8125rem] text-[var(--ink-secondary)]"
                    >
                      <span
                        className="shrink-0 text-[var(--ink-muted)]"
                        aria-hidden="true"
                      >
                        ⇠
                      </span>
                      <span className="truncate">Blocks {t.title}</span>
                    </span>
                  ))}
                </div>
              )}
            </Block>
            )}

            {fields.subtasks && subtasks.length > 0 && (
              <Block label={`Subtasks ${done}/${subtasks.length}`}>
                <ul className="flex flex-col gap-1">
                  {subtasks.map((step) => (
                    <li
                      key={step.id}
                      className="flex items-center gap-2 text-[0.8125rem]"
                    >
                      <span
                        className="shrink-0 text-[var(--ink-muted)]"
                        aria-hidden="true"
                      >
                        {step.status === "DONE" ? "☑" : "☐"}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate ${
                          step.status === "DONE"
                            ? "text-[var(--ink-muted)] line-through"
                            : ""
                        }`}
                      >
                        {step.title}
                      </span>
                      {step.assignees.length > 0 && (
                        <span className="shrink-0">
                          <AvatarStack people={step.assignees} size={16} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Block>
            )}

            {fields.history && <TaskHistory taskId={task.id} />}
            {/* Open to anybody who got this far: reading a board is enough. */}
            {fields.comments && <TaskComments taskId={task.id} />}
          </div>
          )}
        </div>

        <div className="mt-1 flex items-center justify-end gap-2 border-t border-[var(--hairline)] pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
          {canEdit && (
            <button type="button" onClick={onEdit} className="btn-primary">
              Edit task
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * An estimate said in full, for the chip's tooltip: the number as it was
 * typed, and the same length in the other unit — which is the question anybody
 * reading "2d" next to somebody else's "12h" is about to ask.
 */
function estimateTitle(minutes: number, unit: string | null) {
  const written = isEstimateUnit(unit) ? unit : "HOURS";
  const hours = inUnit(minutes, "HOURS");
  const days = inUnit(minutes, "DAYS");
  return written === "DAYS"
    ? `Estimated ${days} days — ${hours} hours`
    : `Estimated ${hours} hours — ${days} days`;
}

/** One labelled thing the card has to say, headed the way the form heads its fields. */
function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5 border-t border-[var(--hairline)] pt-3">
      <h3 className="field-label">{label}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.75rem] text-[var(--ink-muted)]">{children}</p>
  );
}

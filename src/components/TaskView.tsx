"use client";

import { useMemo } from "react";
import { formatRange } from "@/lib/dates";
import { isHttpUrl } from "@/lib/sanitize";
import { formatEstimate, inUnit, isEstimateUnit } from "@/lib/estimate";
import {
  ALL_TASK_FIELDS,
  ProjectColumn,
  Task,
  TaskFields,
  UNSORTED_COLOR,
  UNSORTED_LABEL,
  columnMeta,
  doneColumnIds,
  priorityMeta,
} from "@/lib/types";
import { AvatarStack, Modal, Section, TagChip } from "@/components/ui";
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
 * It is laid out to be *read*, which is a different job from the form's. The
 * title leads, everything the task is answers underneath it on one line of
 * chips, and the rest is two columns of short sections. Nothing here is more
 * than a glance wide: a description is a paragraph, not a page, and a card
 * stretched over a whole desk to hold one is a card that reads as empty.
 *
 * Comments are the exception, and they sit here in full. Saying something about
 * a task is not changing it: the card is where reading happens, so it is where
 * the conversation belongs, whatever the reader's role lets them do next.
 */

/** A stable empty board, so a default can't churn the memos below. */
const NO_COLUMNS: ProjectColumn[] = [];

export function TaskView({
  task,
  subtasks,
  projectTasks,
  columns = NO_COLUMNS,
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
  /** The board's columns, for saying which one the task stands in. */
  columns?: ProjectColumn[];
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

  // Where the work stands, in the project's own words. A task whose column was
  // deleted says so rather than claiming a state it isn't in.
  const column = columnMeta(columns, task.columnId);
  const columnName = column?.name ?? UNSORTED_LABEL;
  const columnColor = column?.color ?? UNSORTED_COLOR;
  const priority = priorityMeta(task.priority);
  const link = isHttpUrl(task.link) ? task.link : null;
  const doneIds = useMemo(() => doneColumnIds(columns), [columns]);
  const isStepDone = (step: Task) =>
    step.columnId != null && doneIds.has(step.columnId);
  const done = subtasks.filter(isStepDone).length;

  const hasDeps =
    fields.dependencies && (task.blockedBy.length > 0 || blocking.length > 0);
  const hasSteps = fields.subtasks && subtasks.length > 0;
  /** Whether anything at all belongs in the second column. */
  const aside = hasDeps || hasSteps || fields.history || fields.comments;

  return (
    // The dialog heads itself: a task's title is the heading, and a strip
    // saying "Task" above it was a line spent on nothing.
    <Modal size="read" heading={false} onClose={onClose} title={task.title}>
      <div className="flex flex-col gap-4">
        <header className="flex min-w-0 flex-col gap-2.5 pr-7">
          <h2 className="min-w-0 break-words text-[1.0625rem] font-semibold leading-snug tracking-tight">
            {task.title}
          </h2>

          {/* What the task is, on one line: where it stands, how much it wants
              doing first, when it runs, how long it should take, and whose it
              is. Chips of one shape and one size — the row is scanned, not
              read, and a row of different-shaped pills is a row you re-read. */}
          <div className="flex flex-wrap items-center gap-1.5 text-[0.75rem]">
            <Chip color={columnColor} strong>
              {columnName}
            </Chip>
            {fields.priority && task.priority !== "MEDIUM" && (
              <Chip color={priority.color}>{priority.label}</Chip>
            )}
            {fields.dates && task.startDate && task.endDate && (
              <Chip>
                <span className="tabular-nums">
                  {formatRange(task.startDate, task.endDate)}
                </span>
              </Chip>
            )}
            {fields.estimate && task.estimateMinutes != null && (
              <Chip
                title={estimateTitle(task.estimateMinutes, task.estimateUnit)}
              >
                <span className="tabular-nums">
                  {formatEstimate(task.estimateMinutes)}
                </span>
              </Chip>
            )}
            {/* Faces rather than a list of names: four of them fit where two
                names did, and the names are a hover away on each. */}
            {task.assignees.length > 0 ? (
              <span className="ml-0.5 flex items-center gap-1.5">
                <AvatarStack people={task.assignees} size={20} />
                <span className="truncate text-[var(--ink-muted)]">
                  {task.assignees.map((d) => d.name.split(" ")[0]).join(", ")}
                </span>
              </span>
            ) : (
              <span className="text-[var(--ink-muted)]">Nobody on it</span>
            )}
          </div>

          {fields.tags && task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.tags.map((tag) => (
                <TagChip key={tag.id} tag={tag} />
              ))}
            </div>
          )}
        </header>

        <div
          className={`grid min-w-0 gap-x-6 gap-y-4 ${
            aside ? "lg:grid-cols-2" : ""
          }`}
        >
          <div className="flex min-w-0 flex-col gap-4">
            <Section title="Description">
              {task.description ? (
                /* Read as written: the line breaks somebody typed are part of
                   what they wrote down. */
                <p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
                  {task.description}
                </p>
              ) : (
                <Empty>Nothing written down.</Empty>
              )}
            </Section>

            {/* The address itself is rarely worth the three lines it wraps to.
                What is worth reading is where it goes, so the chip says the
                host and the tail of the path, and the whole thing is the
                tooltip and the link. */}
            {fields.link && link && (
              <Section title="Link">
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--surface)] px-2.5 py-1 text-[0.75rem] text-[var(--accent)] transition hover:border-[var(--baseline)]"
                >
                  <span className="truncate">{shortLink(link)}</span>
                  <span aria-hidden="true" className="shrink-0 leading-none">
                    ↗
                  </span>
                </a>
              </Section>
            )}
          </div>

          {aside && (
            <div className="flex min-w-0 flex-col gap-4">
              {hasDeps && (
                <Section title="Dependencies">
                  <ul className="flex flex-col gap-1">
                    {task.blockedBy.map((id) => {
                      const blocker = byId.get(id);
                      // Waiting on something finished is not being held up, and
                      // the difference is the whole reason to read this list.
                      const held =
                        blocker != null &&
                        !(blocker.columnId != null && doneIds.has(blocker.columnId));
                      return (
                        <Row
                          key={id}
                          lead={held ? "Blocked by" : "Waited on"}
                          title={blocker?.title ?? "A task on another board"}
                          tone={held ? "held" : "muted"}
                        />
                      );
                    })}
                    {blocking.map((t) => (
                      <Row key={t.id} lead="Blocks" title={t.title} tone="plain" />
                    ))}
                  </ul>
                </Section>
              )}

              {hasSteps && (
                <Section
                  title="Subtasks"
                  count={`${done}/${subtasks.length}`}
                  /* How far along, as a short bar beside the count rather than
                     a rule across the column — at 0/1 a full-width track reads
                     as a divider somebody left behind. */
                  meter={
                    <span
                      className="inline-block h-1 w-10 overflow-hidden rounded-full bg-[var(--gridline)] align-middle"
                      role="img"
                      aria-label={`${done} of ${subtasks.length} steps done`}
                    >
                      <span
                        className="block h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                        style={{ width: `${(done / subtasks.length) * 100}%` }}
                      />
                    </span>
                  }
                >
                  <ul className="flex flex-col gap-1">
                    {subtasks.map((step) => {
                      const stepDone = isStepDone(step);
                      return (
                        <li
                          key={step.id}
                          className="flex items-center gap-2 text-[0.8125rem]"
                        >
                          <Tick done={stepDone} />
                          <span
                            className={`min-w-0 flex-1 truncate ${
                              stepDone
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
                      );
                    })}
                  </ul>
                </Section>
              )}

              {fields.history && <TaskHistory taskId={task.id} />}
              {/* Open to anybody who got this far: reading a board is enough. */}
              {fields.comments && <TaskComments taskId={task.id} />}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--hairline)] pt-3.5">
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
 * One fact about the task, as a chip. All the same height and all the same
 * shape; the only thing that varies is the dot, and only where a colour means
 * something the words are already saying.
 */
function Chip({
  children,
  color,
  strong = false,
  title,
}: {
  children: React.ReactNode;
  color?: string;
  /** The one chip that carries its colour as a wash: where the work stands. */
  strong?: boolean;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex h-[1.375rem] items-center gap-1.5 rounded-full border px-2 ${
        strong
          ? "border-transparent font-medium"
          : "border-[var(--hairline)] text-[var(--ink-secondary)]"
      }`}
      style={
        strong && color
          ? {
              background: `color-mix(in srgb, ${color} 16%, transparent)`,
              borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
            }
          : undefined
      }
      title={title}
    >
      {color && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: color }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}

/**
 * One line of a short list: what the link is, and the task at the other end of
 * it. The lead is a small chip so the two halves don't have to be told apart by
 * reading them — and it is the only thing here that ever wears a colour, on the
 * one case that changes what you do next: work that is held up right now.
 */
function Row({
  lead,
  title,
  tone,
}: {
  lead: string;
  title: string;
  tone: "held" | "muted" | "plain";
}) {
  return (
    <li
      className="flex items-baseline gap-2 text-[0.8125rem]"
      title={`${lead} ${title}`}
    >
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-medium ${
          tone === "held"
            ? "text-[var(--danger)]"
            : "text-[var(--ink-muted)]"
        }`}
        style={
          tone === "held"
            ? { background: "color-mix(in srgb, var(--danger) 12%, transparent)" }
            : { background: "var(--plane)" }
        }
      >
        {lead}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${
          tone === "muted" ? "text-[var(--ink-secondary)]" : ""
        }`}
      >
        {title}
      </span>
    </li>
  );
}

/** A step's box, ticked or not. Drawn rather than typed, so it lines up. */
function Tick({ done }: { done: boolean }) {
  return (
    <span
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border ${
        done
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--baseline)]"
      }`}
      aria-hidden="true"
    >
      {done && (
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <path
            d="M1.5 5.2l2.4 2.3L8.5 2.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
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

/**
 * A link as it is worth reading: where it goes, and enough of the end of the
 * path to tell two of them apart. The whole address is still the link, and
 * still the tooltip — this is about what a card shows, not what it holds.
 */
function shortLink(link: string) {
  try {
    const url = new URL(link);
    const host = url.host.replace(/^www\./, "");
    const path = url.pathname.replace(/\/$/, "");
    if (!path) return host;
    const parts = path.split("/").filter(Boolean);
    const tail = parts.slice(-2).join("/");
    return `${host}/${parts.length > 2 ? "…/" : ""}${tail}`;
  } catch {
    return link;
  }
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[0.75rem] text-[var(--ink-muted)]">{children}</p>;
}

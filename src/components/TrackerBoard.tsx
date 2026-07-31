"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import {
  AssigneePicker,
  AvatarStack,
  TagChip,
  CloseIcon,
  PriorityMark,
  SprintPicker,
  StatusPill,
} from "@/components/ui";
import { TaskEditModal } from "@/components/TaskEditModal";
import {
  Developer,
  STATUS_OPTIONS,
  Task,
  TaskFields,
  TaskStatus,
  taskFields,
} from "@/lib/types";
import { useHiddenStatuses } from "@/lib/prefs";
import { formatDay, formatDayShort } from "@/lib/dates";
import { isHttpUrl } from "@/lib/sanitize";

/** Pointer travel before a press turns into a drag rather than a click. */
const DRAG_THRESHOLD = 5;
/** Cards built per column up front; more follow as the column is scrolled. */
const COLUMN_PAGE = 25;

interface DragState {
  taskId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  active: boolean;
}

export function TrackerBoard({ canEdit = true }: { canEdit?: boolean }) {
  const {
    activeProject,
    tasks,
    assignable: developers,
    sprints,
    sprint,
    sprintId,
    hasUnplanned,
    selectSprint,
    updateTask,
  } = useBoard();
  const [assignee, setAssignee] = useState("");
  // Which of a task's fields this project asks about, read once for the board.
  const fields = useMemo(() => taskFields(activeProject), [activeProject]);
  // Only the identity of what is being dragged lives in state; where it is
  // lives in a ref and goes straight to the preview element.
  const [dragging, setDragging] = useState<{
    taskId: string;
    width: number;
    /** Where the preview starts; later moves are written to the element. */
    x: number;
    y: number;
  } | null>(null);
  // The task on screen, and whether it was opened to be read or to be changed.
  // A click on a card asks for the first; the pencil asks for the second.
  const [opened, setOpened] = useState<{ id: string; editing: boolean } | null>(
    null
  );
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const visible = useMemo(
    () =>
      assignee
        ? tasks.filter((t) => t.assigneeIds.includes(assignee))
        : tasks,
    [tasks, assignee]
  );

  // Columns somebody has put away. A board with five statuses is wider than a
  // laptop; hiding the two nobody is looking at is cheaper than scrolling past
  // them. Nothing is filtered out of the data — a hidden column's tasks are
  // still there, still countable, and still a drop away once it is back.
  //
  // The choice is remembered, and it is the same choice the timeline reads: a
  // status put away here stops being one of the states work is counted in.
  const [hidden, { hide: hideColumn, show: showColumn, showAll }] =
    useHiddenStatuses();

  /**
   * What a card says about the steps around it: how far a task's own steps
   * have got, and which task a step belongs to — a column sorts by status, so
   * a step can sit a long way from its parent.
   */
  const stepCounts = useMemo(() => {
    const counts = new Map<string, { done: number; total: number }>();
    for (const task of tasks) {
      if (!task.parentId) continue;
      const at = counts.get(task.parentId) ?? { done: 0, total: 0 };
      at.total++;
      if (task.status === "DONE") at.done++;
      counts.set(task.parentId, at);
    }
    return counts;
  }, [tasks]);

  const titles = useMemo(
    () => new Map(tasks.map((t) => [t.id, t.title])),
    [tasks]
  );

  const columns = useMemo(
    () =>
      STATUS_OPTIONS.map((s) => ({
        ...s,
        items: visible.filter((t) => t.status === s.value),
      })),
    [visible]
  );

  const shownColumns = columns.filter((c) => !hidden.includes(c.value));
  const hiddenColumns = columns.filter((c) => hidden.includes(c.value));

  /** Column under the given viewport point, if any. */
  function statusAtPoint(x: number, y: number): TaskStatus | null {
    const el = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-status]");
    return (el?.dataset.status as TaskStatus | undefined) ?? null;
  }

  /**
   * Pointer events (rather than HTML5 drag-and-drop) so dragging works with
   * touch and pen as well as a mouse. The preview follows the pointer through
   * its own element: putting the coordinates in state re-rendered every card in
   * every column on every move.
   */
  const beginDrag = useCallback(
    (state: DragState) => {
      // Watching a board is not working in it: a role without the right to
      // change a task can read the columns but not shuffle them.
      if (!canEdit) return;
      dragRef.current = state;

      function place(x: number, y: number) {
        const el = previewRef.current;
        const d = dragRef.current;
        if (!el || !d) return;
        el.style.transform = `translate3d(${x - d.offsetX}px, ${y - d.offsetY}px, 0)`;
      }

      function onMove(e: PointerEvent) {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.pointerId) return;

        if (!d.active) {
          const moved =
            Math.abs(e.clientX - d.startX) > DRAG_THRESHOLD ||
            Math.abs(e.clientY - d.startY) > DRAG_THRESHOLD;
          if (!moved) return;
          d.active = true;
          // One render to mount the preview and dim the card it came from.
          setDragging({
            taskId: d.taskId,
            width: d.width,
            x: e.clientX - d.offsetX,
            y: e.clientY - d.offsetY,
          });
        }

        e.preventDefault();
        d.x = e.clientX;
        d.y = e.clientY;
        place(e.clientX, e.clientY);
        setDropTarget(statusAtPoint(e.clientX, e.clientY));
      }

      function finish() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        dragRef.current = null;
        setDragging(null);
        setDropTarget(null);
      }

      function onUp(e: PointerEvent) {
        const d = dragRef.current;
        const wasActive = d?.active === true;
        finish();
        if (!d || e.pointerId !== d.pointerId || !wasActive) return;

        const status = statusAtPoint(e.clientX, e.clientY);
        if (!status) return;
        const task = tasksRef.current.find((t) => t.id === d.taskId);
        if (!task || task.status === status) return;
        updateTask(d.taskId, { status });
      }

      function onCancel() {
        finish();
      }

      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [updateTask, canEdit]
  );

  // Stable per-board handlers, so a card only re-renders when its own task
  // changes — not whenever the drop target moves.
  const handleStatus = useCallback(
    (id: string, status: TaskStatus) => updateTask(id, { status }),
    [updateTask]
  );
  const handleAssign = useCallback(
    (id: string, assigneeIds: string[]) => updateTask(id, { assigneeIds }),
    [updateTask]
  );
  const handleOpen = useCallback(
    (id: string) => setOpened({ id, editing: false }),
    []
  );
  const handleEdit = useCallback(
    (id: string) => setOpened({ id, editing: true }),
    []
  );

  const draggedTask = dragging
    ? tasks.find((t) => t.id === dragging.taskId) ?? null
    : null;

  const openedTask = tasks.find((t) => t.id === opened?.id) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--hairline)] px-4 py-3 sm:px-6">
        {/* Only where the work is planned in rounds. */}
        {activeProject?.hasSprints !== false && (
          <SprintPicker
            sprints={sprints}
            sprint={sprint}
            sprintId={sprintId}
            hasUnplanned={hasUnplanned}
            onSelect={selectSprint}
          />
        )}
        <label className="flex flex-col gap-1">
          <span className="field-label">Filter by person</span>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="select w-48"
          >
            <option value="">Everyone</option>
            {developers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <span className="pb-2 text-[0.6875rem] text-[var(--ink-muted)]">
          {visible.length} {visible.length === 1 ? "task" : "tasks"} · drag cards
          between columns
        </span>

        {/* Bringing a column back, and saying what is hidden while it is. */}
        {hiddenColumns.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5 pb-1.5">
            <span className="field-label">Hidden</span>
            {hiddenColumns.map((col) => (
              <button
                key={col.value}
                onClick={() => showColumn(col.value)}
                className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[0.6875rem] text-[var(--ink-secondary)] transition hover:border-[var(--baseline)] hover:text-[var(--ink)]"
                title={`Show the ${col.label} column`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: col.color }}
                />
                {col.label}
                <span className="tabular-nums text-[var(--ink-muted)]">
                  {col.items.length}
                </span>
              </button>
            ))}
            <button
              onClick={showAll}
              className="text-[0.6875rem] text-[var(--accent)] hover:underline"
            >
              Show all
            </button>
          </span>
        )}
      </div>

      <div className="thin-scroll flex flex-1 gap-3 overflow-x-auto p-4 sm:gap-4 sm:p-6">
        {shownColumns.map((col) => {
          const isTarget = dropTarget === col.value;
          return (
            <section
              key={col.value}
              data-status={col.value}
              className={`flex w-[17rem] shrink-0 flex-col rounded-[var(--radius-lg)] border transition-colors ${
                isTarget
                  ? "border-[var(--accent)] bg-[var(--accent-wash)]"
                  : "border-[var(--hairline)] bg-[var(--plane)]"
              }`}
            >
              <header className="flex items-center gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: col.color }}
                />
                <h3 className="text-[0.75rem] font-semibold tracking-tight">
                  {col.label}
                </h3>
                <span className="ml-auto rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[0.6875rem] tabular-nums text-[var(--ink-secondary)]">
                  {col.items.length}
                </span>
                {/* The last column standing keeps its cards reachable: there is
                    nowhere to drag to on an empty board. */}
                {shownColumns.length > 1 && (
                  <button
                    onClick={() => hideColumn(col.value)}
                    className="rounded p-0.5 text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
                    aria-label={`Hide the ${col.label} column`}
                    title="Hide this column"
                  >
                    <CloseIcon size={11} />
                  </button>
                )}
              </header>

              <Column count={col.items.length} isTarget={isTarget}>
                {col.items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    steps={fields.subtasks ? stepCounts.get(task.id) : undefined}
                    hiddenStatuses={hidden}
                    canEdit={canEdit}
                    parentTitle={
                      task.parentId ? titles.get(task.parentId) : undefined
                    }
                    dragging={dragging?.taskId === task.id}
                    onDragStart={beginDrag}
                    onStatusChange={handleStatus}
                    onAssign={handleAssign}
                    fields={fields}
                    onOpen={handleOpen}
                    onEdit={handleEdit}
                    developers={developers}
                  />
                ))}
              </Column>
            </section>
          );
        })}
      </div>

      {/* Drag preview follows the pointer and must not intercept hit-testing. */}
      {draggedTask && dragging && (
        <div
          ref={previewRef}
          className="pointer-events-none fixed left-0 top-0 z-50 rotate-2 rounded-[var(--radius)] border border-[var(--accent)] bg-[var(--surface-raised)] p-2.5 shadow-xl"
          style={{
            width: dragging.width,
            transform: `translate3d(${dragging.x}px, ${dragging.y}px, 0)`,
          }}
        >
          <div className="flex items-center gap-2">
            {draggedTask.assignees.length > 0 && (
              <AvatarStack people={draggedTask.assignees} size={18} />
            )}
            <p className="text-[0.8125rem] font-medium leading-snug">
              {draggedTask.title}
            </p>
          </div>
        </div>
      )}

      {openedTask && opened && (
        <TaskEditModal
          task={openedTask}
          canEdit={canEdit}
          fields={fields}
          editing={opened.editing}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}

/**
 * A column renders a page of its cards and asks for more as it nears its own
 * bottom, so opening a board with hundreds of tasks costs a screenful, not all
 * of them.
 */
function Column({
  count,
  isTarget,
  children,
}: {
  count: number;
  isTarget: boolean;
  children: React.ReactNode[];
}) {
  // Only ever a ceiling: if a filter shortens the column, slicing takes care
  // of it without resetting what has already been shown.
  const [shown, setShown] = useState(COLUMN_PAGE);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
      setShown((prev) => (prev >= count ? prev : prev + COLUMN_PAGE));
    }
  }

  return (
    <div
      onScroll={onScroll}
      className="thin-scroll flex flex-1 flex-col gap-2 overflow-y-auto p-2"
    >
      {children.slice(0, shown)}
      {count === 0 && (
        <p className="px-1 py-3 text-[0.75rem] text-[var(--ink-muted)]">
          {isTarget ? "Drop here" : "Nothing here."}
        </p>
      )}
    </div>
  );
}

const TaskCard = memo(function TaskCard({
  task,
  steps,
  parentTitle,
  hiddenStatuses,
  canEdit,
  developers,
  fields,
  dragging,
  onDragStart,
  onStatusChange,
  onAssign,
  onOpen,
  onEdit,
}: {
  task: Task;
  /** How many of this task's steps are done, when it has any. */
  steps?: { done: number; total: number };
  /** The task this card is a step of, when it is one. */
  parentTitle?: string;
  /** Read once for the board and handed down, not read per card. */
  hiddenStatuses: TaskStatus[];
  /** Whether this viewer may change the work, or only read it. */
  canEdit: boolean;
  developers: Developer[];
  /** What this project asks a task for; a field put away is not drawn. */
  fields: TaskFields;
  dragging: boolean;
  onDragStart: (state: DragState) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onAssign: (id: string, assigneeIds: string[]) => void;
  /** Reading the task: what a click on the card asks for. */
  onOpen: (id: string) => void;
  /** Changing it: the pencil, which only a role that may is shown. */
  onEdit: (id: string) => void;
}) {
  // Null where the work hasn't been placed in time, and the card then says
  // nothing about when it runs rather than inventing a day for it.
  const start = task.startDate ? formatDayShort(task.startDate) : null;
  const end = task.endDate ? formatDay(task.endDate) : null;

  // Where the press landed, so the click that follows can tell a click from the
  // end of a drag. The board's own threshold decides whether the task moved;
  // this one decides whether the card should open, and they have to agree.
  const pressedAt = useRef<{ x: number; y: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent<HTMLElement>) {
    // Let the selects, links and delete button behave normally.
    if ((e.target as HTMLElement).closest("select, button, a, input")) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;

    pressedAt.current = { x: e.clientX, y: e.clientY };
    const rect = e.currentTarget.getBoundingClientRect();
    onDragStart({
      taskId: task.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      active: false,
    });
  }

  // Checked here as well as on the way in: a card title is a link to whatever
  // the row holds, and only http and https belong in one.
  const link = isHttpUrl(task.link) ? task.link : null;

  /** A press that stayed put is a click: open the card, don't move the task. */
  function handleClick(e: React.MouseEvent<HTMLElement>) {
    const from = pressedAt.current;
    pressedAt.current = null;
    if ((e.target as HTMLElement).closest("select, button, a, input")) return;
    if (
      from &&
      (Math.abs(e.clientX - from.x) > DRAG_THRESHOLD ||
        Math.abs(e.clientY - from.y) > DRAG_THRESHOLD)
    ) {
      return;
    }
    onOpen(task.id);
  }

  return (
    <article
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      // A column can hold hundreds of cards; this lets the browser skip
      // rendering the ones scrolled out of view, at their reserved height.
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 132px" }}
      // touch-none keeps a touch drag from scrolling the column instead.
      className={`group touch-none rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-2.5 shadow-sm transition select-none ${
        dragging
          ? "opacity-40"
          : canEdit
            ? "cursor-grab hover:border-[var(--baseline)] active:cursor-grabbing"
            : "hover:border-[var(--baseline)]"
      }`}
    >
      {parentTitle && (
        <p
          className="mb-1 flex items-center gap-1 truncate text-[0.6875rem] text-[var(--ink-muted)]"
          title={`A step of ${parentTitle}`}
        >
          <span aria-hidden="true">↳</span>
          {parentTitle}
        </p>
      )}
      <div className="flex items-start gap-1.5">
        {/* A column already says where the work is; this says which of two
            cards in it gets picked up first. */}
        {fields.priority && (
          <span className="mt-0.5">
            <PriorityMark priority={task.priority} />
          </span>
        )}
        <h4 className="flex-1 text-[0.8125rem] font-medium leading-snug">
          {task.title}
        </h4>
        {/* Clicking a card opens the task, whether or not it carries a link, so
            the link keeps its own mark rather than swallowing the title. */}
        {fields.link && link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 shrink-0 text-[0.8125rem] leading-none text-[var(--accent)] hover:underline"
            title={link}
            aria-label={`Open the link on ${task.title}`}
          >
            ↗
          </a>
        )}
        {steps && (
          <span
            className="mt-0.5 shrink-0 rounded-full border border-[var(--hairline)] px-1.5 text-[0.625rem] tabular-nums text-[var(--ink-muted)]"
            title={`${steps.done} of ${steps.total} steps done`}
          >
            {steps.done}/{steps.total}
          </span>
        )}
        {/* Reading a task is a click on the card; the pencil is for changing
            it, so only a role that may is offered one. */}
        {canEdit && (
          <button
            onClick={() => onEdit(task.id)}
            className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--ink-muted)] opacity-0 transition hover:text-[var(--ink)] focus-visible:opacity-100 group-hover:opacity-100"
            aria-label={`Edit ${task.title}`}
            title="Edit task"
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path
                d="M9.2 1.8l3 3L4.8 12.2 1.4 12.6l.4-3.4 7.4-7.4z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* A card has the width for the words themselves — three of them, and
          the rest as a count, so a heavily labelled task doesn't grow a card
          twice the height of its neighbours. */}
      {fields.tags && task.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {task.tags.slice(0, 3).map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
          {task.tags.length > 3 && (
            <span
              className="text-[0.625rem] text-[var(--ink-muted)]"
              title={task.tags.slice(3).map((t) => t.name).join(", ")}
            >
              +{task.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {task.description && (
        <p className="mt-1.5 line-clamp-2 text-[0.75rem] leading-relaxed text-[var(--ink-secondary)]">
          {task.description}
        </p>
      )}

      {fields.dates && start && end && (
        <p className="mt-2 text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
          {start === end ? start : `${start} → ${end}`}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <StatusPill
            status={task.status}
            hidden={hiddenStatuses}
            disabled={!canEdit}
            onChange={(status) => onStatusChange(task.id, status)}
          />
        </div>
        <AssigneePicker
          assignees={task.assignees}
          developers={developers}
          disabled={!canEdit}
          onChange={(ids) => onAssign(task.id, ids)}
          emptyLabel="Unassigned"
          taskTitle={task.title}
        />
      </div>
    </article>
  );
})

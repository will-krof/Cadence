"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { useFeedback } from "@/components/Feedback";
import {
  AssigneePicker,
  AvatarStack,
  ColumnPill,
  TagChip,
  CloseIcon,
  Popover,
  PriorityMark,
  SprintPicker,
} from "@/components/ui";
import { TaskEditModal } from "@/components/TaskEditModal";
import {
  COLUMN_COLORS,
  COLUMN_PRESETS,
  Developer,
  MAX_COLUMN_NAME,
  ProjectColumn,
  Task,
  TaskFields,
  UNSORTED,
  UNSORTED_COLOR,
  UNSORTED_LABEL,
  doneColumnIds,
  taskFields,
} from "@/lib/types";
import { formatDay, formatDayShort } from "@/lib/dates";
import { isHttpUrl } from "@/lib/sanitize";
import { formatEstimate } from "@/lib/estimate";

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

/**
 * A column as the board draws it: one of the project's own, or the unsorted
 * pile, which is not a column and is only ever drawn while work is standing in
 * it.
 */
interface BoardColumn {
  /** The column's id, or `UNSORTED` for the pile. */
  key: string;
  name: string;
  color: string;
  isDone: boolean;
  /** The project's column, or null for the unsorted pile. */
  column: ProjectColumn | null;
  items: Task[];
}

export function TrackerBoard({
  canEdit = true,
  canManageColumns = false,
  onNewTask,
}: {
  canEdit?: boolean;
  /**
   * Whether this viewer may make, rename, recolour, reorder and delete the
   * board's columns. What a project's states are called is the project's own
   * settings — the same standing as its tags and its roles — so working in a
   * tracker and deciding what it is made of are two different rights.
   */
  canManageColumns?: boolean;
  /** Writing a task into a particular column, which sets where it starts. */
  onNewTask?: (columnId: string | null) => void;
}) {
  const {
    activeProject,
    columns,
    tasks,
    projectTasks,
    assignable: developers,
    sprints,
    sprint,
    sprintId,
    hasUnplanned,
    selectSprint,
    updateTask,
    createColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
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
  const [dropTarget, setDropTarget] = useState<string | null>(null);
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

  /** Which columns mean the work is finished, for everything a card counts. */
  const done = useMemo(() => doneColumnIds(columns), [columns]);

  /**
   * What a card says about the steps around it: how far a task's own steps
   * have got, and which task a step belongs to — a column sorts by state, so
   * a step can sit a long way from its parent.
   */
  const stepCounts = useMemo(() => {
    const counts = new Map<string, { done: number; total: number }>();
    for (const task of tasks) {
      if (!task.parentId) continue;
      const at = counts.get(task.parentId) ?? { done: 0, total: 0 };
      at.total++;
      if (task.columnId && done.has(task.columnId)) at.done++;
      counts.set(task.parentId, at);
    }
    return counts;
  }, [tasks, done]);

  const titles = useMemo(
    () => new Map(tasks.map((t) => [t.id, t.title])),
    [tasks]
  );

  /**
   * What each task waits on and what waits on it, as the card needs to say it.
   *
   * Read from the whole project, not the board on show — a task can wait on
   * work planned into another sprint, and it is no less blocked for that.
   */
  const links = useMemo(() => {
    const finished = new Map(
      projectTasks.map((t) => [t.id, t.columnId != null && done.has(t.columnId)])
    );
    const blocks = new Map<string, number>();
    for (const task of projectTasks) {
      for (const blockerId of task.blockedBy) {
        blocks.set(blockerId, (blocks.get(blockerId) ?? 0) + 1);
      }
    }
    const of = new Map<string, TaskLinks>();
    for (const task of projectTasks) {
      const waitingOn = task.blockedBy.length;
      const blocking = blocks.get(task.id) ?? 0;
      if (waitingOn === 0 && blocking === 0) continue;
      of.set(task.id, {
        waitingOn,
        blocking,
        // Blocked means blocked *now*: something it waits on isn't finished.
        // A task whose blockers are all done is simply ready.
        held: task.blockedBy.filter((id) => finished.get(id) !== true).length,
      });
    }
    return of;
  }, [projectTasks, done]);

  // Dealt into columns in one pass. A filter per column read the whole board
  // once for each column, so a five-column board walked its tasks five times to
  // answer a question each task answers about itself.
  //
  // Work standing in no column — a task whose column was deleted, or one
  // written before the board had any — is dealt into a pile of its own at the
  // front, and only shown while something is in it. It is never quietly
  // dropped: a card that stopped being drawn is a job somebody loses.
  const board = useMemo(() => {
    const items = new Map<string, Task[]>(columns.map((c) => [c.id, []]));
    const unsorted: Task[] = [];
    for (const task of visible) {
      const into = task.columnId ? items.get(task.columnId) : undefined;
      if (into) into.push(task);
      else unsorted.push(task);
    }
    const drawn: BoardColumn[] = columns.map((column) => ({
      key: column.id,
      name: column.name,
      color: column.color,
      isDone: column.isDone,
      column,
      items: items.get(column.id)!,
    }));
    if (unsorted.length === 0) return drawn;
    return [
      {
        key: UNSORTED,
        name: UNSORTED_LABEL,
        color: UNSORTED_COLOR,
        isDone: false,
        column: null,
        items: unsorted,
      },
      ...drawn,
    ];
  }, [visible, columns]);

  /** Column under the given viewport point, if any. */
  function columnAtPoint(x: number, y: number): string | null {
    const el = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-column]");
    return el?.dataset.column ?? null;
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
        setDropTarget(columnAtPoint(e.clientX, e.clientY));
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

        const dropped = columnAtPoint(e.clientX, e.clientY);
        if (!dropped) return;
        // Dragging *into* the unsorted pile is not a move anybody means: it is
        // where work lands when its column goes, not a column to file into.
        if (dropped === UNSORTED) return;
        const task = tasksRef.current.find((t) => t.id === d.taskId);
        if (!task || task.columnId === dropped) return;
        updateTask(d.taskId, { columnId: dropped });
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
  const handleColumn = useCallback(
    (id: string, columnId: string | null) => updateTask(id, { columnId }),
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

  const projectId = activeProject?.id ?? null;

  /** Somewhere to move a column to, in the order the board is drawn. */
  const move = useCallback(
    (columnId: string, by: -1 | 1) => {
      if (!projectId) return;
      const ids = columns.map((c) => c.id);
      const from = ids.indexOf(columnId);
      const to = from + by;
      if (from < 0 || to < 0 || to >= ids.length) return;
      ids.splice(to, 0, ...ids.splice(from, 1));
      reorderColumns(projectId, ids);
    },
    [projectId, columns, reorderColumns]
  );

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
          {visible.length} {visible.length === 1 ? "task" : "tasks"}
          {columns.length > 0 && " · drag cards between columns"}
        </span>
      </div>

      {/* A tracker starts empty. Nothing is assumed about how a team works —
          not five columns, not three — so the first thing a board says is that
          it is waiting to be told what its states are called. */}
      {board.length === 0 ? (
        <EmptyBoard
          canManageColumns={canManageColumns}
          onCreate={(input) =>
            projectId ? createColumn(projectId, input) : Promise.resolve(null)
          }
        />
      ) : (
        <div className="thin-scroll flex flex-1 gap-3 overflow-x-auto p-4 sm:gap-4 sm:p-6">
          {board.map((col, index) => {
            const isTarget = dropTarget === col.key;
            return (
              <section
                key={col.key}
                data-column={col.key}
                className={`flex w-[17rem] shrink-0 flex-col rounded-[var(--radius-lg)] border transition-colors ${
                  isTarget && col.column
                    ? "border-[var(--accent)] bg-[var(--accent-wash)]"
                    : "border-[var(--hairline)] bg-[var(--plane)]"
                }`}
              >
                <ColumnHeader
                  column={col}
                  count={col.items.length}
                  canEdit={canEdit}
                  canManage={canManageColumns}
                  // Where it sits among the project's own columns, which is
                  // what "move left" and "move right" run out of.
                  first={col.column != null && index === (board.length - columns.length)}
                  last={col.column != null && index === board.length - 1}
                  onNewTask={onNewTask}
                  onRename={(name) =>
                    projectId && col.column
                      ? updateColumn(projectId, col.column.id, { name })
                      : undefined
                  }
                  onRecolor={(color) =>
                    projectId && col.column
                      ? updateColumn(projectId, col.column.id, { color })
                      : undefined
                  }
                  onSetDone={(isDone) =>
                    projectId && col.column
                      ? updateColumn(projectId, col.column.id, { isDone })
                      : undefined
                  }
                  onMove={(by) => col.column && move(col.column.id, by)}
                  onDelete={() =>
                    projectId && col.column
                      ? deleteColumn(projectId, col.column.id)
                      : undefined
                  }
                />

                <Column count={col.items.length} isTarget={isTarget}>
                  {col.items.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      steps={fields.subtasks ? stepCounts.get(task.id) : undefined}
                      links={fields.dependencies ? links.get(task.id) : undefined}
                      columns={columns}
                      canEdit={canEdit}
                      parentTitle={
                        task.parentId ? titles.get(task.parentId) : undefined
                      }
                      dragging={dragging?.taskId === task.id}
                      onDragStart={beginDrag}
                      onColumnChange={handleColumn}
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

          {/* Another state, written at the end of the board where it lands. */}
          {canManageColumns && (
            <AddColumn
              onCreate={(input) =>
                projectId ? createColumn(projectId, input) : Promise.resolve(null)
              }
            />
          )}
        </div>
      )}

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
 * The head of one column: what it is called, how much is in it, and — for
 * whoever may decide what the board is made of — the panel that renames it,
 * recolours it, says whether work here is finished, moves it along the board
 * and deletes it.
 */
function ColumnHeader({
  column: col,
  count,
  canEdit,
  canManage,
  first,
  last,
  onNewTask,
  onRename,
  onRecolor,
  onSetDone,
  onMove,
  onDelete,
}: {
  column: BoardColumn;
  count: number;
  canEdit: boolean;
  canManage: boolean;
  first: boolean;
  last: boolean;
  onNewTask?: (columnId: string | null) => void;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onSetDone: (isDone: boolean) => void;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const { confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(col.name);
  const button = useRef<HTMLButtonElement>(null);

  function commitName() {
    const next = name.trim();
    if (!next || next === col.name) {
      setName(col.name);
      return;
    }
    onRename(next);
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete the “${col.name}” column?`,
      body:
        count === 0
          ? "The column goes for good. This cannot be undone."
          : `The column goes for good. The ${count} ${
              count === 1 ? "task" : "tasks"
            } standing in it are not deleted — they come back on this board as unsorted, ready to be dragged somewhere that still exists.`,
      confirmLabel: "Delete column",
      destructive: true,
    });
    if (!ok) return;
    setOpen(false);
    onDelete();
  }

  return (
    <header className="flex items-center gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: col.color }}
      />
      <h3 className="truncate text-[0.75rem] font-semibold tracking-tight">
        {col.name}
      </h3>
      {/* Which column means the work is finished, said in a word rather than
          left to the colour or to whatever the column happens to be called. */}
      {col.isDone && (
        <span
          className="shrink-0 text-[0.625rem] text-[var(--ink-muted)]"
          title="Work standing here counts as finished"
        >
          ✓
        </span>
      )}
      <span className="ml-auto rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[0.6875rem] tabular-nums text-[var(--ink-secondary)]">
        {count}
      </span>
      {/* A task is written into a column rather than into the board: the one
          you press decides where the task starts. Never into the unsorted
          pile — that is where work lands, not somewhere to file it. */}
      {canEdit && onNewTask && col.column && (
        <button
          onClick={() => onNewTask(col.column!.id)}
          className="rounded p-0.5 text-[var(--ink-muted)] transition hover:text-[var(--accent)]"
          aria-label={`New task in ${col.name}`}
          title={`New task in ${col.name}`}
        >
          <PlusMark />
        </button>
      )}
      {canManage && col.column && (
        <button
          ref={button}
          // The field is filled from the column as the panel opens rather
          // than kept in step with it: a rename from another tab, or a save
          // that was refused, shouldn't leave stale text behind next time.
          onClick={() => {
            setName(col.name);
            setOpen((was) => !was);
          }}
          className="rounded p-0.5 text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
          aria-label={`Edit the ${col.name} column`}
          aria-expanded={open}
          title="Edit this column"
        >
          <MoreMark />
        </button>
      )}

      {open && col.column && (
        <Popover anchor={button} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-2 p-1.5">
            <label className="flex flex-col gap-1">
              <span className="field-label">Name</span>
              <input
                value={name}
                maxLength={MAX_COLUMN_NAME}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitName();
                    setOpen(false);
                  }
                }}
                className="input"
                aria-label="Column name"
              />
            </label>

            <div className="flex flex-col gap-1">
              <span className="field-label">Colour</span>
              <div className="flex flex-wrap gap-1.5">
                {COLUMN_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => onRecolor(color)}
                    className={`h-5 w-5 rounded-full border transition ${
                      col.color.toLowerCase() === color.toLowerCase()
                        ? "border-[var(--ink)]"
                        : "border-transparent hover:border-[var(--baseline)]"
                    }`}
                    style={{ background: color }}
                    aria-label={`Colour this column ${color}`}
                    aria-pressed={col.color.toLowerCase() === color.toLowerCase()}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 text-[0.75rem]">
              <input
                type="checkbox"
                checked={col.isDone}
                onChange={(e) => onSetDone(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Work here is finished
                <span className="block text-[0.6875rem] text-[var(--ink-muted)]">
                  What progress, velocity and “still blocked” are counted from
                </span>
              </span>
            </label>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onMove(-1)}
                disabled={first}
                className="btn-secondary flex-1 disabled:opacity-40"
                title="Move this column left"
              >
                ← Left
              </button>
              <button
                onClick={() => onMove(1)}
                disabled={last}
                className="btn-secondary flex-1 disabled:opacity-40"
                title="Move this column right"
              >
                Right →
              </button>
            </div>

            <button
              onClick={remove}
              className="btn-secondary text-[var(--danger)]"
            >
              Delete column
            </button>
          </div>
        </Popover>
      )}
    </header>
  );
}

/** The form both the empty board and the end of a full one are built from. */
function ColumnForm({
  onCreate,
  autoFocus = false,
  onDone,
}: {
  onCreate: (input: {
    name: string;
    color?: string;
    isDone?: boolean;
  }) => Promise<unknown>;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLUMN_COLORS[0]);
  const [isDone, setIsDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const created = await onCreate({ name: trimmed, color, isDone });
    setSaving(false);
    if (!created) return;
    // Ready for the next one: a board is usually written a few columns at a
    // time, and being handed an empty field back is what that wants.
    setName("");
    setIsDone(false);
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <input
        value={name}
        autoFocus={autoFocus}
        maxLength={MAX_COLUMN_NAME}
        onChange={(e) => setName(e.target.value)}
        placeholder="Column name"
        aria-label="Column name"
        className="input"
      />
      <div className="flex flex-wrap gap-1.5">
        {COLUMN_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            onClick={() => setColor(swatch)}
            className={`h-5 w-5 rounded-full border transition ${
              color === swatch
                ? "border-[var(--ink)]"
                : "border-transparent hover:border-[var(--baseline)]"
            }`}
            style={{ background: swatch }}
            aria-label={`Colour it ${swatch}`}
            aria-pressed={color === swatch}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-[0.75rem] text-[var(--ink-secondary)]">
        <input
          type="checkbox"
          checked={isDone}
          onChange={(e) => setIsDone(e.target.checked)}
        />
        Work here is finished
      </label>
      <button
        type="submit"
        disabled={!name.trim() || saving}
        className="btn-primary disabled:opacity-40"
      >
        {saving ? "Adding…" : "Add column"}
      </button>
    </form>
  );
}

/** The ghost column at the end of the board: another state, written here. */
function AddColumn({
  onCreate,
}: {
  onCreate: (input: {
    name: string;
    color?: string;
    isDone?: boolean;
  }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-[13rem] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-lg)] border border-dashed border-[var(--hairline)] p-4 text-[0.75rem] text-[var(--ink-muted)] transition hover:border-[var(--baseline)] hover:text-[var(--ink)]"
      >
        <PlusMark />
        Add column
      </button>
    );
  }

  return (
    <section className="flex w-[17rem] shrink-0 flex-col rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--plane)]">
      <header className="flex items-center gap-2 border-b border-[var(--hairline)] px-3 py-2.5">
        <h3 className="text-[0.75rem] font-semibold tracking-tight">
          New column
        </h3>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto rounded p-0.5 text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
          aria-label="Stop adding a column"
        >
          <CloseIcon size={11} />
        </button>
      </header>
      <div className="p-3">
        <ColumnForm onCreate={onCreate} autoFocus />
      </div>
    </section>
  );
}

/**
 * A tracker with nothing on it yet.
 *
 * Not an error and not a loading state: it is what every new project's board
 * looks like, because this app has stopped guessing what a team's states are
 * called. Two ways out of it — write your own column, or take the familiar set
 * and change it — and the second is a button rather than a default, so nobody
 * ends up with five columns they never asked for.
 */
function EmptyBoard({
  canManageColumns,
  onCreate,
}: {
  canManageColumns: boolean;
  onCreate: (input: {
    name: string;
    color?: string;
    isDone?: boolean;
  }) => Promise<unknown>;
}) {
  const [filling, setFilling] = useState(false);

  async function usePresets() {
    setFilling(true);
    // One after another rather than all at once: they land on the right-hand
    // end of the board in turn, which is the order they are listed in.
    for (const preset of COLUMN_PRESETS) await onCreate(preset);
    setFilling(false);
  }

  return (
    <div className="thin-scroll flex flex-1 items-start justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--plane)] p-5">
        <div>
          <h2 className="text-[0.9375rem] font-semibold tracking-tight">
            This tracker has no columns yet
          </h2>
          <p className="mt-1 text-[0.75rem] leading-relaxed text-[var(--ink-secondary)]">
            {canManageColumns
              ? "A board is made of the states your work actually moves through — name them yourself, and pick the colour each one is drawn in. Nothing here is fixed: rename, recolour, reorder or delete any of them later."
              : "Nobody has set this board up yet. Whoever owns the project decides what its columns are called."}
          </p>
        </div>

        {canManageColumns && (
          <>
            <ColumnForm onCreate={onCreate} />
            <div className="flex items-center gap-2 text-[0.6875rem] text-[var(--ink-muted)]">
              <span className="h-px flex-1 bg-[var(--hairline)]" />
              or
              <span className="h-px flex-1 bg-[var(--hairline)]" />
            </div>
            <div>
              <button
                onClick={usePresets}
                disabled={filling}
                className="btn-secondary w-full disabled:opacity-40"
              >
                {filling ? "Adding…" : "Start from a familiar set"}
              </button>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] text-[var(--ink-muted)]">
                {COLUMN_PRESETS.map((preset) => (
                  <span key={preset.name} className="flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: preset.color }}
                    />
                    {preset.name}
                  </span>
                ))}
              </p>
            </div>
          </>
        )}
      </div>
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

/** What a card says about the work joined to this one, when anything is. */
interface TaskLinks {
  /** How many tasks it waits on, finished or not. */
  waitingOn: number;
  /** How many of those aren't done — which is what "blocked" means. */
  held: number;
  /** How many tasks are waiting on this one. */
  blocking: number;
}

const TaskCard = memo(function TaskCard({
  task,
  steps,
  links,
  parentTitle,
  columns,
  canEdit,
  developers,
  fields,
  dragging,
  onDragStart,
  onColumnChange,
  onAssign,
  onOpen,
  onEdit,
}: {
  task: Task;
  /** How many of this task's steps are done, when it has any. */
  steps?: { done: number; total: number };
  /** What it waits on and what waits on it, when the project asks at all. */
  links?: TaskLinks;
  /** The task this card is a step of, when it is one. */
  parentTitle?: string;
  /** The board's columns, read once for the board and handed down. */
  columns: ProjectColumn[];
  /** Whether this viewer may change the work, or only read it. */
  canEdit: boolean;
  developers: Developer[];
  /** What this project asks a task for; a field put away is not drawn. */
  fields: TaskFields;
  dragging: boolean;
  onDragStart: (state: DragState) => void;
  onColumnChange: (id: string, columnId: string | null) => void;
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

      {/* How long it should take. On the card rather than only in the dialog:
          it is the number somebody scanning a column is weighing up. */}
      {fields.estimate && task.estimateMinutes != null && (
        <p className="mt-2 text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
          Est. {formatEstimate(task.estimateMinutes)}
        </p>
      )}

      {/* What it is waiting on, and what is waiting on it. Work that can't be
          started yet is marked rather than merely counted: it is the one thing
          about a column that changes what you pick up next. */}
      {links && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5">
          {links.waitingOn > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[0.625rem] tabular-nums"
              style={
                links.held > 0
                  ? {
                      color: "var(--danger)",
                      background:
                        "color-mix(in srgb, var(--danger) 12%, transparent)",
                    }
                  : { color: "var(--ink-muted)" }
              }
              title={
                links.held > 0
                  ? `Blocked — ${links.held} of the ${links.waitingOn} it waits on ${
                      links.held === 1 ? "isn’t" : "aren’t"
                    } done`
                  : `Everything it waited on is done`
              }
            >
              {links.held > 0
                ? `⇢ Blocked by ${links.held}`
                : `⇢ Clear of ${links.waitingOn}`}
            </span>
          )}
          {links.blocking > 0 && (
            <span
              className="rounded-full border border-[var(--hairline)] px-1.5 py-0.5 text-[0.625rem] tabular-nums text-[var(--ink-muted)]"
              title={`${links.blocking} ${
                links.blocking === 1 ? "task is" : "tasks are"
              } waiting on this one`}
            >
              Blocks {links.blocking}
            </span>
          )}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <ColumnPill
            columnId={task.columnId}
            columns={columns}
            disabled={!canEdit}
            onChange={(columnId) => onColumnChange(task.id, columnId)}
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

/** The mark on every "write one of these" button: a plus, and nothing else. */
function PlusMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M6 2v8M2 6h8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** And the mark on every "there is more here" button: three dots. */
function MoreMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="2.5" cy="6" r="1" fill="currentColor" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="9.5" cy="6" r="1" fill="currentColor" />
    </svg>
  );
}

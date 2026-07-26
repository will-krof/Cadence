"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { CloseIcon, StatusPill } from "@/components/ui";
import { STATUS_OPTIONS, Task, TaskStatus } from "@/lib/types";
import { toISODate } from "@/lib/dates";

/** Pointer travel before a press turns into a drag rather than a click. */
const DRAG_THRESHOLD = 5;

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

export function TrackerBoard() {
  const { tasks, developers, updateTask, deleteTask } = useBoard();
  const [assignee, setAssignee] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const visible = useMemo(
    () => (assignee ? tasks.filter((t) => t.developerId === assignee) : tasks),
    [tasks, assignee]
  );

  const columns = useMemo(
    () =>
      STATUS_OPTIONS.map((s) => ({
        ...s,
        items: visible.filter((t) => t.status === s.value),
      })),
    [visible]
  );

  /** Column under the given viewport point, if any. */
  function statusAtPoint(x: number, y: number): TaskStatus | null {
    const el = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-status]");
    return (el?.dataset.status as TaskStatus | undefined) ?? null;
  }

  const beginDrag = useCallback((state: DragState) => {
    dragRef.current = state;
    setDrag(state);
  }, []);

  // Pointer events (rather than HTML5 drag-and-drop) so dragging works with
  // touch and pen as well as a mouse.
  useEffect(() => {
    if (!drag) return;

    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;

      const moved =
        Math.abs(e.clientX - d.startX) > DRAG_THRESHOLD ||
        Math.abs(e.clientY - d.startY) > DRAG_THRESHOLD;

      const next = {
        ...d,
        x: e.clientX,
        y: e.clientY,
        active: d.active || moved,
      };
      dragRef.current = next;
      setDrag(next);

      if (next.active) {
        e.preventDefault();
        setDropTarget(statusAtPoint(e.clientX, e.clientY));
      }
    }

    function onUp(e: PointerEvent) {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setDropTarget(null);
      if (!d || e.pointerId !== d.pointerId || !d.active) return;

      const status = statusAtPoint(e.clientX, e.clientY);
      if (!status) return;
      const task = tasks.find((t) => t.id === d.taskId);
      if (!task || task.status === status) return;
      updateTask(d.taskId, { status });
    }

    function onCancel() {
      dragRef.current = null;
      setDrag(null);
      setDropTarget(null);
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [drag, tasks, updateTask]);

  const draggedTask = drag?.active
    ? tasks.find((t) => t.id === drag.taskId) ?? null
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--hairline)] px-4 py-3 sm:px-6">
        <label className="flex flex-col gap-1">
          <span className="field-label">Filter by developer</span>
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
      </div>

      <div className="thin-scroll flex flex-1 gap-3 overflow-x-auto p-4 sm:gap-4 sm:p-6">
        {columns.map((col) => {
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
              </header>

              <div className="thin-scroll flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                {col.items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    dragging={drag?.active === true && drag.taskId === task.id}
                    onDragStart={beginDrag}
                    onStatusChange={(status) => updateTask(task.id, { status })}
                    onAssign={(developerId) =>
                      updateTask(task.id, { developerId })
                    }
                    onDelete={() => deleteTask(task.id)}
                    developers={developers}
                  />
                ))}
                {col.items.length === 0 && (
                  <p className="px-1 py-3 text-[0.75rem] text-[var(--ink-muted)]">
                    {isTarget ? "Drop here" : "Nothing here."}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Drag preview follows the pointer and must not intercept hit-testing. */}
      {draggedTask && drag && (
        <div
          className="pointer-events-none fixed z-50 rotate-2 rounded-[var(--radius)] border border-[var(--accent)] bg-[var(--surface-raised)] p-2.5 shadow-xl"
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.width,
          }}
        >
          <p className="text-[0.8125rem] font-medium leading-snug">
            {draggedTask.title}
          </p>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  developers,
  dragging,
  onDragStart,
  onStatusChange,
  onAssign,
  onDelete,
}: {
  task: Task;
  developers: { id: string; name: string; color: string }[];
  dragging: boolean;
  onDragStart: (state: DragState) => void;
  onStatusChange: (status: TaskStatus) => void;
  onAssign: (developerId: string | null) => void;
  onDelete: () => void;
}) {
  const start = toISODate(new Date(task.startDate));
  const end = toISODate(new Date(task.endDate));

  function handlePointerDown(e: React.PointerEvent<HTMLElement>) {
    // Let the selects, links and delete button behave normally.
    if ((e.target as HTMLElement).closest("select, button, a, input")) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;

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

  return (
    <article
      onPointerDown={handlePointerDown}
      // touch-none keeps a touch drag from scrolling the column instead.
      className={`group touch-none rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-2.5 shadow-sm transition select-none ${
        dragging
          ? "opacity-40"
          : "cursor-grab hover:border-[var(--baseline)] active:cursor-grabbing"
      }`}
    >
      <div className="flex items-start gap-1.5">
        {task.link ? (
          <a
            href={task.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-[0.8125rem] font-medium leading-snug text-[var(--accent)] hover:underline"
          >
            {task.title}
          </a>
        ) : (
          <h4 className="flex-1 text-[0.8125rem] font-medium leading-snug">
            {task.title}
          </h4>
        )}
        <button
          onClick={onDelete}
          className="mt-0.5 shrink-0 rounded p-0.5 text-[var(--ink-muted)] opacity-0 transition hover:text-[#d03b3b] focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Delete ${task.title}`}
        >
          <CloseIcon />
        </button>
      </div>

      {task.description && (
        <p className="mt-1.5 line-clamp-2 text-[0.75rem] leading-relaxed text-[var(--ink-secondary)]">
          {task.description}
        </p>
      )}

      <p className="mt-2 text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
        {start === end ? start : `${start} → ${end}`}
      </p>

      <div className="mt-2.5 flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <StatusPill status={task.status} onChange={onStatusChange} />
        </div>
        <div className="relative flex min-w-0 flex-1 items-center">
          {task.developer && (
            <span
              className="pointer-events-none absolute left-2 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: task.developer.color }}
            />
          )}
          <select
            value={task.developerId ?? ""}
            onChange={(e) => onAssign(e.target.value || null)}
            className={`select truncate ${task.developer ? "pl-[1.375rem]" : ""}`}
            aria-label={`Assignee for ${task.title}`}
          >
            <option value="">Unassigned</option>
            {developers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </article>
  );
}

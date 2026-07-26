"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  diffDays,
  isWeekend,
  startOfDay,
  toISODate,
  weekdayLetter,
} from "@/lib/dates";
import { contrastText } from "@/lib/color";
import { STATUS_OPTIONS, Task, statusMeta } from "@/lib/types";
import { useBoard } from "@/components/BoardProvider";
import { Avatar, Stat, StatusPill } from "@/components/ui";
import { TaskModal } from "@/components/TaskModal";

const ROW_HEIGHT = 44;
const DAY_WIDTH = 44;
const DAY_WIDTH_COMPACT = 36;
const DAYS_BEFORE_TODAY = 3;
const MIN_DAYS_AFTER_TODAY = 21;
const MIN_COL_WIDTH = 64;
/** Pointer travel before a press on a bar becomes a drag rather than a click. */
const BAR_DRAG_THRESHOLD = 4;

/** Keeps a column index inside the rendered range. */
function clampIdx(i: number, length: number) {
  return Math.max(0, Math.min(length - 1, i));
}

/** Which part of a bar the pointer grabbed. */
type BarMode = "move" | "start" | "end";

interface BarDrag {
  taskId: string;
  mode: BarMode;
  pointerId: number;
  startX: number;
  /** Column indices the bar occupied when the drag began. */
  fromIdx: number;
  toIdx: number;
  /** Snapped column offset applied so far. */
  shift: number;
  active: boolean;
}

type ColKey = "task" | "status" | "developer";
type ColWidths = Record<ColKey, number>;

const COL_WIDTHS_WIDE: ColWidths = { task: 240, status: 132, developer: 132 };
const COL_WIDTHS_COMPACT: ColWidths = { task: 132, status: 104, developer: 96 };

export function GanttBoard() {
  const { tasks, developers, sprint, stats, updateTask, deleteTask, updateSprint } =
    useBoard();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [barDrag, setBarDrag] = useState<BarDrag | null>(null);
  const barDragRef = useRef<BarDrag | null>(null);

  const [hideWeekends, setHideWeekends] = useState(false);
  const [compact, setCompact] = useState(false);
  const [colWidths, setColWidths] = useState<ColWidths>(COL_WIDTHS_WIDE);

  // Track whether the user has hand-sized the columns, so a viewport change
  // doesn't overwrite their choice.
  const userSizedRef = useRef(false);
  const resizingRef = useRef<{
    key: ColKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    function apply() {
      setCompact(mq.matches);
      if (!userSizedRef.current) {
        setColWidths(mq.matches ? COL_WIDTHS_COMPACT : COL_WIDTHS_WIDE);
      }
    }
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = resizingRef.current;
      if (!r) return;
      const delta = e.clientX - r.startX;
      const next = Math.max(MIN_COL_WIDTH, r.startWidth + delta);
      setColWidths((prev) => ({ ...prev, [r.key]: next }));
    }
    function onUp() {
      resizingRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Called from the pointer handler rather than built during render, so the
  // refs are only ever touched in response to an event.
  function beginResize(e: React.MouseEvent, key: ColKey) {
    e.preventDefault();
    userSizedRef.current = true;
    resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] };
  }

  const today = useMemo(() => startOfDay(new Date()), []);
  const dayWidth = compact ? DAY_WIDTH_COMPACT : DAY_WIDTH;

  const { days } = useMemo(() => {
    let start = addDays(today, -DAYS_BEFORE_TODAY);
    let end = addDays(today, MIN_DAYS_AFTER_TODAY);

    for (const t of tasks) {
      const s = startOfDay(new Date(t.startDate));
      const e = startOfDay(new Date(t.endDate));
      if (s < start) start = s;
      if (e > end) end = e;
    }

    if (sprint) {
      const s = startOfDay(new Date(sprint.startDate));
      const e = startOfDay(new Date(sprint.endDate));
      if (s < start) start = s;
      if (e > end) end = e;
    }

    const count = diffDays(start, end) + 1;
    const all = Array.from({ length: count }, (_, i) => addDays(start, i));
    const days = hideWeekends ? all.filter((d) => !isWeekend(d)) : all;
    return { days };
  }, [tasks, today, sprint, hideWeekends]);

  // Bars are placed by visible column index, not by date difference, so the
  // math stays correct when weekend columns are filtered out.
  function columnSpan(from: Date, to: Date) {
    const first = days.findIndex((d) => d >= from && d <= to);
    if (first === -1) return null;
    let last = first;
    for (let i = first; i < days.length; i++) {
      if (days[i] <= to) last = i;
    }
    return { left: first * dayWidth, width: (last - first + 1) * dayWidth };
  }

  const sprintRange = useMemo(() => {
    if (!sprint) return null;
    return {
      start: startOfDay(new Date(sprint.startDate)),
      end: startOfDay(new Date(sprint.endDate)),
    };
  }, [sprint]);

  function isInSprint(d: Date) {
    if (!sprintRange) return false;
    return d >= sprintRange.start && d <= sprintRange.end;
  }

  /** Bar geometry for a task, accounting for an in-flight drag. */
  function barFor(task: Task) {
    const s = startOfDay(new Date(task.startDate));
    const e = startOfDay(new Date(task.endDate));
    const base = columnSpan(s, e);
    if (!base) return null;

    const drag = barDrag?.active && barDrag.taskId === task.id ? barDrag : null;
    if (!drag) return { ...base, fromIdx: null, toIdx: null };

    let fromIdx = drag.fromIdx;
    let toIdx = drag.toIdx;
    if (drag.mode === "move") {
      fromIdx = clampIdx(drag.fromIdx + drag.shift, days.length);
      toIdx = clampIdx(drag.toIdx + drag.shift, days.length);
    } else if (drag.mode === "start") {
      fromIdx = clampIdx(Math.min(drag.fromIdx + drag.shift, drag.toIdx), days.length);
    } else {
      toIdx = clampIdx(Math.max(drag.toIdx + drag.shift, drag.fromIdx), days.length);
    }

    return {
      left: fromIdx * dayWidth,
      width: (toIdx - fromIdx + 1) * dayWidth,
      fromIdx,
      toIdx,
    };
  }

  function beginBarDrag(
    e: React.PointerEvent,
    task: Task,
    mode: BarMode,
    span: { left: number; width: number }
  ) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();

    const next: BarDrag = {
      taskId: task.id,
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      fromIdx: Math.round(span.left / dayWidth),
      toIdx: Math.round((span.left + span.width) / dayWidth) - 1,
      shift: 0,
      active: false,
    };
    barDragRef.current = next;
    setBarDrag(next);
  }

  // Dragging a bar edits dates by whole days, snapped to the columns on screen.
  useEffect(() => {
    if (!barDrag) return;

    function onMove(ev: PointerEvent) {
      const d = barDragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      const dx = ev.clientX - d.startX;
      const next: BarDrag = {
        ...d,
        shift: Math.round(dx / dayWidth),
        active: d.active || Math.abs(dx) > BAR_DRAG_THRESHOLD,
      };
      barDragRef.current = next;
      setBarDrag(next);
      if (next.active) ev.preventDefault();
    }

    function onUp(ev: PointerEvent) {
      const d = barDragRef.current;
      barDragRef.current = null;
      setBarDrag(null);
      if (!d || ev.pointerId !== d.pointerId) return;

      // A press that never moved is a click: open the editor instead.
      if (!d.active) {
        setEditingId(d.taskId);
        return;
      }

      const task = tasks.find((t) => t.id === d.taskId);
      if (!task) return;

      let fromIdx = d.fromIdx;
      let toIdx = d.toIdx;
      if (d.mode === "move") {
        fromIdx = clampIdx(d.fromIdx + d.shift, days.length);
        toIdx = clampIdx(d.toIdx + d.shift, days.length);
      } else if (d.mode === "start") {
        fromIdx = clampIdx(Math.min(d.fromIdx + d.shift, d.toIdx), days.length);
      } else {
        toIdx = clampIdx(Math.max(d.toIdx + d.shift, d.fromIdx), days.length);
      }

      const startDate = toISODate(days[fromIdx]);
      const endDate = toISODate(days[toIdx]);
      if (
        startDate === toISODate(startOfDay(new Date(task.startDate))) &&
        endDate === toISODate(startOfDay(new Date(task.endDate)))
      ) {
        return;
      }
      updateTask(task.id, { startDate, endDate });
    }

    function onCancel() {
      barDragRef.current = null;
      setBarDrag(null);
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
  }, [barDrag, dayWidth, days, tasks, updateTask]);

  const editingTask = tasks.find((t) => t.id === editingId) ?? null;

  const gridTemplateColumns = `${colWidths.task}px ${colWidths.status}px ${colWidths.developer}px`;
  const leftPanelWidth = colWidths.task + colWidths.status + colWidths.developer;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-[var(--hairline)] px-4 py-3 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Stat label="Total" value={stats.total} />
            {STATUS_OPTIONS.map((s) => (
              <Stat
                key={s.value}
                label={s.label}
                value={stats.counts[s.value]}
                dot={s.color}
              />
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="h-1 w-28 overflow-hidden rounded-full bg-[var(--gridline)] sm:w-40">
              <div
                className="h-full rounded-full bg-[#0ca30c] transition-[width] duration-300"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
            <span className="text-[0.6875rem] tabular-nums text-[var(--ink-secondary)]">
              {stats.progress.toFixed(0)}% done
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <label className="flex flex-col gap-1">
            <span className="field-label">
              Sprint {sprint ? sprint.number : ""} start
            </span>
            <input
              type="date"
              value={sprint ? toISODate(new Date(sprint.startDate)) : ""}
              onChange={(e) => updateSprint({ startDate: e.target.value })}
              className="input w-[9.5rem]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="field-label">Sprint end</span>
            <input
              type="date"
              value={sprint ? toISODate(new Date(sprint.endDate)) : ""}
              onChange={(e) => updateSprint({ endDate: e.target.value })}
              className="input w-[9.5rem]"
            />
          </label>
          <label className="flex cursor-pointer select-none items-center gap-2 pb-2 text-xs text-[var(--ink-secondary)]">
            <input
              type="checkbox"
              checked={hideWeekends}
              onChange={(e) => setHideWeekends(e.target.checked)}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
            />
            Hide weekends
          </label>
        </div>
      </div>

      {/* On small screens the table and timeline scroll together as one surface,
          so the timeline gets the full viewport width instead of a sliver. */}
      <div
        className={`flex min-h-0 flex-1 ${
          compact ? "thin-scroll overflow-auto" : ""
        }`}
      >
        {/* Left panel: task table */}
        <div
          className={`relative shrink-0 border-r border-[var(--hairline)] ${
            compact ? "" : "thin-scroll overflow-y-auto"
          }`}
          style={{ width: leftPanelWidth }}
        >
          <div
            className="sticky top-0 z-20 grid items-center border-b border-[var(--hairline)] bg-[var(--surface)] text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--ink-muted)]"
            style={{ height: ROW_HEIGHT, gridTemplateColumns }}
          >
            <div className="truncate px-3">Task</div>
            <div className="truncate px-2">Status</div>
            <div className="truncate px-2">Developer</div>
          </div>

          {tasks.map((task) => (
            <div
              key={task.id}
              className="group grid items-center border-b border-[var(--hairline)] transition-colors hover:bg-[var(--plane)]"
              style={{ height: ROW_HEIGHT, gridTemplateColumns }}
            >
              <div className="flex min-w-0 items-center gap-1 px-3 text-[0.8125rem]">
                {task.link ? (
                  <a
                    href={task.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-[var(--accent)] hover:underline"
                    title={task.description || task.link}
                  >
                    {task.title}
                  </a>
                ) : (
                  <span className="truncate" title={task.description || undefined}>
                    {task.title}
                  </span>
                )}
                <button
                  onClick={() => setEditingId(task.id)}
                  className="ml-auto shrink-0 rounded p-0.5 text-[var(--ink-muted)] opacity-0 transition hover:text-[var(--ink)] focus-visible:opacity-100 group-hover:opacity-100"
                  title="Edit task"
                  aria-label={`Edit ${task.title}`}
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
              </div>

              <div className="px-2">
                <StatusPill
                  status={task.status}
                  onChange={(status) => updateTask(task.id, { status })}
                />
              </div>

              <div className="relative flex items-center px-2">
                {task.developer && (
                  <span className="pointer-events-none absolute left-3.5 z-10">
                    <Avatar person={task.developer} size={18} />
                  </span>
                )}
                <select
                  value={task.developerId ?? ""}
                  onChange={(e) =>
                    updateTask(task.id, { developerId: e.target.value || null })
                  }
                  className={`select truncate ${task.developer ? "pl-7" : ""}`}
                  aria-label={`Assignee for ${task.title}`}
                >
                  <option value="">—</option>
                  {developers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="px-3 py-6 text-[0.8125rem] text-[var(--ink-muted)]">
              No tasks yet.
            </div>
          )}

          {/* Column resize handles — pointer only */}
          {!compact && (
            <>
              <div
                onMouseDown={(e) => beginResize(e, "task")}
                className="absolute top-0 bottom-0 z-30 -ml-[3px] w-1.5 cursor-col-resize transition-colors hover:bg-[var(--accent)]/40"
                style={{ left: colWidths.task }}
              />
              <div
                onMouseDown={(e) => beginResize(e, "status")}
                className="absolute top-0 bottom-0 z-30 -ml-[3px] w-1.5 cursor-col-resize transition-colors hover:bg-[var(--accent)]/40"
                style={{ left: colWidths.task + colWidths.status }}
              />
            </>
          )}
        </div>

        {/* Right panel: timeline */}
        <div className={compact ? "shrink-0" : "thin-scroll flex-1 overflow-auto"}>
          <div className="relative" style={{ width: days.length * dayWidth }}>
            {(() => {
              if (!sprintRange) return null;
              const band = columnSpan(sprintRange.start, sprintRange.end);
              if (!band) return null;
              return (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 -z-10 bg-[var(--accent-wash)]"
                  style={{ left: band.left, width: band.width }}
                />
              );
            })()}

            <div
              className="sticky top-0 z-20 grid border-b border-[var(--hairline)] bg-[var(--surface)]"
              style={{
                gridTemplateColumns: `repeat(${days.length}, ${dayWidth}px)`,
                height: ROW_HEIGHT,
              }}
            >
              {days.map((d) => {
                const isToday = diffDays(today, d) === 0;
                return (
                  <div
                    key={d.toISOString()}
                    className={`relative flex flex-col items-center justify-center gap-0.5 border-l border-[var(--hairline)] ${
                      isWeekend(d) ? "bg-[var(--plane)]" : ""
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.6875rem] tabular-nums ${
                        isToday
                          ? "bg-[var(--ink)] font-semibold text-[var(--surface)]"
                          : "font-medium"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <span className="text-[0.5625rem] uppercase text-[var(--ink-muted)]">
                      {weekdayLetter(d)}
                    </span>
                    {isInSprint(d) && (
                      <span className="absolute bottom-0 h-0.5 w-full bg-[var(--accent)]/60" />
                    )}
                  </div>
                );
              })}
            </div>

            {tasks.map((task) => {
              const bar = barFor(task);
              const color = task.developer?.color ?? statusMeta(task.status).color;
              const dragging = barDrag?.active && barDrag.taskId === task.id;
              return (
                <div
                  key={task.id}
                  className="relative border-b border-[var(--hairline)]"
                  style={{ height: ROW_HEIGHT }}
                >
                  {days.map((d, i) => (
                    <div
                      key={d.toISOString()}
                      className={`pointer-events-none absolute top-0 bottom-0 border-l border-[var(--hairline)] ${
                        isWeekend(d) ? "bg-[var(--plane)]" : ""
                      }`}
                      style={{ left: i * dayWidth, width: dayWidth }}
                    />
                  ))}
                  {bar && (
                    <div
                      role="button"
                      tabIndex={0}
                      onPointerDown={(e) => beginBarDrag(e, task, "move", bar)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setEditingId(task.id);
                        }
                      }}
                      className={`group/bar absolute top-2 bottom-2 flex touch-none select-none items-center rounded-md px-2 text-left text-[0.6875rem] font-medium leading-none shadow-sm ring-2 ring-[var(--surface)] ${
                        dragging
                          ? "cursor-grabbing"
                          : "cursor-grab transition hover:brightness-95"
                      }`}
                      style={{
                        left: bar.left + 2,
                        width: bar.width - 4,
                        background: color,
                        color: contrastText(color),
                      }}
                      title={
                        task.developer
                          ? `${task.title} — ${task.developer.name}`
                          : task.title
                      }
                    >
                      {/* Grab either end to reschedule just that date. */}
                      <span
                        onPointerDown={(e) => beginBarDrag(e, task, "start", bar)}
                        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md opacity-0 transition group-hover/bar:opacity-100"
                        style={{ background: "rgba(255,255,255,0.45)" }}
                        aria-hidden="true"
                      />
                      <span
                        onPointerDown={(e) => beginBarDrag(e, task, "end", bar)}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md opacity-0 transition group-hover/bar:opacity-100"
                        style={{ background: "rgba(255,255,255,0.45)" }}
                        aria-hidden="true"
                      />

                      {task.developer && (
                        <span className="mr-1.5 -ml-0.5 shrink-0">
                          <Avatar person={task.developer} size={16} />
                        </span>
                      )}
                      <span className="truncate">{task.title}</span>

                      {dragging && bar.fromIdx != null && bar.toIdx != null && (
                        <span className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded bg-[var(--ink)] px-1.5 py-1 text-[0.625rem] font-medium text-[var(--surface)] shadow">
                          {toISODate(days[bar.fromIdx])} → {toISODate(days[bar.toIdx])}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {editingTask && (
        <TaskModal
          task={editingTask}
          developers={developers}
          onClose={() => setEditingId(null)}
          onSubmit={async (values) => {
            await updateTask(editingTask.id, values);
            setEditingId(null);
          }}
          onDelete={async () => {
            await deleteTask(editingTask.id);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

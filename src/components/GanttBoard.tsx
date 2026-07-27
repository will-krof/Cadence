"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  diffDays,
  isWeekend,
  startOfDay,
  toISODate,
  weekdayLetter,
} from "@/lib/dates";
import { contrastText } from "@/lib/color";
import { safeHttpUrl } from "@/lib/sanitize";
import { Developer, STATUS_OPTIONS, Task, TaskRow, statusMeta } from "@/lib/types";
import { useBoard } from "@/components/BoardProvider";
import {
  AssigneeSelect,
  Avatar,
  SprintPicker,
  Stat,
  StatusPill,
} from "@/components/ui";
import { TaskModal } from "@/components/TaskModal";

const ROW_HEIGHT = 44;
/** Rows kept rendered beyond the viewport, so scrolling doesn't flicker. */
const ROW_OVERSCAN = 6;
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
  const {
    tasks,
    developers,
    sprints,
    sprint,
    sprintId,
    hasUnplanned,
    selectSprint,
    stats,
    updateTask,
    deleteTask,
  } = useBoard();

  const [editingId, setEditingId] = useState<string | null>(null);
  const barDragRef = useRef<BarDrag | null>(null);
  // Bars and their tooltips are addressed directly while dragging.
  const barRefs = useRef(new Map<string, HTMLDivElement>());
  const tipRefs = useRef(new Map<string, HTMLSpanElement>());

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

  // Building the calendar once yields everything the board needs to place
  // things: the visible columns, their keys, and — because a task can start on
  // a hidden weekend — a lookup from any date in range to the nearest column.
  const calendar = useMemo(() => {
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

    const total = diffDays(start, end) + 1;
    const days: Date[] = [];
    const keys: string[] = [];
    // Offset within the full range -> nearest visible column, both directions.
    const firstAtOrAfter = new Int32Array(total).fill(-1);
    const lastAtOrBefore = new Int32Array(total).fill(-1);
    const weekendRuns: { left: number; width: number }[] = [];

    for (let offset = 0; offset < total; offset++) {
      const day = addDays(start, offset);
      if (hideWeekends && isWeekend(day)) continue;
      const index = days.length;
      days.push(day);
      keys.push(toISODate(day));
      firstAtOrAfter[offset] = index;
      lastAtOrBefore[offset] = index;
      if (isWeekend(day)) {
        const previous = weekendRuns[weekendRuns.length - 1];
        if (previous && previous.left + previous.width === index) previous.width += 1;
        else weekendRuns.push({ left: index, width: 1 });
      }
    }

    // Carry the nearest column into the gaps left by hidden weekend days.
    for (let offset = total - 2; offset >= 0; offset--) {
      if (firstAtOrAfter[offset] === -1) {
        firstAtOrAfter[offset] = firstAtOrAfter[offset + 1];
      }
    }
    for (let offset = 1; offset < total; offset++) {
      if (lastAtOrBefore[offset] === -1) {
        lastAtOrBefore[offset] = lastAtOrBefore[offset - 1];
      }
    }

    return { start, total, days, keys, firstAtOrAfter, lastAtOrBefore, weekendRuns };
  }, [tasks, today, sprint, hideWeekends]);

  const { days, keys: dayKeys } = calendar;

  /**
   * Bars are placed by visible column index, not by date difference, so the
   * maths stays correct when weekend columns are filtered out. O(1) per task —
   * the scanning was done once, when the calendar was built.
   */
  const columnSpan = useCallback(
    (from: Date, to: Date) => {
      const { start, total, firstAtOrAfter, lastAtOrBefore } = calendar;
      const fromOffset = diffDays(start, from);
      const toOffset = diffDays(start, to);
      if (toOffset < 0 || fromOffset > total - 1) return null;

      const first = firstAtOrAfter[Math.max(fromOffset, 0)];
      const last = lastAtOrBefore[Math.min(toOffset, total - 1)];
      if (first === -1 || last === -1 || first > last) return null;
      return { left: first * dayWidth, width: (last - first + 1) * dayWidth };
    },
    [calendar, dayWidth]
  );

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

  const openEditor = useCallback((id: string) => setEditingId(id), []);

  // Only the rows on screen are built. A board with hundreds of tasks would
  // otherwise pay for every one of them on the first paint, and again on every
  // change, however far off screen they are.
  const [window_, setWindow] = useState({ top: 0, height: 800 });
  const leftScroll = useRef<HTMLDivElement>(null);
  const rightScroll = useRef<HTMLDivElement>(null);
  const outerScroll = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);

  useEffect(() => {
    const el = compact ? outerScroll.current : rightScroll.current;
    if (!el) return;
    const measure = () =>
      setWindow((prev) =>
        prev.height === el.clientHeight ? prev : { ...prev, height: el.clientHeight }
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact]);

  /** Follow whichever panel the pointer scrolled, and mirror it to the other. */
  function trackScroll(from: HTMLDivElement | null, to: HTMLDivElement | null) {
    if (!from || syncing.current) return;
    if (to && to.scrollTop !== from.scrollTop) {
      syncing.current = true;
      to.scrollTop = from.scrollTop;
      // Released once the mirrored element has fired its own scroll event.
      requestAnimationFrame(() => {
        syncing.current = false;
      });
    }
    const top = from.scrollTop;
    setWindow((prev) => (prev.top === top ? prev : { ...prev, top }));
  }

  function onLeftScroll() {
    trackScroll(leftScroll.current, rightScroll.current);
  }

  function onRightScroll() {
    trackScroll(rightScroll.current, leftScroll.current);
  }

  function onOuterScroll() {
    trackScroll(outerScroll.current, null);
  }

  const rowWindow = useMemo(() => {
    // The header sits in the same scroller, so the first row starts a row down.
    const first = Math.max(
      0,
      Math.floor((window_.top - ROW_HEIGHT) / ROW_HEIGHT) - ROW_OVERSCAN
    );
    const visible = Math.ceil(window_.height / ROW_HEIGHT) + ROW_OVERSCAN * 2;
    const last = Math.min(tasks.length, first + visible);
    return {
      first,
      last,
      before: first * ROW_HEIGHT,
      after: Math.max(0, (tasks.length - last) * ROW_HEIGHT),
      rows: tasks.slice(first, last),
    };
  }, [tasks, window_]);

  /** Where each task's bar sits, recomputed only when the calendar moves. */
  const spans = useMemo(() => {
    const map = new Map<string, { left: number; width: number }>();
    for (const task of tasks) {
      const span = columnSpan(
        startOfDay(new Date(task.startDate)),
        startOfDay(new Date(task.endDate))
      );
      if (span) map.set(task.id, span);
    }
    return map;
  }, [tasks, columnSpan]);

  /** Column indices a drag would land on, given how far the pointer moved. */
  function draggedTo(d: BarDrag, shift: number) {
    let fromIdx = d.fromIdx;
    let toIdx = d.toIdx;
    if (d.mode === "move") {
      fromIdx = clampIdx(d.fromIdx + shift, days.length);
      toIdx = clampIdx(d.toIdx + shift, days.length);
    } else if (d.mode === "start") {
      fromIdx = clampIdx(Math.min(d.fromIdx + shift, d.toIdx), days.length);
    } else {
      toIdx = clampIdx(Math.max(d.toIdx + shift, d.fromIdx), days.length);
    }
    return { fromIdx, toIdx };
  }

  /**
   * A drag moves one bar, so it is written straight to that element rather than
   * through state — re-rendering every row on every pointermove is what made
   * dragging heavy on a busy board.
   */
  function beginBarDrag(
    e: React.PointerEvent,
    task: Task,
    mode: BarMode,
    span: { left: number; width: number }
  ) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.stopPropagation();
    if (barDragRef.current) return;

    const drag: BarDrag = {
      taskId: task.id,
      mode,
      pointerId: e.pointerId,
      startX: e.clientX,
      fromIdx: Math.round(span.left / dayWidth),
      toIdx: Math.round((span.left + span.width) / dayWidth) - 1,
      shift: 0,
      active: false,
    };
    barDragRef.current = drag;

    const bar = barRefs.current.get(task.id);
    const tip = tipRefs.current.get(task.id);

    function paint(fromIdx: number, toIdx: number) {
      if (bar) {
        bar.style.left = `${fromIdx * dayWidth + 2}px`;
        bar.style.width = `${(toIdx - fromIdx + 1) * dayWidth - 4}px`;
      }
      if (tip) {
        tip.style.display = "block";
        tip.textContent = `${dayKeys[fromIdx]} → ${dayKeys[toIdx]}`;
      }
    }

    function onMove(ev: PointerEvent) {
      const d = barDragRef.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      const dx = ev.clientX - d.startX;
      d.shift = Math.round(dx / dayWidth);
      if (!d.active && Math.abs(dx) > BAR_DRAG_THRESHOLD) {
        d.active = true;
        bar?.classList.add("cursor-grabbing");
      }
      if (!d.active) return;
      ev.preventDefault();
      const { fromIdx, toIdx } = draggedTo(d, d.shift);
      paint(fromIdx, toIdx);
    }

    function finish() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      barDragRef.current = null;
      if (tip) tip.style.display = "none";
      bar?.classList.remove("cursor-grabbing");
    }

    /** Hand the bar back to React, undoing anything written during the drag. */
    function restore() {
      const base = spans.get(task.id);
      if (bar && base) {
        bar.style.left = `${base.left + 2}px`;
        bar.style.width = `${base.width - 4}px`;
      }
    }

    function onUp(ev: PointerEvent) {
      const d = barDragRef.current;
      finish();
      if (!d || ev.pointerId !== d.pointerId) return;

      // A press that never moved is a click: open the editor instead.
      if (!d.active) {
        setEditingId(d.taskId);
        return;
      }

      const { fromIdx, toIdx } = draggedTo(d, d.shift);
      const startDate = dayKeys[fromIdx];
      const endDate = dayKeys[toIdx];
      if (
        startDate === toISODate(startOfDay(new Date(task.startDate))) &&
        endDate === toISODate(startOfDay(new Date(task.endDate)))
      ) {
        restore();
        return;
      }
      // Left where the pointer put it; the save re-renders it in place.
      updateTask(task.id, { startDate, endDate });
    }

    function onCancel() {
      finish();
      restore();
    }

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

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
          <SprintPicker
            sprints={sprints}
            sprint={sprint}
            sprintId={sprintId}
            hasUnplanned={hasUnplanned}
            onSelect={selectSprint}
          />
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
        ref={outerScroll}
        onScroll={compact ? onOuterScroll : undefined}
        className={`flex min-h-0 flex-1 ${
          compact ? "thin-scroll overflow-auto" : ""
        }`}
      >
        {/* Left panel: task table */}
        <div
          ref={leftScroll}
          onScroll={compact ? undefined : onLeftScroll}
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

          <div style={{ height: rowWindow.before }} />
          {rowWindow.rows.map((task) => (
            <TableRow
              key={task.id}
              task={task}
              developers={developers}
              gridTemplateColumns={gridTemplateColumns}
              onEdit={openEditor}
              onChange={updateTask}
            />
          ))}
          <div style={{ height: rowWindow.after }} />

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
        <div
          ref={rightScroll}
          onScroll={compact ? undefined : onRightScroll}
          className={compact ? "shrink-0" : "thin-scroll flex-1 overflow-auto"}
        >
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

            {/* One shading layer behind every row, instead of a cell per day
                per task — the gridlines themselves are a repeating gradient. */}
            <div
              className="pointer-events-none absolute left-0 right-0 -z-10"
              style={{ top: ROW_HEIGHT, bottom: 0 }}
            >
              {calendar.weekendRuns.map((run) => (
                <div
                  key={run.left}
                  className="absolute top-0 bottom-0 bg-[var(--plane)]"
                  style={{ left: run.left * dayWidth, width: run.width * dayWidth }}
                />
              ))}
            </div>

            <div style={{ height: rowWindow.before }} />
            {rowWindow.rows.map((task) => {
              const bar = spans.get(task.id);
              const color = task.developer?.color ?? statusMeta(task.status).color;
              return (
                <div
                  key={task.id}
                  className="relative border-b border-[var(--hairline)]"
                  style={{
                    height: ROW_HEIGHT,
                    backgroundImage: `linear-gradient(to right, var(--hairline) 0 1px, transparent 1px ${dayWidth}px)`,
                    backgroundSize: `${dayWidth}px 100%`,
                  }}
                >
                  {bar && (
                    <div
                      ref={(el) => {
                        if (el) barRefs.current.set(task.id, el);
                        else barRefs.current.delete(task.id);
                      }}
                      role="button"
                      tabIndex={0}
                      onPointerDown={(e) => beginBarDrag(e, task, "move", bar)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setEditingId(task.id);
                        }
                      }}
                      className="group/bar absolute top-2 bottom-2 flex cursor-grab touch-none select-none items-center rounded-md px-2 text-left text-[0.6875rem] font-medium leading-none shadow-sm ring-2 ring-[var(--surface)] hover:brightness-95"
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

                      <span
                        ref={(el) => {
                          if (el) tipRefs.current.set(task.id, el);
                          else tipRefs.current.delete(task.id);
                        }}
                        className="pointer-events-none absolute -top-6 left-0 hidden whitespace-nowrap rounded bg-[var(--ink)] px-1.5 py-1 text-[0.625rem] font-medium text-[var(--surface)] shadow"
                      />
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ height: rowWindow.after }} />
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

/**
 * One row of the task table. Memoised because a board can hold hundreds, and
 * editing one task shouldn't repaint the rest.
 */
const TableRow = memo(function TableRow({
  task,
  developers,
  gridTemplateColumns,
  onEdit,
  onChange,
}: {
  task: Task;
  developers: Developer[];
  gridTemplateColumns: string;
  onEdit: (id: string) => void;
  onChange: (id: string, data: Partial<TaskRow>) => void;
}) {
  // Checked here as well as on the way in: a title is a link to whatever the
  // row holds, and only http and https belong in one.
  const link = safeHttpUrl(task.link);

  return (
    <div
      className="group grid items-center border-b border-[var(--hairline)] transition-colors hover:bg-[var(--plane)]"
      style={{ height: ROW_HEIGHT, gridTemplateColumns }}
    >
      <div className="flex min-w-0 items-center gap-1 px-3 text-[0.8125rem]">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-[var(--accent)] hover:underline"
            title={task.description || link}
          >
            {task.title}
          </a>
        ) : (
          <span className="truncate" title={task.description || undefined}>
            {task.title}
          </span>
        )}
        <button
          onClick={() => onEdit(task.id)}
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
          onChange={(status) => onChange(task.id, { status })}
        />
      </div>

      <div className="flex items-center px-2">
        <AssigneeSelect
          developerId={task.developerId}
          developer={task.developer}
          developers={developers}
          onChange={(developerId) => onChange(task.id, { developerId })}
          emptyLabel="—"
          taskTitle={task.title}
        />
      </div>
    </div>
  );
});

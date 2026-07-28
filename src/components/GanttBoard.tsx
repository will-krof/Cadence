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
import { isHttpUrl } from "@/lib/sanitize";
import {
  Developer,
  STATUS_OPTIONS,
  Task,
  TaskRow,
  TaskStatus,
  statusMeta,
} from "@/lib/types";
import { analyseNetwork, Link } from "@/lib/critical-path";
import { useBoard } from "@/components/BoardProvider";
import {
  useColumnWidths,
  useFoldedSteps,
  useHiddenStatuses,
  useShowCriticalPath,
  useShowDependencies,
} from "@/lib/prefs";
import {
  AssigneeSelect,
  Avatar,
  PriorityMark,
  SprintPicker,
  Stat,
  StatusPill,
} from "@/components/ui";
import { TaskEditModal } from "@/components/TaskEditModal";

const ROW_HEIGHT = 44;
/** A step is a smaller thing than a task, and its row says so. */
const STEP_ROW_HEIGHT = 30;

const rowHeight = (task: { parentId: string | null }) =>
  task.parentId ? STEP_ROW_HEIGHT : ROW_HEIGHT;
/** Rows kept rendered beyond the viewport, so scrolling doesn't flicker. */
const ROW_OVERSCAN = 6;
const DAY_WIDTH = 44;
const DAY_WIDTH_COMPACT = 36;
const DAYS_BEFORE_TODAY = 3;
const MIN_DAYS_AFTER_TODAY = 21;
const MIN_COL_WIDTH = 64;
/** Pointer travel before a press on a bar becomes a drag rather than a click. */
const BAR_DRAG_THRESHOLD = 4;

/**
 * The colour of the longest chain, and of a link the plan already breaks. It
 * is never the only thing saying so — critical bars carry a mark, and a broken
 * link is drawn dashed as well as red.
 */
const CRITICAL = "var(--danger)";
/** How far a dependency line stands off the bar it leaves and the one it enters. */
const LINK_STUB = 9;

/**
 * One dependency line: out of the right end of the blocker, along, and into the
 * left end of the task that waits. When the two bars leave no room between them
 * — which is exactly the case a dependency is meant to catch — the line steps
 * out of the blocker's row first and comes back, rather than running backwards
 * through both bars.
 */
function linkPath(x1: number, y1: number, x2: number, y2: number, rowH: number) {
  const leave = x1 + LINK_STUB;
  const enter = x2 - LINK_STUB;
  if (enter >= leave) return `M${x1},${y1}H${leave}V${y2}H${x2}`;
  const skirt = y1 + (y2 >= y1 ? rowH / 2 - 1 : 1 - rowH / 2);
  return `M${x1},${y1}H${leave}V${skirt}H${enter}V${y2}H${x2}`;
}

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

/** Left to right, which is the order the handles and the header read in. */
const COL_ORDER: ColKey[] = ["task", "status", "developer"];

const COL_LABELS: Record<ColKey, string> = {
  task: "Task",
  status: "Status",
  developer: "Developer",
};

const COL_WIDTHS_WIDE: ColWidths = { task: 240, status: 132, developer: 132 };
const COL_WIDTHS_COMPACT: ColWidths = { task: 132, status: 104, developer: 96 };

export function GanttBoard({ canEdit = true }: { canEdit?: boolean }) {
  const {
    tasks,
    assignable: developers,
    sprints,
    sprint,
    sprintId,
    hasUnplanned,
    selectSprint,
    stats,
    updateTask,
    reorderTasks,
  } = useBoard();

  const [hiddenStatuses] = useHiddenStatuses();
  const [folded, setFolded] = useFoldedSteps();

  // How far along each task's steps are, counted once for the whole board
  // rather than per row: a row only needs its own pair of numbers.
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

  /**
   * What the chart draws. Folded, it is whole tasks only — their steps are
   * folded into the count beside the title. A step whose task is on another
   * board stays: nothing here would account for it.
   */
  const rows = useMemo(() => {
    if (!folded) return tasks;
    const whole = new Set(tasks.filter((t) => !t.parentId).map((t) => t.id));
    return tasks.filter((t) => !(t.parentId && whole.has(t.parentId)));
  }, [tasks, folded]);

  const foldable = useMemo(
    () => tasks.some((t) => t.parentId),
    [tasks]
  );

  const [showLinks, setShowLinks] = useShowDependencies();
  const [showCritical, setShowCritical] = useShowCriticalPath();

  /**
   * Who blocks whom on the board as drawn, and the longest chain through it.
   * Read from `rows` rather than every task: a link to a bar that isn't there —
   * a step folded away, work planned into another sprint — has nowhere to land.
   */
  const network = useMemo(() => analyseNetwork(rows), [rows]);
  /** Where each row sits, for drawing a line from one bar to another. */
  const rowIndex = useMemo(
    () => new Map(rows.map((t, i) => [t.id, i])),
    [rows]
  );
  /** How many tasks each one is holding up, for the chip on its row. */
  const blockCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of network.links) {
      counts.set(link.from, (counts.get(link.from) ?? 0) + 1);
    }
    return counts;
  }, [network]);
  // The task on screen, and whether it was opened to be read or to be changed.
  // Clicking a task asks for the first; the pencil asks for the second, and is
  // only there for a role that may have it.
  const [opened, setOpened] = useState<{ id: string; editing: boolean } | null>(
    null
  );
  // Which row is being dragged, and where it would land.
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [dropRow, setDropRow] = useState<{ id: string; after: boolean } | null>(
    null
  );
  const barDragRef = useRef<BarDrag | null>(null);
  // Bars and their tooltips are addressed directly while dragging.
  const barRefs = useRef(new Map<string, HTMLDivElement>());
  const tipRefs = useRef(new Map<string, HTMLSpanElement>());

  // Weekends are hidden to begin with: most plans don't run over them, and the
  // columns they add are two-fifths of the width for none of the work.
  const [hideWeekends, setHideWeekends] = useState(true);
  const [compact, setCompact] = useState(false);
  // Columns somebody has sized by hand are remembered, so the drag is done once
  // rather than on every visit. Until they do, the width follows the viewport.
  const [storedWidths, storeWidths] = useColumnWidths();
  const [colWidths, setColWidths] = useState<ColWidths>(
    () => ({ ...COL_WIDTHS_WIDE, ...storedWidths })
  );

  const userSizedRef = useRef(storedWidths != null);
  const resizingRef = useRef<{
    key: ColKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  // The live widths, for the release handler — reading them from state there
  // would close over whatever they were when the drag began.
  const widthsRef = useRef(colWidths);
  useEffect(() => {
    widthsRef.current = colWidths;
  }, [colWidths]);

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
      // Written on release rather than on every pixel of the drag: the widths
      // are a choice, and one storage write is what making it costs.
      if (resizingRef.current) storeWidths(widthsRef.current);
      resizingRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [storeWidths]);

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

  const openTask = useCallback(
    (id: string) => setOpened({ id, editing: false }),
    []
  );
  const editTask = useCallback(
    (id: string) => setOpened({ id, editing: true }),
    []
  );

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

  /**
   * Where every row starts, and how tall the lot is. Rows are no longer all one
   * height — a step is shorter than a task — so the window can't be worked out
   * with a division, and this is what it looks the answer up in.
   */
  const offsets = useMemo(() => {
    const tops = new Array<number>(rows.length + 1);
    let at = 0;
    for (let i = 0; i < rows.length; i++) {
      tops[i] = at;
      at += rowHeight(rows[i]);
    }
    tops[rows.length] = at;
    return tops;
  }, [rows]);

  const rowWindow = useMemo(() => {
    const total = offsets[rows.length] ?? 0;
    // The header sits in the same scroller, so the first row starts a row down.
    const top = window_.top - ROW_HEIGHT;

    /** The last row starting at or before a point, by bisection. */
    const rowAt = (y: number) => {
      let lo = 0;
      let hi = rows.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (offsets[mid] <= y) lo = mid + 1;
        else hi = mid;
      }
      return Math.max(0, lo - 1);
    };

    const first = Math.max(0, rowAt(top) - ROW_OVERSCAN);
    const last = Math.min(
      rows.length,
      rowAt(top + window_.height) + 1 + ROW_OVERSCAN
    );
    return {
      first,
      last,
      before: offsets[first] ?? 0,
      after: Math.max(0, total - (offsets[last] ?? total)),
      rows: rows.slice(first, last),
    };
  }, [rows, offsets, window_]);

  /** Where each task's bar sits, recomputed only when the calendar moves. */
  const spans = useMemo(() => {
    const map = new Map<string, { left: number; width: number }>();
    for (const task of rows) {
      const span = columnSpan(
        startOfDay(new Date(task.startDate)),
        startOfDay(new Date(task.endDate))
      );
      if (span) map.set(task.id, span);
    }
    return map;
  }, [rows, columnSpan]);

  /**
   * The lines between bars, worked out once for the board rather than per row.
   * A link needs both its ends drawn — the row's place in the list for the y,
   * its bar's span for the x — so anything half on screen is left out.
   */
  const linkLines = useMemo(() => {
    if (!showLinks) return [];
    const lines: (Link & { d: string; head: string })[] = [];
    for (const link of network.links) {
      const from = spans.get(link.from);
      const to = spans.get(link.to);
      const fromRow = rowIndex.get(link.from);
      const toRow = rowIndex.get(link.to);
      if (!from || !to || fromRow === undefined || toRow === undefined) continue;

      const y1 = ROW_HEIGHT + offsets[fromRow] + rowHeight(rows[fromRow]) / 2;
      const y2 = ROW_HEIGHT + offsets[toRow] + rowHeight(rows[toRow]) / 2;
      // Bars sit two pixels inside their span at each end; the line meets the
      // bar rather than the column.
      const x1 = from.left + from.width - 2;
      const x2 = to.left + 2;
      lines.push({
        ...link,
        d: linkPath(x1, y1, x2, y2, rowHeight(rows[fromRow])),
        head: `${x2},${y2} ${x2 - 6},${y2 - 4} ${x2 - 6},${y2 + 4}`,
      });
    }
    return lines;
  }, [showLinks, network, spans, rowIndex, offsets, rows]);

  /**
   * Moving a row. A task takes its steps with it and lands between two other
   * tasks; a step only moves among the steps of its own task, because a step
   * of another task is that task's business. What comes back is the whole list
   * renumbered, which is what the server is sent.
   */
  const moveRow = useCallback(
    (dragId: string, targetId: string, after: boolean) => {
      if (dragId === targetId) return;

      const moved = tasks.find((t) => t.id === dragId);
      const target = tasks.find((t) => t.id === targetId);
      if (!moved || !target) return;

      // A step among its own steps; anything else is refused rather than
      // guessed at — dropping a step onto another task would be a re-parenting,
      // and that is the form's business.
      if ((moved.parentId ?? null) !== (target.parentId ?? null)) return;

      // A task travels with its steps, so the block that moves is the row and
      // everything filed under it.
      const block = tasks.filter(
        (t) => t.id === dragId || (moved.parentId == null && t.parentId === dragId)
      );
      const blockIds = new Set(block.map((t) => t.id));

      const rest = tasks.filter((t) => !blockIds.has(t.id));
      // Land after the target's own steps, so a task doesn't come to rest
      // inside another one.
      const anchor = after
        ? rest.reduce(
            (last, t, i) =>
              t.id === targetId || (target.parentId == null && t.parentId === targetId)
                ? i
                : last,
            -1
          ) + 1
        : rest.findIndex((t) => t.id === targetId);
      if (anchor < 0) return;

      const next = [...rest.slice(0, anchor), ...block, ...rest.slice(anchor)];
      const order = next.map((t, i) => ({ id: t.id, order: i * 10 }));
      const changed = order.filter((row, i) => row.order !== next[i].order);
      if (changed.length > 0) reorderTasks(changed);
    },
    [tasks, reorderTasks]
  );

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
      // A role that may watch the timeline still opens what it points at —
      // the press is followed to its end either way. Moving a bar is what
      // takes the right to change the work, so that is what stops here.
      if (!canEdit) return;
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

      // A press that never moved is a click: read the task rather than move it.
      if (!d.active) {
        openTask(d.taskId);
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

  const openedTask = tasks.find((t) => t.id === opened?.id) ?? null;

  const gridTemplateColumns = `${colWidths.task}px ${colWidths.status}px ${colWidths.developer}px`;
  const leftPanelWidth = colWidths.task + colWidths.status + colWidths.developer;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-[var(--hairline)] px-4 py-3 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Stat label="Total" value={stats.total} />
            {/* A status put away in the tracker is one nobody is watching, so
                it drops out of the tally here too until it comes back. */}
            {STATUS_OPTIONS.filter((s) => !hiddenStatuses.includes(s.value)).map((s) => (
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
            {/* What the chain of blocked work actually costs, which is the one
                number a list of tasks can't be read off. */}
            {network.critical.size > 0 && (
              <span
                className="flex items-center gap-1.5 text-[0.6875rem] text-[var(--ink-secondary)]"
                title="The longest chain of tasks waiting on each other — a day lost here is a day off the end"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: CRITICAL }}
                />
                Critical path
                <span className="font-semibold tabular-nums text-[var(--ink)]">
                  {network.critical.size} · {network.span}d
                </span>
              </span>
            )}
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
          {foldable && (
            <label className="flex cursor-pointer select-none items-center gap-2 pb-2 text-xs text-[var(--ink-secondary)]">
              <input
                type="checkbox"
                checked={folded}
                onChange={(e) => setFolded(e.target.checked)}
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
              />
              Fold subtasks
            </label>
          )}
          {/* Nothing to offer on a board where nothing waits on anything. */}
          {network.links.length > 0 && (
            <>
              <label className="flex cursor-pointer select-none items-center gap-2 pb-2 text-xs text-[var(--ink-secondary)]">
                <input
                  type="checkbox"
                  checked={showLinks}
                  onChange={(e) => setShowLinks(e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                />
                Dependencies
              </label>
              <label className="flex cursor-pointer select-none items-center gap-2 pb-2 text-xs text-[var(--ink-secondary)]">
                <input
                  type="checkbox"
                  checked={showCritical}
                  onChange={(e) => setShowCritical(e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                />
                Critical path
              </label>
            </>
          )}
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
        {/* Left panel: task table. The frame around it doesn't scroll, which is
            what the resize handles hang off: inside the scroller the last one
            sat under the scrollbar and half outside the panel, so the one
            column at the edge — Developer — was the one that couldn't be
            dragged. */}
        <div
          className="relative shrink-0 border-r border-[var(--hairline)]"
          style={{ width: leftPanelWidth }}
        >
        <div
          ref={leftScroll}
          onScroll={compact ? undefined : onLeftScroll}
          className={compact ? "" : "thin-scroll h-full overflow-y-auto"}
        >
          <div
            className="sticky top-0 z-20 grid items-center border-b border-[var(--hairline)] bg-[var(--surface)] text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--ink-muted)]"
            style={{ height: ROW_HEIGHT, gridTemplateColumns }}
          >
            {COL_ORDER.map((key) => (
              <div key={key} className={key === "task" ? "truncate px-3" : "truncate px-2"}>
                {COL_LABELS[key]}
              </div>
            ))}
          </div>

          <div style={{ height: rowWindow.before }} />
          {rowWindow.rows.map((task) => (
            <TableRow
              key={task.id}
              task={task}
              steps={stepCounts.get(task.id)}
              blocks={blockCounts.get(task.id) ?? 0}
              critical={showCritical && network.critical.has(task.id)}
              hiddenStatuses={hiddenStatuses}
              developers={developers}
              gridTemplateColumns={gridTemplateColumns}
              onOpen={openTask}
              onEdit={editTask}
              onChange={updateTask}
              canEdit={canEdit}
              dragging={dragRow === task.id}
              dropping={dropRow?.id === task.id ? dropRow.after : null}
              onDragRow={setDragRow}
              onDragOverRow={setDropRow}
              onDropRow={(targetId, after) => {
                if (dragRow) moveRow(dragRow, targetId, after);
                setDragRow(null);
                setDropRow(null);
              }}
            />
          ))}
          <div style={{ height: rowWindow.after }} />

          {tasks.length === 0 && (
            <div className="px-3 py-6 text-[0.8125rem] text-[var(--ink-muted)]">
              No tasks yet.
            </div>
          )}

        </div>

        {/* Column resize handles — pointer only. Every column has one,
            Developer included: it is the one holding names, which are the
            least predictable thing on the row. */}
        {!compact &&
          COL_ORDER.map((key, i) => {
            const left = COL_ORDER.slice(0, i + 1).reduce(
              (at, k) => at + colWidths[k],
              0
            );
            return (
              <div
                key={key}
                onMouseDown={(e) => beginResize(e, key)}
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize the ${COL_LABELS[key]} column`}
                className="absolute top-0 bottom-0 z-30 -ml-[3px] w-1.5 cursor-col-resize transition-colors hover:bg-[var(--accent)]/40"
                style={{ left }}
              />
            );
          })}
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

            {/* Who blocks whom, over the rows and under nothing: the lines end
                at the bars they join, so a head landing on a bar is the point.
                Drawn for the whole board rather than the window — there are far
                fewer links than rows, and a line whose other end is scrolled
                away still has to leave the screen in the right direction. */}
            {linkLines.length > 0 && (
              <svg
                className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible"
                width={days.length * dayWidth}
                height={ROW_HEIGHT + (offsets[rows.length] ?? 0)}
                aria-hidden="true"
              >
                {linkLines.map((line) => {
                  const onPath = showCritical && line.critical;
                  const color = onPath
                    ? CRITICAL
                    : line.late
                      ? "#ec835a"
                      : "var(--baseline)";
                  return (
                    <g key={`${line.from}-${line.to}`}>
                      <path
                        d={line.d}
                        fill="none"
                        stroke={color}
                        strokeWidth={onPath ? 2 : 1.5}
                        // A link the plan already breaks — the blocker finishes
                        // after the task waiting on it starts — is drawn broken.
                        strokeDasharray={line.late ? "3 3" : undefined}
                        strokeLinejoin="round"
                      />
                      <polygon points={line.head} fill={color} />
                    </g>
                  );
                })}
              </svg>
            )}

            <div style={{ height: rowWindow.before }} />
            {rowWindow.rows.map((task) => {
              const bar = spans.get(task.id);
              const color = task.developer?.color ?? statusMeta(task.status).color;
              const critical = showCritical && network.critical.has(task.id);
              return (
                <div
                  key={task.id}
                  className="relative border-b border-[var(--hairline)]"
                  style={{
                    height: rowHeight(task),
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
                          openTask(task.id);
                        }
                      }}
                      /* A step is drawn thinner than the task it belongs to, so
                         a plan reads as its shape before it reads as its
                         labels. */
                      /* The same inset in a shorter row: a step's bar comes out
                         half the height of the task it belongs to, so a plan
                         reads as its shape before it reads as its labels. */
                      className={`group/bar absolute top-2 bottom-2 flex touch-none select-none items-center rounded-md px-2 text-left text-[0.6875rem] font-medium leading-none shadow-sm ring-2 ring-[var(--surface)] hover:brightness-95 ${
                        canEdit ? "cursor-grab" : "cursor-default"
                      }`}
                      style={{
                        left: bar.left + 2,
                        width: bar.width - 4,
                        background: color,
                        color: contrastText(color),
                        // Outline rather than the ring, which the bar already
                        // uses to lift itself off the row behind it.
                        ...(critical
                          ? { outline: `2px solid ${CRITICAL}`, outlineOffset: 1 }
                          : null),
                      }}
                      title={[
                        task.title,
                        task.developer?.name,
                        critical ? "on the critical path" : null,
                      ]
                        .filter(Boolean)
                        .join(" — ")}
                    >
                      {/* Grab either end to reschedule just that date. */}
                      {canEdit && (
                        <>
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
                        </>
                      )}

                      {task.developer && !task.parentId && (
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

      {openedTask && opened && (
        <TaskEditModal
          task={openedTask}
          canEdit={canEdit}
          editing={opened.editing}
          onClose={() => setOpened(null)}
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
  steps,
  blocks,
  critical,
  hiddenStatuses,
  developers,
  gridTemplateColumns,
  onOpen,
  onEdit,
  onChange,
  canEdit,
  dragging,
  dropping,
  onDragRow,
  onDragOverRow,
  onDropRow,
}: {
  task: Task;
  /** How many of this task's steps are done, when it has any. */
  steps?: { done: number; total: number };
  /** How many tasks on this board are waiting on this one. */
  blocks: number;
  /** This task is on the longest chain of blocked work. */
  critical: boolean;
  /** Read once for the board and handed down, not read per row. */
  hiddenStatuses: TaskStatus[];
  developers: Developer[];
  gridTemplateColumns: string;
  /** Reading the task: what clicking it anywhere but the pencil asks for. */
  onOpen: (id: string) => void;
  /** Changing it: the pencil, which only a role that may is shown. */
  onEdit: (id: string) => void;
  onChange: (id: string, data: Partial<TaskRow>) => void;
  /** Whether this viewer may change the work, or only read it. */
  canEdit: boolean;
  /** This row is the one being dragged. */
  dragging: boolean;
  /** A row would land here: below it when true, above it when false. */
  dropping: boolean | null;
  onDragRow: (id: string | null) => void;
  onDragOverRow: (at: { id: string; after: boolean } | null) => void;
  onDropRow: (targetId: string, after: boolean) => void;
}) {
  // Checked here as well as on the way in: a title is a link to whatever the
  // row holds, and only http and https belong in one.
  const link = isHttpUrl(task.link) ? task.link : null;

  // A step's row is shorter than a task's, so what sits in it is smaller too:
  // the selects lose a little padding rather than overflowing the row.
  const step = task.parentId != null;

  /** Which half of the row the pointer is in — above it, or below it. */
  function landsAfter(e: React.DragEvent) {
    const box = e.currentTarget.getBoundingClientRect();
    return e.clientY - box.top > box.height / 2;
  }

  return (
    <div
      draggable={canEdit}
      onDragStart={(e) => {
        // Firefox refuses to start a drag without something on the transfer.
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragRow(task.id);
      }}
      onDragEnd={() => {
        onDragRow(null);
        onDragOverRow(null);
      }}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        onDragOverRow({ id: task.id, after: landsAfter(e) });
      }}
      onDragLeave={() => onDragOverRow(null)}
      onDrop={(e) => {
        e.preventDefault();
        onDropRow(task.id, landsAfter(e));
      }}
      className={`group relative grid items-center border-b border-[var(--hairline)] transition-colors hover:bg-[var(--plane)] ${
        dragging ? "opacity-40" : ""
      } ${
        step
          ? "[&_select]:py-0.5 [&_select]:text-[0.75rem] [&_select]:leading-tight"
          : ""
      }`}
      style={{ height: rowHeight(task), gridTemplateColumns }}
    >
      {/* The line a row would land on, drawn where it would land. */}
      {dropping != null && (
        <span
          className={`pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-[var(--accent)] ${
            dropping ? "bottom-0" : "top-0"
          }`}
          aria-hidden="true"
        />
      )}
      <div
        className={`flex min-w-0 items-center gap-1 px-3 ${
          step ? "text-[0.75rem]" : "text-[0.8125rem]"
        }`}
        style={step ? { paddingLeft: "1.75rem" } : undefined}
      >
        {canEdit && (
          <span
            className="shrink-0 cursor-grab text-[var(--ink-muted)] opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
            title="Drag to reorder"
            aria-hidden="true"
          >
            <GripIcon />
          </span>
        )}
        {/* A step reads under the task it belongs to, and says so. */}
        {step && (
          <span
            className="shrink-0 text-[var(--ink-muted)]"
            aria-label="Subtask"
            title="A step of the task above"
          >
            ↳
          </span>
        )}
        {/* Not a kind of status, so it sits beside the title rather than in
            the status column: this says which of two waiting tasks goes first. */}
        <PriorityMark priority={task.priority} />
        {/* The title opens the task, whether or not it carries a link —
            clicking a task should mean one thing. Where there is a link, it
            keeps its own mark beside the title rather than swallowing it. */}
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          className="truncate text-left hover:underline"
          title={task.description || "Open this task"}
        >
          {task.title}
        </button>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[var(--accent)] hover:underline"
            title={link}
            aria-label={`Open the link on ${task.title}`}
          >
            ↗
          </a>
        )}
        {/* One chip for both halves of the same fact: what this waits on, and
            what waits on it. A task on the critical path is always one with
            links, so its chip is the same chip — marked with a diamond and
            said in full in the tooltip, rather than told by its colour. */}
        {(task.blockedBy.length > 0 || blocks > 0) && (
          <span
            className={`shrink-0 rounded-full px-1.5 text-[0.625rem] tabular-nums ${
              critical
                ? "font-medium"
                : "border border-[var(--hairline)] text-[var(--ink-muted)]"
            }`}
            style={
              critical
                ? {
                    color: CRITICAL,
                    background: `color-mix(in srgb, ${CRITICAL} 14%, transparent)`,
                  }
                : undefined
            }
            title={[
              critical
                ? "On the critical path — a day lost here is a day off the end"
                : null,
              task.blockedBy.length > 0
                ? `Waits on ${task.blockedBy.length}`
                : null,
              blocks > 0 ? `Blocks ${blocks}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          >
            {critical && "◆"}
            {task.blockedBy.length > 0 && `⇢${task.blockedBy.length}`}
            {task.blockedBy.length > 0 && blocks > 0 && " "}
            {blocks > 0 && `${blocks}⇢`}
          </span>
        )}
        {steps && (
          <span
            className="shrink-0 rounded-full border border-[var(--hairline)] px-1.5 text-[0.625rem] tabular-nums text-[var(--ink-muted)]"
            title={`${steps.done} of ${steps.total} steps done`}
          >
            {steps.done}/{steps.total}
          </span>
        )}
        {/* Only for a role that may change the work: reading one is a click on
            the title, and a pencil that opens a form nothing can save is a
            promise the board can't keep. */}
        {canEdit && (
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
        )}
      </div>

      <div className="px-2">
        <StatusPill
          status={task.status}
          hidden={hiddenStatuses}
          disabled={!canEdit}
          onChange={(status) => onChange(task.id, { status })}
        />
      </div>

      <div className="flex items-center px-2">
        <AssigneeSelect
          developerId={task.developerId}
          developer={task.developer}
          developers={developers}
          disabled={!canEdit}
          onChange={(developerId) => onChange(task.id, { developerId })}
          emptyLabel="—"
          taskTitle={task.title}
        />
      </div>
    </div>
  );
});

function GripIcon() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
      <circle cx="3" cy="2" r="1" />
      <circle cx="7" cy="2" r="1" />
      <circle cx="3" cy="6" r="1" />
      <circle cx="7" cy="6" r="1" />
      <circle cx="3" cy="10" r="1" />
      <circle cx="7" cy="10" r="1" />
    </svg>
  );
}

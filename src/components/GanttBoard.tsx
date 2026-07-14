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
import { Developer, Sprint, STATUS_OPTIONS, Task, TaskStatus, statusMeta } from "@/lib/types";

const ROW_HEIGHT = 40;
const DAY_WIDTH = 40;
const DAYS_BEFORE_TODAY = 3;
const MIN_DAYS_AFTER_TODAY = 21;
const MIN_COL_WIDTH = 60;

type ColKey = "task" | "status" | "developer";
type ColWidths = Record<ColKey, number>;

const DEFAULT_COL_WIDTHS: ColWidths = { task: 200, status: 130, developer: 130 };

export default function GanttBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddDeveloper, setShowAddDeveloper] = useState(false);
  const [colWidths, setColWidths] = useState<ColWidths>(DEFAULT_COL_WIDTHS);

  const resizingRef = useRef<{
    key: ColKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    refreshAll();
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

  function startResize(key: ColKey) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = { key, startX: e.clientX, startWidth: colWidths[key] };
    };
  }

  async function refreshAll() {
    setLoading(true);
    const [taskRes, devRes, sprintRes] = await Promise.all([
      fetch("/api/tasks"),
      fetch("/api/developers"),
      fetch("/api/sprint"),
    ]);
    setTasks(await taskRes.json());
    setDevelopers(await devRes.json());
    setSprint(await sprintRes.json());
    setLoading(false);
  }

  async function updateSprint(startDate: string, endDate: string) {
    const res = await fetch("/api/sprint", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate }),
    });
    setSprint(await res.json());
  }

  const today = useMemo(() => startOfDay(new Date()), []);

  const { rangeStart, days } = useMemo(() => {
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
    const days = Array.from({ length: count }, (_, i) => addDays(start, i));
    return { rangeStart: start, days };
  }, [tasks, today, sprint]);

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

  const stats = useMemo(() => {
    const total = tasks.length;
    const counts: Record<TaskStatus, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      IN_TEST: 0,
      ON_HOLD: 0,
      DONE: 0,
    };
    for (const t of tasks) counts[t.status]++;
    const progress = total === 0 ? 0 : (counts.DONE / total) * 100;
    return { total, counts, progress };
  }, [tasks]);

  async function updateTask(id: string, data: Partial<Task>) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...data } : t))
    );
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const updated = await res.json();
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }

  async function createTask(input: {
    title: string;
    startDate: string;
    endDate: string;
    developerId: string | null;
  }) {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const created = await res.json();
    setTasks((prev) => [...prev, created]);
    setShowAddTask(false);
  }

  async function createDeveloper(input: { name: string; color: string }) {
    const res = await fetch("/api/developers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const created = await res.json();
    setDevelopers((prev) => [...prev, created]);
    setShowAddDeveloper(false);
  }

  async function deleteDeveloper(id: string) {
    setDevelopers((prev) => prev.filter((d) => d.id !== id));
    await fetch(`/api/developers/${id}`, { method: "DELETE" });
    setTasks((prev) =>
      prev.map((t) => (t.developerId === id ? { ...t, developerId: null, developer: null } : t))
    );
  }

  if (loading) {
    return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  }

  const gridTemplateColumns = `${colWidths.task}px ${colWidths.status}px ${colWidths.developer}px`;
  const leftPanelWidth = colWidths.task + colWidths.status + colWidths.developer;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div>
          <h1 className="text-lg font-semibold">Gantt Chart</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span>Total: {stats.total}</span>
            {STATUS_OPTIONS.map((s) => (
              <span key={s.value}>
                {s.label}: {stats.counts[s.value]}
              </span>
            ))}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Progress: {stats.progress.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex items-end gap-4">
          <div className="flex items-end gap-2">
            <Field label="Sprint start">
              <input
                type="date"
                value={sprint ? toISODate(new Date(sprint.startDate)) : ""}
                onChange={(e) =>
                  updateSprint(
                    e.target.value,
                    sprint ? toISODate(new Date(sprint.endDate)) : e.target.value
                  )
                }
                className="input"
              />
            </Field>
            <Field label="Sprint end">
              <input
                type="date"
                value={sprint ? toISODate(new Date(sprint.endDate)) : ""}
                onChange={(e) =>
                  updateSprint(
                    sprint ? toISODate(new Date(sprint.startDate)) : e.target.value,
                    e.target.value
                  )
                }
                className="input"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAddDeveloper(true)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              + Developer
            </button>
            <button
              onClick={() => setShowAddTask(true)}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900"
            >
              + Task
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: task table */}
        <div
          className="relative shrink-0 overflow-y-auto border-r border-zinc-200 dark:border-zinc-800"
          style={{ width: leftPanelWidth }}
        >
          <div
            className="grid border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900"
            style={{ height: ROW_HEIGHT, gridTemplateColumns }}
          >
            <div className="flex items-center px-3">Task</div>
            <div className="flex items-center px-2">Status</div>
            <div className="flex items-center px-2">Developer</div>
          </div>
          {tasks.map((task) => (
            <div
              key={task.id}
              className="group grid items-center border-b border-zinc-100 dark:border-zinc-900"
              style={{ height: ROW_HEIGHT, gridTemplateColumns }}
            >
              <div className="flex items-center gap-1 px-3 text-sm">
                <span className="truncate">{task.title}</span>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="ml-auto shrink-0 text-zinc-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                  title="Delete task"
                >
                  ✕
                </button>
              </div>
              <div className="px-2">
                <select
                  value={task.status}
                  onChange={(e) =>
                    updateTask(task.id, { status: e.target.value as TaskStatus })
                  }
                  className="w-full rounded border-none px-1.5 py-1 text-xs font-medium outline-none"
                  style={{
                    background: statusMeta(task.status).color,
                    color: statusMeta(task.status).text,
                  }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="px-2">
                <select
                  value={task.developerId ?? ""}
                  onChange={(e) =>
                    updateTask(task.id, { developerId: e.target.value || null })
                  }
                  className="w-full rounded border border-zinc-200 bg-transparent px-1.5 py-1 text-xs dark:border-zinc-700"
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
            <div className="p-4 text-sm text-zinc-400">No tasks yet.</div>
          )}

          {/* Column resize handles */}
          <div
            onMouseDown={startResize("task")}
            className="absolute top-0 bottom-0 z-10 w-1.5 -ml-[3px] cursor-col-resize hover:bg-blue-400/50"
            style={{ left: colWidths.task }}
          />
          <div
            onMouseDown={startResize("status")}
            className="absolute top-0 bottom-0 z-10 w-1.5 -ml-[3px] cursor-col-resize hover:bg-blue-400/50"
            style={{ left: colWidths.task + colWidths.status }}
          />
        </div>

        {/* Right panel: timeline */}
        <div className="flex-1 overflow-auto">
          <div className="relative" style={{ width: days.length * DAY_WIDTH }}>
            {sprintRange && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 -z-10 bg-indigo-500/5"
                style={{
                  left: diffDays(rangeStart, sprintRange.start) * DAY_WIDTH,
                  width:
                    (diffDays(sprintRange.start, sprintRange.end) + 1) * DAY_WIDTH,
                }}
              />
            )}
            <div
              className="grid border-b border-zinc-200 dark:border-zinc-800"
              style={{
                gridTemplateColumns: `repeat(${days.length}, ${DAY_WIDTH}px)`,
                height: ROW_HEIGHT,
              }}
            >
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  className={`flex flex-col items-center justify-center border-l text-xs ${
                    isWeekend(d)
                      ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                      : "border-zinc-100 dark:border-zinc-900"
                  } ${diffDays(today, d) === 0 ? "bg-blue-50 dark:bg-blue-950" : ""} ${
                    isInSprint(d) ? "border-b-2 border-b-indigo-500" : ""
                  }`}
                >
                  <span className="font-semibold">{d.getDate()}</span>
                  <span className="text-[10px] text-zinc-400">
                    {weekdayLetter(d)}
                  </span>
                </div>
              ))}
            </div>

            {tasks.map((task) => {
              const s = startOfDay(new Date(task.startDate));
              const e = startOfDay(new Date(task.endDate));
              const offset = diffDays(rangeStart, s);
              const span = Math.max(1, diffDays(s, e) + 1);
              const color = task.developer?.color ?? statusMeta(task.status).color;
              return (
                <div
                  key={task.id}
                  className="relative border-b border-zinc-100 dark:border-zinc-900"
                  style={{ height: ROW_HEIGHT }}
                >
                  <div
                    className="absolute top-1.5 bottom-1.5 rounded-md px-2 text-[11px] font-medium leading-none flex items-center truncate shadow-sm"
                    style={{
                      left: offset * DAY_WIDTH,
                      width: span * DAY_WIDTH - 4,
                      background: color,
                      color: contrastText(color),
                    }}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showAddTask && (
        <AddTaskModal
          developers={developers}
          onClose={() => setShowAddTask(false)}
          onCreate={createTask}
        />
      )}
      {showAddDeveloper && (
        <AddDeveloperModal
          developers={developers}
          onClose={() => setShowAddDeveloper(false)}
          onCreate={createDeveloper}
          onDelete={deleteDeveloper}
        />
      )}
    </div>
  );
}

function AddTaskModal({
  developers,
  onClose,
  onCreate,
}: {
  developers: Developer[];
  onClose: () => void;
  onCreate: (input: {
    title: string;
    startDate: string;
    endDate: string;
    developerId: string | null;
  }) => void;
}) {
  const today = toISODate(new Date());
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [developerId, setDeveloperId] = useState("");

  return (
    <Modal onClose={onClose} title="New Task">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          onCreate({
            title: title.trim(),
            startDate,
            endDate: endDate < startDate ? startDate : endDate,
            developerId: developerId || null,
          });
        }}
      >
        <Field label="Title">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input"
            placeholder="e.g. [Backend] API update"
          />
        </Field>
        <div className="flex gap-3">
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
        <Field label="Developer">
          <select
            value={developerId}
            onChange={(e) => setDeveloperId(e.target.value)}
            className="input"
          >
            <option value="">Unassigned</option>
            {developers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddDeveloperModal({
  developers,
  onClose,
  onCreate,
  onDelete,
}: {
  developers: Developer[];
  onClose: () => void;
  onCreate: (input: { name: string; color: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#60a5fa");

  return (
    <Modal onClose={onClose} title="Developers">
      <div className="mb-4 flex flex-col gap-2">
        {developers.map((d) => (
          <div key={d.id} className="flex items-center gap-2 text-sm">
            <span
              className="h-3 w-3 rounded-full"
              style={{ background: d.color }}
            />
            <span className="flex-1">{d.name}</span>
            <button
              onClick={() => onDelete(d.id)}
              className="text-zinc-300 hover:text-red-500"
            >
              ✕
            </button>
          </div>
        ))}
        {developers.length === 0 && (
          <div className="text-sm text-zinc-400">No developers yet.</div>
        )}
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onCreate({ name: name.trim(), color });
          setName("");
        }}
      >
        <Field label="Name" className="flex-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="e.g. Alex"
          />
        </Field>
        <Field label="Color">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-zinc-200 dark:border-zinc-700"
          />
        </Field>
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-zinc-500 ${className}`}>
      {label}
      {children}
    </label>
  );
}

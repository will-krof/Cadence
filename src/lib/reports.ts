import { TaskStatus } from "@/lib/types";

/**
 * What a project's numbers are worked out from, and what they come to.
 *
 * The arithmetic lives here rather than in the route so it can be read on its
 * own — every one of these is a claim about the work that somebody will plan
 * around, and a claim like that should be checkable without a database beside
 * it. The route's job is to fetch the rows and hand them over.
 *
 * Nothing here is stored. A report is a reading of the tasks and their history,
 * so it is always as true as the boards are, and switching the screen off loses
 * nothing.
 */

/** The statuses, in the order every chart stacks them. */
export const FLOW_ORDER: TaskStatus[] = [
  "TODO",
  "ON_HOLD",
  "IN_PROGRESS",
  "IN_TEST",
  "DONE",
];

/** How far back the day-by-day charts look, unless the work is younger. */
export const WINDOW_DAYS = 84;

const DAY = 24 * 60 * 60 * 1000;

export interface ReportTask {
  id: string;
  status: TaskStatus;
  priority: string;
  createdAt: Date;
  startDate: Date | null;
  endDate: Date | null;
  estimateMinutes: number | null;
  sprintId: string | null;
  parentId: string | null;
  assignees: { developerId: string }[];
  tags: { tagId: string }[];
  blockedBy: { blockerId: string }[];
}

export interface ReportEvent {
  taskId: string;
  status: TaskStatus;
  at: Date;
}

export interface ReportSprint {
  id: string;
  number: number;
  startDate: Date;
  endDate: Date;
  archived: boolean;
}

/** A day, as the charts key on it: `2026-08-09`, in whatever zone the server keeps. */
export function dayKey(at: Date) {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(
    at.getDate()
  ).padStart(2, "0")}`;
}

function startOfDay(at: Date) {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

/** Monday of the week a day falls in — weeks are how throughput reads. */
function startOfWeek(at: Date) {
  const day = startOfDay(at);
  // getDay() is 0 on Sunday, which belongs to the week that began six days ago.
  const back = (day.getDay() + 6) % 7;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - back);
}

/**
 * The state of the whole board on each of the last so-many days: how many tasks
 * stood in each status at the end of that day.
 *
 * This is the cumulative flow diagram, and it is the one chart that says more
 * than the boards do — the band that widens is where work is piling up, and the
 * gap between the top edge and the bottom band is everything not finished yet.
 *
 * Worked out by replaying the history rather than by asking the tasks: a task's
 * status today says nothing about where it stood three weeks ago. Events are
 * walked once in order, carrying each task's current state forward, and the
 * counts are snapshotted at each day boundary — so the cost is the events plus
 * the days, not one query per day.
 *
 * A task with no history at all — written before the app kept any — joins the
 * board on the day it was created, in the status it holds now. That is the only
 * honest reading available, and it is noted rather than hidden.
 */
export function cumulativeFlow(
  tasks: ReportTask[],
  events: ReportEvent[],
  today: Date,
  windowDays = WINDOW_DAYS
) {
  if (tasks.length === 0) return [];

  const known = new Set(tasks.map((t) => t.id));
  const moves: ReportEvent[] = events
    .filter((e) => known.has(e.taskId))
    .map((e) => ({ ...e }));

  // Tasks the history never mentions arrive as they are, on the day they were
  // written. Without this they would be missing from the chart entirely.
  const seen = new Set(moves.map((e) => e.taskId));
  for (const task of tasks) {
    if (seen.has(task.id)) continue;
    moves.push({ taskId: task.id, status: task.status, at: task.createdAt });
  }
  moves.sort((a, b) => a.at.getTime() - b.at.getTime());
  if (moves.length === 0) return [];

  const last = startOfDay(today);
  const earliest = startOfDay(moves[0].at);
  const wanted = new Date(last.getTime() - (windowDays - 1) * DAY);
  const first = earliest > wanted ? earliest : wanted;

  const at = new Map<string, TaskStatus>();
  const counts = new Map<TaskStatus, number>(FLOW_ORDER.map((s) => [s, 0]));
  let cursor = 0;

  const out: { day: string; total: number; counts: Record<string, number> }[] = [];
  for (let day = new Date(first); day <= last; day = new Date(day.getTime() + DAY)) {
    const endOfDay = day.getTime() + DAY;
    while (cursor < moves.length && moves[cursor].at.getTime() < endOfDay) {
      const move = moves[cursor++];
      const before = at.get(move.taskId);
      if (before) counts.set(before, (counts.get(before) ?? 1) - 1);
      at.set(move.taskId, move.status);
      counts.set(move.status, (counts.get(move.status) ?? 0) + 1);
    }
    out.push({
      day: dayKey(day),
      total: at.size,
      counts: Object.fromEntries(FLOW_ORDER.map((s) => [s, counts.get(s) ?? 0])),
    });
  }
  return out;
}

/**
 * When each task was finished, counted once. A task moved to Done, back out and
 * to Done again was finished when it was finished the last time — anything else
 * counts one job twice.
 */
function finishedAt(events: ReportEvent[]) {
  const done = new Map<string, Date>();
  for (const event of events) {
    if (event.status === "DONE") done.set(event.taskId, event.at);
    else done.delete(event.taskId);
  }
  return done;
}

/**
 * How much work is being finished, week by week. The number a team can plan on:
 * not how busy anybody looks, but how much actually left the board.
 */
export function throughput(
  tasks: ReportTask[],
  events: ReportEvent[],
  today: Date,
  weeks = 12
) {
  const known = new Set(tasks.map((t) => t.id));
  const done = finishedAt(events.filter((e) => known.has(e.taskId)));

  const firstWeek = startOfWeek(new Date(today.getTime() - (weeks - 1) * 7 * DAY));
  const buckets = new Map<string, number>();
  for (let i = 0; i < weeks; i++) {
    buckets.set(dayKey(new Date(firstWeek.getTime() + i * 7 * DAY)), 0);
  }
  for (const at of done.values()) {
    const key = dayKey(startOfWeek(at));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets].map(([week, count]) => ({ week, count }));
}

/**
 * How long finished work took, from the day somebody started it to the day it
 * was done.
 *
 * Cycle time rather than lead time: the clock starts when the task first left
 * To Do, because the time a job sat in a backlog says something about the
 * backlog rather than about the job. A task that went straight to Done without
 * ever being picked up is counted from when it was written, which is the only
 * start it has.
 *
 * The median is the headline, not the average — one job that took six months
 * drags a mean somewhere no real task has ever been.
 */
export function cycleTimes(tasks: ReportTask[], events: ReportEvent[]) {
  const known = new Set(tasks.map((t) => t.id));
  const mine = events.filter((e) => known.has(e.taskId));
  const done = finishedAt(mine);

  const started = new Map<string, Date>();
  for (const event of mine) {
    if (event.status === "TODO" || started.has(event.taskId)) continue;
    started.set(event.taskId, event.at);
  }
  const written = new Map(tasks.map((t) => [t.id, t.createdAt]));

  const days: number[] = [];
  for (const [taskId, finished] of done) {
    const from = started.get(taskId) ?? written.get(taskId);
    if (!from) continue;
    const spent = (finished.getTime() - from.getTime()) / DAY;
    days.push(Math.max(0, Math.round(spent * 10) / 10));
  }
  days.sort((a, b) => a - b);

  const at = (share: number) =>
    days.length === 0 ? 0 : days[Math.min(days.length - 1, Math.floor(days.length * share))];

  // Buckets people actually think in: same day, a couple of days, a week, a
  // fortnight, longer.
  const edges = [1, 2, 5, 10, 20];
  const labels = ["< 1 day", "1–2 days", "2–5 days", "5–10 days", "10–20 days", "20+ days"];
  const buckets = labels.map((label) => ({ label, count: 0 }));
  for (const day of days) {
    const index = edges.findIndex((edge) => day < edge);
    buckets[index === -1 ? edges.length : index].count++;
  }

  return {
    sample: days.length,
    median: at(0.5),
    p90: at(0.9),
    average:
      days.length === 0
        ? 0
        : Math.round((days.reduce((sum, d) => sum + d, 0) / days.length) * 10) / 10,
    buckets,
  };
}

/** What each sprint finished — the run of them is what velocity means. */
export function velocity(tasks: ReportTask[], sprints: ReportSprint[]) {
  return sprints
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((sprint) => {
      const mine = tasks.filter((t) => t.sprintId === sprint.id);
      const done = mine.filter((t) => t.status === "DONE");
      return {
        id: sprint.id,
        number: sprint.number,
        archived: sprint.archived,
        total: mine.length,
        done: done.length,
        estimateMinutes: done.reduce((sum, t) => sum + (t.estimateMinutes ?? 0), 0),
      };
    });
}

/**
 * Everything the screen shows, worked out in one place.
 *
 * `today` is passed in rather than read here so the whole report is one moment
 * — a run that straddled midnight would otherwise count a day twice in one
 * chart and not at all in another.
 */
export function buildReport({
  tasks,
  events,
  sprints,
  today = new Date(),
}: {
  tasks: ReportTask[];
  events: ReportEvent[];
  sprints: ReportSprint[];
  today?: Date;
}) {
  const midnight = startOfDay(today);
  const blockers = new Map(tasks.map((t) => [t.id, t.status]));

  const counts = new Map<TaskStatus, number>(FLOW_ORDER.map((s) => [s, 0]));
  const priorities = new Map<string, number>();
  const byTag = new Map<string, number>();
  const byPerson = new Map<
    string,
    { total: number; done: number; estimateMinutes: number }
  >();

  let blocked = 0;
  let overdue = 0;
  let unassigned = 0;
  let undated = 0;
  let sized = 0;
  let estimateMinutes = 0;
  let estimateDone = 0;

  for (const task of tasks) {
    counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
    priorities.set(task.priority, (priorities.get(task.priority) ?? 0) + 1);
    for (const tag of task.tags) {
      byTag.set(tag.tagId, (byTag.get(tag.tagId) ?? 0) + 1);
    }
    for (const on of task.assignees) {
      const load = byPerson.get(on.developerId) ?? {
        total: 0,
        done: 0,
        estimateMinutes: 0,
      };
      load.total++;
      if (task.status === "DONE") load.done++;
      load.estimateMinutes += task.estimateMinutes ?? 0;
      byPerson.set(on.developerId, load);
    }

    if (task.assignees.length === 0) unassigned++;
    if (!task.startDate || !task.endDate) undated++;
    if (task.estimateMinutes != null) {
      sized++;
      estimateMinutes += task.estimateMinutes;
      if (task.status === "DONE") estimateDone += task.estimateMinutes;
    }
    // Blocked is blocked *now*: waiting on something that isn't finished. Work
    // whose blockers are all done is simply ready, and counting it as held up
    // would be the report disagreeing with the board.
    if (
      task.status !== "DONE" &&
      task.blockedBy.some((link) => blockers.get(link.blockerId) !== "DONE")
    ) {
      blocked++;
    }
    if (
      task.status !== "DONE" &&
      task.endDate != null &&
      startOfDay(task.endDate) < midnight
    ) {
      overdue++;
    }
  }

  const total = tasks.length;
  const done = counts.get("DONE") ?? 0;

  return {
    generatedAt: today.toISOString(),
    /** How far back the day-by-day charts reach. */
    windowDays: WINDOW_DAYS,
    totals: {
      tasks: total,
      done,
      inProgress: counts.get("IN_PROGRESS") ?? 0,
      inTest: counts.get("IN_TEST") ?? 0,
      onHold: counts.get("ON_HOLD") ?? 0,
      todo: counts.get("TODO") ?? 0,
      blocked,
      overdue,
      unassigned,
      undated,
      sized,
      estimateMinutes,
      estimateDoneMinutes: estimateDone,
    },
    byStatus: FLOW_ORDER.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    })),
    byPriority: ["URGENT", "HIGH", "MEDIUM", "LOW"].map((priority) => ({
      priority,
      count: priorities.get(priority) ?? 0,
    })),
    byTag: [...byTag]
      .map(([tagId, count]) => ({ tagId, count }))
      .sort((a, b) => b.count - a.count),
    byPerson: [...byPerson]
      .map(([developerId, load]) => ({ developerId, ...load }))
      .sort((a, b) => b.total - a.total),
    flow: cumulativeFlow(tasks, events, today),
    throughput: throughput(tasks, events, today),
    cycleTime: cycleTimes(tasks, events),
    velocity: velocity(tasks, sprints),
  };
}

export type ProjectReport = ReturnType<typeof buildReport>;

import { diffDays, startOfDay } from "@/lib/dates";

/**
 * Who blocks whom, and which chain of it decides when the work can end.
 *
 * A dependency here is finish-to-start: the blocker has to be done before the
 * blocked task begins. The critical path is the longest chain of that through
 * the plan — the run of tasks where a day lost is a day lost off the end of
 * everything, as against the ones with slack, which can slip quietly.
 *
 * Only tasks that are joined to something take part. A board is mostly loose
 * work with no links at all, and calling every one of those critical because it
 * happens to have no slack of its own would say nothing at all.
 */

export interface Planned {
  id: string;
  startDate: string;
  endDate: string;
  blockedBy: string[];
}

/** One drawn link, from the task that must finish to the one that waits. */
export interface Link {
  from: string;
  to: string;
  /** Both ends are on the longest chain, so the link is on it too. */
  critical: boolean;
  /**
   * The plan already breaks this link: the blocker finishes on or after the
   * day the blocked task starts. Worth drawing differently — it is the thing a
   * dependency exists to catch.
   */
  late: boolean;
}

export interface Network {
  links: Link[];
  /** The tasks on the longest chain. */
  critical: Set<string>;
  /** Days each linked task could slip without moving the end. */
  slack: Map<string, number>;
  /** How long the longest chain runs, in days. */
  span: number;
}

const EMPTY: Network = {
  links: [],
  critical: new Set(),
  slack: new Map(),
  span: 0,
};

/** Inclusive, so a task that starts and ends on one day lasts a day. */
function duration(task: Planned) {
  return (
    diffDays(startOfDay(new Date(task.startDate)), startOfDay(new Date(task.endDate))) + 1
  );
}

export function analyseNetwork(tasks: Planned[]): Network {
  const byId = new Map(tasks.map((t) => [t.id, t]));

  // Links whose other end is on this board. A blocker planned into another
  // sprint is a real dependency, but there is no bar here to draw it to.
  const edges: { from: string; to: string }[] = [];
  for (const task of tasks) {
    for (const blockerId of task.blockedBy) {
      if (byId.has(blockerId)) edges.push({ from: blockerId, to: task.id });
    }
  }
  if (edges.length === 0) return EMPTY;

  const linked = new Set<string>();
  const after = new Map<string, string[]>();
  const before = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const edge of edges) {
    linked.add(edge.from);
    linked.add(edge.to);
    after.set(edge.from, [...(after.get(edge.from) ?? []), edge.to]);
    before.set(edge.to, [...(before.get(edge.to) ?? []), edge.from]);
  }
  for (const id of linked) indegree.set(id, (before.get(id) ?? []).length);

  // Kahn's ordering. The routes refuse a link that would close a loop, so a
  // short answer here means something has gone wrong upstream — the links are
  // still worth drawing, the timings are not.
  const order: string[] = [];
  const ready = [...linked].filter((id) => indegree.get(id) === 0);
  while (ready.length > 0) {
    const id = ready.pop()!;
    order.push(id);
    for (const next of after.get(id) ?? []) {
      const left = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, left);
      if (left === 0) ready.push(next);
    }
  }
  const sound = order.length === linked.size;

  // Forward: the earliest each task could start, given what it waits on.
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();
  for (const id of order) {
    const start = Math.max(
      0,
      ...(before.get(id) ?? []).map((b) => earlyFinish.get(b) ?? 0)
    );
    earlyStart.set(id, start);
    earlyFinish.set(id, start + duration(byId.get(id)!));
  }
  const span = Math.max(0, ...earlyFinish.values());

  // Backward: the latest it could start without moving that end.
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const successors = after.get(id) ?? [];
    const finish =
      successors.length === 0
        ? span
        : Math.min(...successors.map((s) => lateStart.get(s) ?? span));
    lateFinish.set(id, finish);
    lateStart.set(id, finish - duration(byId.get(id)!));
  }

  const slack = new Map<string, number>();
  const critical = new Set<string>();
  if (sound) {
    for (const id of order) {
      const float = (lateStart.get(id) ?? 0) - (earlyStart.get(id) ?? 0);
      slack.set(id, float);
      if (float === 0) critical.add(id);
    }
  }

  const links = edges.map(({ from, to }) => ({
    from,
    to,
    critical: critical.has(from) && critical.has(to),
    late:
      startOfDay(new Date(byId.get(from)!.endDate)) >=
      startOfDay(new Date(byId.get(to)!.startDate)),
  }));

  return { links, critical, slack, span: sound ? span : 0 };
}

import { prisma } from "@/lib/prisma";

/**
 * What one task waits on. A dependency is finish-to-start: the blocker has to
 * be done before the blocked task can begin, which is the only kind a bar chart
 * can honestly draw with one date each end.
 *
 * The rules live here rather than in the routes because both of them — writing
 * a task and editing one — have to enforce exactly the same three: a link joins
 * two tasks of the same project, a task never waits on itself, and no chain of
 * links may close a loop. A loop is not a slow plan, it is a plan with no first
 * task, and the critical path has nothing to say about one.
 */

/** More things to wait on than this is a task that wanted to be a sprint. */
export const MAX_BLOCKERS = 25;

/**
 * Reads the blocker list off a request body. Both fields absent means the
 * request didn't mention dependencies at all, which is not the same as sending
 * an empty list — that one clears them.
 */
export function parseBlockers(value: unknown): {
  blockers?: string[];
  error?: string;
} {
  if (value === undefined) return {};
  if (!Array.isArray(value)) return { error: "blockedBy must be a list of ids" };
  const blockers = [
    ...new Set(
      value.filter((id): id is string => typeof id === "string" && id !== "")
    ),
  ];
  if (blockers.length > MAX_BLOCKERS) {
    return { error: `A task can wait on ${MAX_BLOCKERS} others at most` };
  }
  return { blockers };
}

/**
 * The reason this set of blockers can't be stored, or null when it can.
 *
 * `taskId` is null for a task being created — there is nothing to loop back to
 * yet, so only the first two rules can be broken.
 */
export async function blockerProblem(
  projectId: string,
  taskId: string | null,
  blockers: string[]
): Promise<string | null> {
  if (blockers.length === 0) return null;
  if (taskId && blockers.includes(taskId)) {
    return "A task can’t wait on itself";
  }

  // Both ends of a link are tasks of the same project: an id from somewhere
  // else would hang this plan off a stranger's work.
  const known = await prisma.task.count({
    where: { id: { in: blockers }, projectId },
  });
  if (known !== blockers.length) {
    return "Those tasks aren’t all on this project";
  }
  if (!taskId) return null;

  // A loop would be a plan with no first task. Walking forward from this task
  // — through the work already waiting on it — says whether any proposed
  // blocker sits downstream, which is the only way a new link closes one.
  const links = await prisma.taskDependency.findMany({
    where: { blocked: { projectId } },
    select: { blockerId: true, blockedId: true },
  });
  // Appended to in place. Rebuilding the list on every edge — `[...old, next]`
  // — copies the whole run of them each time, which turns one popular blocker
  // into quadratic work for an answer that is a walk of the graph.
  const waitingOn = new Map<string, string[]>();
  for (const link of links) {
    const waiting = waitingOn.get(link.blockerId);
    if (waiting) waiting.push(link.blockedId);
    else waitingOn.set(link.blockerId, [link.blockedId]);
  }

  const downstream = new Set<string>();
  const queue = [taskId];
  while (queue.length > 0) {
    for (const next of waitingOn.get(queue.pop()!) ?? []) {
      if (downstream.has(next)) continue;
      downstream.add(next);
      queue.push(next);
    }
  }

  return blockers.some((id) => downstream.has(id))
    ? "That would make two tasks wait on each other"
    : null;
}

/**
 * Writes a task's blockers as the set given: what is no longer listed goes,
 * what is new arrives, and what was already there is left where it is rather
 * than deleted and remade — a link keeps the day it was made on.
 *
 * Three statements at most, and none at all when the set hasn't moved. It used
 * to be a delete plus an upsert per blocker, so a task waiting on a dozen
 * others cost a dozen round trips — and every ordinary save of a task paid for
 * them again, because saving the form sends the dependencies back whether or
 * not anybody touched them. Reading what is there first is one query that
 * usually ends the work.
 */
export async function setBlockers(taskId: string, blockers: string[]) {
  const existing = await prisma.taskDependency.findMany({
    where: { blockedId: taskId },
    select: { blockerId: true },
  });

  const have = new Set(existing.map((link) => link.blockerId));
  const wanted = new Set(blockers);
  const gone = [...have].filter((id) => !wanted.has(id));
  const fresh = blockers.filter((id) => !have.has(id));
  if (gone.length === 0 && fresh.length === 0) return;

  await prisma.$transaction([
    ...(gone.length > 0
      ? [
          prisma.taskDependency.deleteMany({
            where: { blockedId: taskId, blockerId: { in: gone } },
          }),
        ]
      : []),
    ...(fresh.length > 0
      ? [
          prisma.taskDependency.createMany({
            data: fresh.map((blockerId) => ({ blockerId, blockedId: taskId })),
          }),
        ]
      : []),
  ]);
}

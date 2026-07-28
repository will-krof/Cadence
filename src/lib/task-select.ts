/**
 * The columns a task is sent over the wire with. Tasks are the one thing this
 * app has a lot of, so the payload only carries what a board draws — the
 * assignee is referenced by id and joined against the roster on the client.
 */
export const TASK_FIELDS = {
  id: true,
  title: true,
  description: true,
  link: true,
  status: true,
  priority: true,
  startDate: true,
  endDate: true,
  order: true,
  projectId: true,
  developerId: true,
  sprintId: true,
  parentId: true,
  // What this task is waiting on. Only the blocker's id: the board already
  // holds every task, and a link is nothing more than which two it joins.
  blockedBy: { select: { blockerId: true } },
} as const;

/** A task as Prisma hands it back, before the join rows are flattened. */
type Selected = { blockedBy: { blockerId: string }[] };

/**
 * The shape a board reads: dependencies as a list of ids rather than a list of
 * rows. Every route that selects `TASK_FIELDS` sends its answer through this,
 * so `blockedBy` means the same thing everywhere.
 */
export function taskPayload<T extends Selected>(task: T) {
  return { ...task, blockedBy: task.blockedBy.map((d) => d.blockerId) };
}

export function taskPayloads<T extends Selected>(tasks: T[]) {
  return tasks.map(taskPayload);
}

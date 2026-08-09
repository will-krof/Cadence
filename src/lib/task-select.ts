/**
 * The columns a task is sent over the wire with. Tasks are the one thing this
 * app has a lot of, so the payload only carries what a board draws — whoever
 * is on one is referenced by id and joined against the roster on the client.
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
  // How long it should take, and which unit somebody wrote that in.
  estimateMinutes: true,
  estimateUnit: true,
  order: true,
  projectId: true,
  sprintId: true,
  parentId: true,
  // What this task is waiting on. Only the blocker's id: the board already
  // holds every task, and a link is nothing more than which two it joins.
  blockedBy: { select: { blockerId: true } },
  // Who is on it, in the order they were put on: ids only, joined against the
  // roster the client already holds.
  assignees: {
    select: { developerId: true },
    orderBy: { order: "asc" },
  },
  // What the project calls it: ids only, joined against the project's own
  // tags, which the client already holds.
  tags: { select: { tagId: true } },
} as const;

/** A task as Prisma hands it back, before the join rows are flattened. */
type Selected = {
  blockedBy: { blockerId: string }[];
  assignees: { developerId: string }[];
  tags: { tagId: string }[];
};

/**
 * The shape a board reads: dependencies and assignees as lists of ids rather
 * than lists of rows. Every route that selects `TASK_FIELDS` sends its answer
 * through this, so both mean the same thing everywhere.
 */
export function taskPayload<T extends Selected>({
  blockedBy,
  assignees,
  tags,
  ...task
}: T) {
  return {
    ...task,
    blockedBy: blockedBy.map((d) => d.blockerId),
    assigneeIds: assignees.map((a) => a.developerId),
    tagIds: tags.map((t) => t.tagId),
  };
}

export function taskPayloads<T extends Selected>(tasks: T[]) {
  return tasks.map(taskPayload);
}

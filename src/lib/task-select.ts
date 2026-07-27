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
  startDate: true,
  endDate: true,
  order: true,
  projectId: true,
  developerId: true,
} as const;

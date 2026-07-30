/**
 * Who is on a task. One place, so the routes, the boards and the forms all
 * agree about how many people a task can hold and what a list of them means.
 */

/**
 * Four.
 *
 * A task shared by more than that isn't shared, it's unowned — and four is
 * also what a row of avatars can say without the boards having to grow a
 * column for it: three faces and a "+1" at the widest.
 */
export const MAX_ASSIGNEES = 4;

/**
 * The people a payload names, in the order it names them.
 *
 * `undefined` for a payload that doesn't mention them at all — which is what
 * lets a PATCH change a task's dates without saying anything about who is on
 * it — and an empty list for one that says nobody, which is a real answer.
 */
export function parseAssignees(
  value: unknown
): { ids: string[] } | { error: string } | { unsaid: true } {
  if (value === undefined) return { unsaid: true };
  if (value === null) return { ids: [] };
  if (!Array.isArray(value)) return { error: "assigneeIds must be a list" };

  const ids: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string" || !raw) continue;
    // The same person twice is one person, not two — and it would be two rows
    // the join can't hold.
    if (!ids.includes(raw)) ids.push(raw);
  }
  if (ids.length > MAX_ASSIGNEES) {
    return { error: `A task takes ${MAX_ASSIGNEES} people at most` };
  }
  return { ids };
}

/** The join rows for a list of people, in the order they were given. */
export function assigneeRows(ids: string[]) {
  return ids.map((developerId, order) => ({ developerId, order }));
}

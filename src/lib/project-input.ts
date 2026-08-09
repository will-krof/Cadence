/**
 * What a project's shape payload means, in one place: the tools it runs on, the
 * span it states, and which of a task's fields its forms ask about. Both the
 * create and the update route read it, so the two can't drift apart in what
 * they accept.
 */

/** The tools a project can switch off. The roster isn't one — every project has people. */
const TOOLS = [
  "hasTimeline",
  "hasTracker",
  "hasWiki",
  "hasSprints",
  "hasRoles",
] as const;

/** The optional halves of a task, each of which a project can put away. */
const TASK_FIELDS = [
  "taskHasPriority",
  "taskHasLink",
  "taskHasDates",
  "taskHasHistory",
  "taskHasComments",
  "taskHasSubtasks",
  "taskHasDependencies",
  "taskHasTags",
  "taskHasEstimate",
] as const;

export type ProjectFlag = (typeof TOOLS)[number] | (typeof TASK_FIELDS)[number];

const FLAGS: readonly ProjectFlag[] = [...TOOLS, ...TASK_FIELDS];

/**
 * Every flag the body mentions, as it means it. A flag left out is left alone —
 * which is what lets the settings form send only what it changed, and what
 * keeps a create payload from having to name all ten.
 */
export function parseFlags(
  body: Record<string, unknown>,
  { fillIn = false }: { fillIn?: boolean } = {}
): Partial<Record<ProjectFlag, boolean>> {
  const out: Partial<Record<ProjectFlag, boolean>> = {};
  for (const flag of FLAGS) {
    if (typeof body[flag] === "boolean") out[flag] = body[flag];
    // On create, anything unsaid is on: a project starts whole and is pared
    // back, rather than starting empty and having to be switched on.
    else if (fillIn) out[flag] = true;
  }
  return out;
}

function day(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * The span a project states for itself. Either end can be cleared on its own —
 * an empty string is somebody emptying the field, which is a different answer
 * from not having mentioned it.
 *
 * An end before the start is refused rather than quietly swapped: the two dates
 * were typed by somebody, and guessing which one they meant is worse than
 * saying it doesn't add up.
 */
export function parseSpan(
  body: Record<string, unknown>
): { data: { startDate?: Date | null; endDate?: Date | null } } | { error: string } {
  const data: { startDate?: Date | null; endDate?: Date | null } = {};

  for (const key of ["startDate", "endDate"] as const) {
    const raw = body[key];
    if (raw === undefined) continue;
    if (raw === null || raw === "") {
      data[key] = null;
      continue;
    }
    const parsed = day(raw);
    if (!parsed) return { error: "That date can’t be read" };
    data[key] = parsed;
  }

  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return { error: "The project can’t end before it starts" };
  }
  return { data };
}

import { TaskStatus } from "@/lib/types";
import { boundedText, LIMITS, safeHttpUrl } from "@/lib/sanitize";

const STATUSES: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "IN_TEST",
  "ON_HOLD",
  "DONE",
];

export interface ParsedTask {
  title?: string;
  description?: string | null;
  link?: string | null;
  status?: TaskStatus;
  startDate?: Date;
  endDate?: Date;
  order?: number;
}

function date(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Normalises a task payload, and refuses what shouldn't be stored.
 *
 * The link is the field that matters most here: a task title is rendered as a
 * link to it on both boards, so a `javascript:` or `data:` URL would be a
 * script waiting for whoever clicks the task — including the admin. Only http
 * and https get through, and the URL is stored as the parser wrote it.
 */
export function parseTask(
  body: Record<string, unknown>
): { data: ParsedTask } | { error: string } {
  const data: ParsedTask = {};

  if (body.title !== undefined) {
    const title = boundedText(body.title, LIMITS.title);
    if ("tooLong" in title) {
      return { error: `Title must be ${LIMITS.title} characters or fewer` };
    }
    if (!title.value) return { error: "Title is required" };
    data.title = title.value;
  }

  if (body.description !== undefined) {
    const described = boundedText(body.description, LIMITS.description);
    if ("tooLong" in described) {
      return {
        error: `Description must be ${LIMITS.description} characters or fewer`,
      };
    }
    data.description = described.value;
  }

  if (body.link !== undefined) {
    const raw = typeof body.link === "string" ? body.link.trim() : "";
    if (!raw) {
      data.link = null;
    } else {
      const link = safeHttpUrl(raw);
      if (!link) return { error: "A link must be an http or https address" };
      data.link = link;
    }
  }

  if (body.status !== undefined) {
    const status = body.status as TaskStatus;
    if (!STATUSES.includes(status)) return { error: "Unknown status" };
    data.status = status;
  }

  if (body.startDate !== undefined) {
    const start = date(body.startDate);
    if (!start) return { error: "Invalid start date" };
    data.startDate = start;
  }

  if (body.endDate !== undefined) {
    const end = date(body.endDate);
    if (!end) return { error: "Invalid end date" };
    data.endDate = end;
  }

  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return { error: "A task can’t end before it starts" };
  }

  if (body.order !== undefined) {
    const order = Number(body.order);
    if (!Number.isFinite(order)) return { error: "Invalid order" };
    // Boards renumber rows as they are dragged, so this is a position, not a
    // number anybody types — clamping it keeps the column sane.
    data.order = Math.max(0, Math.min(1_000_000, Math.round(order)));
  }

  return { data };
}

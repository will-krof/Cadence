import { TaskPriority, TaskStatus } from "@/lib/types";
import { boundedText, LIMITS, safeHttpUrl } from "@/lib/sanitize";
import {
  EstimateUnit,
  isEstimateUnit,
  MAX_ESTIMATE_MINUTES,
} from "@/lib/estimate";

const STATUSES: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "IN_TEST",
  "ON_HOLD",
  "DONE",
];

const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export interface ParsedTask {
  title?: string;
  description?: string | null;
  link?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  /** Null is work nobody has placed in time yet, which is a real answer. */
  startDate?: Date | null;
  endDate?: Date | null;
  /** How long it should take, in minutes. Null is nobody having guessed. */
  estimateMinutes?: number | null;
  estimateUnit?: EstimateUnit | null;
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

  if (body.priority !== undefined) {
    const priority = body.priority as TaskPriority;
    if (!PRIORITIES.includes(priority)) return { error: "Unknown priority" };
    data.priority = priority;
  }

  // Cleared as readily as they are set: a task can be taken back off the
  // calendar, and a project that doesn't ask about dates writes neither.
  if (body.startDate !== undefined) {
    if (!body.startDate) {
      data.startDate = null;
    } else {
      const start = date(body.startDate);
      if (!start) return { error: "Invalid start date" };
      data.startDate = start;
    }
  }

  if (body.endDate !== undefined) {
    if (!body.endDate) {
      data.endDate = null;
    } else {
      const end = date(body.endDate);
      if (!end) return { error: "Invalid end date" };
      data.endDate = end;
    }
  }

  if (data.startDate && data.endDate && data.endDate < data.startDate) {
    return { error: "A task can’t end before it starts" };
  }

  // The estimate arrives already converted: the form knows what unit somebody
  // was typing in, and one quantity is what gets stored. The unit rides along
  // only so the form can say it back the way it was written, which is why an
  // unreadable one is dropped rather than refused — it changes nothing about
  // the answer.
  if (body.estimateMinutes !== undefined) {
    if (body.estimateMinutes === null || body.estimateMinutes === "") {
      data.estimateMinutes = null;
      data.estimateUnit = null;
    } else {
      const minutes = Number(body.estimateMinutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return { error: "An estimate has to be a length of time" };
      }
      if (minutes > MAX_ESTIMATE_MINUTES) {
        return { error: "That estimate is longer than a working year" };
      }
      data.estimateMinutes = Math.round(minutes);
      data.estimateUnit = isEstimateUnit(body.estimateUnit)
        ? body.estimateUnit
        : "HOURS";
    }
  } else if (body.estimateUnit !== undefined && isEstimateUnit(body.estimateUnit)) {
    // Somebody switched the picker without touching the number: the quantity
    // is unchanged and only the way it reads back moves.
    data.estimateUnit = body.estimateUnit;
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

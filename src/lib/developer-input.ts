import { EmploymentType, WorkLocation, WorkStatus } from "@/lib/types";
import { boundedText, LIMITS, safeColor } from "@/lib/sanitize";
import { isTimezone } from "@/lib/timezones";

const EMPLOYMENT_VALUES: EmploymentType[] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
];

const WORK_STATUS_VALUES: WorkStatus[] = ["WORKING", "SICK", "VACATION", "AWAY"];

const WORK_LOCATION_VALUES: WorkLocation[] = ["REMOTE", "OFFICE", "HYBRID"];

/**
 * The languages line, tidied into one shape: trimmed, emptied of the gaps a
 * trailing comma leaves, and capped at a dozen. Stored the way a card will read
 * it, so nothing downstream has to guess whether "en , uk" meant two languages.
 */
function normaliseLanguages(value: string): string {
  return value
    .split(",")
    .map((one) => one.trim())
    .filter(Boolean)
    .slice(0, 12)
    .join(", ");
}

export interface ParsedDeveloper {
  name?: string;
  color?: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  birthday?: Date | null;
  workStatus?: WorkStatus | null;
  startDate?: Date | null;
  salary?: number | null;
  currency?: string;
  employmentType?: EmploymentType | null;
  active?: boolean;
  notes?: string | null;
  timezone?: string | null;
  country?: string | null;
  languages?: string | null;
  workLocation?: WorkLocation | null;
}

/**
 * Normalises a developer payload. Returns an error message instead of throwing
 * so routes can answer 400 with something useful.
 */
export function parseDeveloper(
  body: Record<string, unknown>
): { data: ParsedDeveloper } | { error: string } {
  const data: ParsedDeveloper = {};

  if (body.name !== undefined) {
    const name = boundedText(body.name, LIMITS.name);
    if ("tooLong" in name) {
      return { error: `Name must be ${LIMITS.name} characters or fewer` };
    }
    if (!name.value) return { error: "Name is required" };
    data.name = name.value;
  }

  // The colour is drawn straight into a style, so it is a hex colour or it is
  // nothing — not somewhere to smuggle a `url()` that phones home.
  if (body.color !== undefined) {
    const color = safeColor(body.color);
    if (!color) return { error: "Colour must be a hex value like #2a78d6" };
    data.color = color;
  }

  // Free text, each with a cap: one profile shouldn't be able to carry a novel.
  for (const field of ["role", "email", "phone", "notes", "country"] as const) {
    if (body[field] === undefined) continue;
    const limit =
      field === "notes"
        ? LIMITS.notes
        : field === "email"
          ? LIMITS.email
          : field === "phone"
            ? LIMITS.phone
            : LIMITS.name;
    const parsed = boundedText(body[field], limit);
    if ("tooLong" in parsed) {
      return { error: `That ${field} is too long` };
    }
    data[field] = parsed.value;
  }

  if (body.birthday !== undefined) {
    if (!body.birthday) {
      data.birthday = null;
    } else {
      const parsed = new Date(body.birthday as string);
      if (Number.isNaN(parsed.getTime())) return { error: "Invalid birthday" };
      data.birthday = parsed;
    }
  }

  if (body.workStatus !== undefined) {
    if (!body.workStatus) {
      data.workStatus = null;
    } else if (
      !WORK_STATUS_VALUES.includes(body.workStatus as WorkStatus)
    ) {
      return { error: "Unknown work status" };
    } else {
      data.workStatus = body.workStatus as WorkStatus;
    }
  }

  if (body.startDate !== undefined) {
    if (!body.startDate) {
      data.startDate = null;
    } else {
      const parsed = new Date(body.startDate as string);
      if (Number.isNaN(parsed.getTime())) return { error: "Invalid start date" };
      data.startDate = parsed;
    }
  }

  if (body.salary !== undefined) {
    if (body.salary === null || body.salary === "") {
      data.salary = null;
    } else {
      const amount = Number(body.salary);
      if (!Number.isFinite(amount) || amount < 0) {
        return { error: "Salary must be a positive number" };
      }
      data.salary = Math.round(amount);
    }
  }

  if (typeof body.currency === "string" && body.currency.trim()) {
    data.currency = body.currency.trim().toUpperCase().slice(0, 3);
  }

  if (body.employmentType !== undefined) {
    const value = body.employmentType as EmploymentType;
    data.employmentType = EMPLOYMENT_VALUES.includes(value) ? value : null;
  }

  if (typeof body.active === "boolean") data.active = body.active;

  // A zone is checked against what this runtime can actually keep time in
  // rather than against a list of our own: whatever survives here is what the
  // formatter drawing the card will be handed later.
  if (body.timezone !== undefined) {
    if (!body.timezone) {
      data.timezone = null;
    } else if (!isTimezone(body.timezone)) {
      return { error: "Unknown time zone" };
    } else {
      data.timezone = (body.timezone as string).trim();
    }
  }

  if (body.languages !== undefined) {
    const parsed = boundedText(body.languages, LIMITS.languages);
    if ("tooLong" in parsed) {
      return { error: "That list of languages is too long" };
    }
    data.languages = parsed.value ? normaliseLanguages(parsed.value) || null : null;
  }

  if (body.workLocation !== undefined) {
    const value = body.workLocation as WorkLocation;
    data.workLocation = WORK_LOCATION_VALUES.includes(value) ? value : null;
  }

  return { data };
}

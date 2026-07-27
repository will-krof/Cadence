import { EmploymentType } from "@/lib/types";
import {
  boundedText,
  LIMITS,
  safeAvatar,
  safeColor,
} from "@/lib/sanitize";

const EMPLOYMENT_VALUES: EmploymentType[] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
];



export interface ParsedDeveloper {
  name?: string;
  color?: string;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar?: string | null;
  startDate?: Date | null;
  salary?: number | null;
  currency?: string;
  employmentType?: EmploymentType | null;
  active?: boolean;
  notes?: string | null;
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
  for (const field of ["role", "email", "phone", "notes"] as const) {
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

  if (body.avatar !== undefined) {
    if (typeof body.avatar !== "string" || !body.avatar) {
      data.avatar = null;
    } else if (!safeAvatar(body.avatar)) {
      // Base64 PNG, JPEG, WebP or GIF, within a size a row can hold. Anything
      // else — an SVG, a remote URL, a script-bearing data URL — is refused.
      return { error: "Avatar must be a small PNG, JPEG, WebP or GIF image" };
    } else {
      data.avatar = body.avatar;
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

  return { data };
}

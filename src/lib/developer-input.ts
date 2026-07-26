import { EmploymentType } from "@/lib/types";

const EMPLOYMENT_VALUES: EmploymentType[] = [
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERN",
];

/** Avatars are stored inline, so keep them small enough not to bloat rows. */
const MAX_AVATAR_CHARS = 400_000;

function text(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "Name is required" };
    data.name = name;
  }

  if (typeof body.color === "string") data.color = body.color;

  data.role = text(body.role);
  data.email = text(body.email);
  data.phone = text(body.phone);
  data.notes = text(body.notes);

  if (body.avatar !== undefined) {
    if (typeof body.avatar !== "string" || !body.avatar) {
      data.avatar = null;
    } else if (!body.avatar.startsWith("data:image/")) {
      return { error: "Avatar must be an image" };
    } else if (body.avatar.length > MAX_AVATAR_CHARS) {
      return { error: "Image is too large" };
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

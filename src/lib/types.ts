export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_TEST" | "ON_HOLD" | "DONE";

/**
 * Status hues double as the dot colour on each pill. The label text always
 * renders alongside, so state is never carried by colour alone.
 */
export const STATUS_OPTIONS: {
  value: TaskStatus;
  label: string;
  color: string;
}[] = [
  { value: "TODO", label: "To Do", color: "#898781" },
  { value: "IN_PROGRESS", label: "In progress", color: "#fab219" },
  { value: "IN_TEST", label: "In test", color: "#2a78d6" },
  { value: "ON_HOLD", label: "On hold", color: "#ec835a" },
  { value: "DONE", label: "Done", color: "#0ca30c" },
];

export function statusMeta(status: TaskStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
}

/**
 * Categorical identity palette for developers, in fixed slot order — validated
 * for colour-vision separation against both the light and dark chart surface.
 * Assign in order; never cycle a generated hue.
 */
export const DEVELOPER_PALETTE = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "PART_TIME", label: "Part-time" },
  { value: "CONTRACT", label: "Contract" },
  { value: "INTERN", label: "Intern" },
];

export const CURRENCIES = ["USD", "EUR", "GBP", "UAH", "PLN"];

export interface Developer {
  id: string;
  name: string;
  color: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  avatar: string | null;
  startDate: string | null;
  salary: number | null;
  currency: string;
  employmentType: EmploymentType | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
}

export type DeveloperInput = Omit<Developer, "id" | "createdAt">;

export interface Project {
  id: string;
  name: string;
  description: string | null;
  hasTimeline: boolean;
  hasTracker: boolean;
  hasTeam: boolean;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  projectId: string;
  description: string | null;
  link: string | null;
  status: TaskStatus;
  startDate: string;
  endDate: string;
  order: number;
  developerId: string | null;
  developer: Developer | null;
}

export interface Sprint {
  id: string;
  projectId: string;
  startDate: string;
  endDate: string;
  updatedAt: string;
}

/** A task as returned by the per-person endpoint, which names its project. */
export interface TaskWithProject extends Task {
  project: { id: string; name: string };
}

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
  startDate: string | null;
  salary: number | null;
  currency: string;
  employmentType: EmploymentType | null;
  active: boolean;
  notes: string | null;
  /** The login they picked when they followed an invite link, if they have. */
  username: string | null;
  createdAt: string;
}

/** What a profile form writes. The username is theirs to pick, not an admin's. */
export type DeveloperInput = Omit<
  Developer,
  "id" | "createdAt" | "username"
>;

export interface ProjectRole {
  id: string;
  projectId: string;
  name: string;
  isAdmin: boolean;
  canViewTimeline: boolean;
  canViewTracker: boolean;
  canViewTeam: boolean;
  createdAt: string;
}

/** The three tools a role's visibility is described in terms of. */
export const ROLE_VIEWS: {
  key: "canViewTimeline" | "canViewTracker" | "canViewTeam";
  label: string;
  /** The project toggle this view depends on. */
  tool: "hasTimeline" | "hasTracker" | "hasTeam";
}[] = [
  { key: "canViewTimeline", label: "Timeline", tool: "hasTimeline" },
  { key: "canViewTracker", label: "Tracker", tool: "hasTracker" },
  { key: "canViewTeam", label: "Team", tool: "hasTeam" },
];

export interface Project {
  id: string;
  name: string;
  description: string | null;
  hasTimeline: boolean;
  hasTracker: boolean;
  hasTeam: boolean;
  roles: ProjectRole[];
  createdAt: string;
}

/** A task as it travels: the assignee is an id, not a copy of their profile. */
export interface TaskRow {
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
  /** The sprint this task is planned into, if any. */
  sprintId: string | null;
}

/** A task as boards use it, with the assignee joined in from the roster. */
export interface Task extends TaskRow {
  developer: Developer | null;
}

export interface Sprint {
  id: string;
  projectId: string;
  number: number;
  startDate: string;
  endDate: string;
  /** Put away: still openable, but no longer part of the run of sprints. */
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Tasks that were never planned into a sprint sit in this pseudo-sprint. */
export const UNPLANNED = "__unplanned__";

/** What the per-person endpoint returns: enough to list someone's work. */
export interface DeveloperTask {
  id: string;
  title: string;
  status: TaskStatus;
  endDate: string;
  project: { id: string; name: string };
}

/** Who works on what, for grouping the team — one row per person per project. */
export interface Assignment {
  developerId: string;
  projectId: string;
}

/**
 * The link that lets one person set up their login for a project. It lasts
 * three days; past that it is replaced by a fresh one. `token` is null once the
 * link has been revoked — there is nothing left to copy, but the row still says
 * there was one.
 */
export interface Invite {
  token: string | null;
  createdAt: string | null;
  /** Links last three days; past this one is dead and a new one takes over. */
  expiresAt: string | null;
  revoked: boolean;
  /** When the link was used to set a login up, or null if it never was. */
  usedAt: string | null;
}

/** Someone's place on a project: which of its roles they hold, if any. */
export interface Membership {
  projectId: string;
  developerId: string;
  roleIds: string[];
  /** True once this person has set their login up through the link. */
  hasLogin: boolean;
  /** Only ever sent to the project's owner; a member sees null. */
  invite: Invite | null;
}

/** The full link an invite token stands for, in this browser's terms. */
export function inviteLink(token: string) {
  const origin =
    typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/invite/${token}`;
}

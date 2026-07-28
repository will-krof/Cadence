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
 * How much a task wants doing before the others. A different question from
 * status — that one says where the work is, this one says which of two waiting
 * tasks is picked up first — so it is drawn as a separate mark rather than
 * folded into the status pill.
 */
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

/**
 * Ordered least to most urgent, which is the order they are offered in and the
 * order `priorityRank` reads them by. The colours run cool to warm and each one
 * always travels with its label, so urgency is never carried by colour alone.
 */
export const PRIORITY_OPTIONS: {
  value: TaskPriority;
  label: string;
  /** The one-character mark a board row has room for. */
  mark: string;
  color: string;
}[] = [
  { value: "LOW", label: "Low", mark: "↓", color: "#898781" },
  { value: "MEDIUM", label: "Medium", mark: "–", color: "#2a78d6" },
  { value: "HIGH", label: "High", mark: "↑", color: "#ec835a" },
  { value: "URGENT", label: "Urgent", mark: "!", color: "#e34948" },
];

export function priorityMeta(priority: TaskPriority) {
  return PRIORITY_OPTIONS.find((p) => p.value === priority) ?? PRIORITY_OPTIONS[1];
}

/** Higher is more urgent, for sorting a list by what matters most. */
export function priorityRank(priority: TaskPriority) {
  return PRIORITY_OPTIONS.findIndex((p) => p.value === priority);
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

/** Where somebody is this week. Null reads as at work. */
export type WorkStatus = "WORKING" | "SICK" | "VACATION" | "AWAY";

export const WORK_STATUSES: {
  value: WorkStatus;
  label: string;
  color: string;
}[] = [
  { value: "WORKING", label: "Working", color: "#0ca30c" },
  { value: "SICK", label: "Off sick", color: "#e34948" },
  { value: "VACATION", label: "On holiday", color: "#2a78d6" },
  { value: "AWAY", label: "Away", color: "#898781" },
];

export function workStatusMeta(status: WorkStatus | null) {
  return WORK_STATUSES.find((s) => s.value === status) ?? WORK_STATUSES[0];
}

export interface Developer {
  id: string;
  name: string;
  color: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  workStatus: WorkStatus | null;
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
  canEditTimeline: boolean;
  canViewTracker: boolean;
  canEditTracker: boolean;
  canViewTeam: boolean;
  canEditTeam: boolean;
  canViewWiki: boolean;
  canEditWiki: boolean;
  createdAt: string;
}

/** What a role may do with one tool. */
export type Access = "none" | "view" | "edit";

export const ACCESS_OPTIONS: { value: Access; label: string }[] = [
  { value: "none", label: "—" },
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
];

/**
 * The tools a role is described in terms of, and the pair of fields each one is
 * stored as. Editing implies watching, so the two are always written together.
 */
export const ROLE_TOOLS: {
  label: string;
  view: "canViewTimeline" | "canViewTracker" | "canViewWiki" | "canViewTeam";
  edit: "canEditTimeline" | "canEditTracker" | "canEditWiki" | "canEditTeam";
  /**
   * The project toggle this tool depends on, where there is one. The roster has
   * none: every project has people, so only the role decides.
   */
  tool?: "hasTimeline" | "hasTracker" | "hasWiki";
  /** What "edit" lets somebody do, in the words of the thing itself. */
  hint: string;
}[] = [
  {
    label: "Timeline",
    view: "canViewTimeline",
    edit: "canEditTimeline",
    tool: "hasTimeline",
    hint: "move and reschedule the work",
  },
  {
    label: "Tracker",
    view: "canViewTracker",
    edit: "canEditTracker",
    tool: "hasTracker",
    hint: "move tasks between statuses",
  },
  {
    label: "Wiki",
    view: "canViewWiki",
    edit: "canEditWiki",
    tool: "hasWiki",
    hint: "write and rearrange pages",
  },
  {
    label: "Team",
    view: "canViewTeam",
    edit: "canEditTeam",
    hint: "change the working half of a profile",
  },
];

/** What a role's standing is read from: the flags, whatever else it carries. */
export type RoleRights = { isAdmin: boolean } & {
  [K in
    | (typeof ROLE_TOOLS)[number]["view"]
    | (typeof ROLE_TOOLS)[number]["edit"]]: boolean;
};

/** How a role stands on one tool, from the pair of fields it is stored as. */
export function accessOf(
  role: RoleRights,
  tool: (typeof ROLE_TOOLS)[number]
): Access {
  if (role.isAdmin) return "edit";
  if (role[tool.edit]) return "edit";
  return role[tool.view] ? "view" : "none";
}

/** The pair of fields an answer is written as. */
export function accessPatch(
  tool: (typeof ROLE_TOOLS)[number],
  access: Access
): Record<string, boolean> {
  return {
    [tool.view]: access !== "none",
    [tool.edit]: access === "edit",
  };
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  hasTimeline: boolean;
  hasTracker: boolean;
  hasWiki: boolean;
  /** Put away: still openable, but out of the run of projects being worked on. */
  archived: boolean;
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
  /** What it is worth doing first. Ordinary work unless somebody says so. */
  priority: TaskPriority;
  startDate: string;
  endDate: string;
  order: number;
  developerId: string | null;
  /** The sprint this task is planned into, if any. */
  sprintId: string | null;
  /** The task this one is a step of, if it is one. */
  parentId: string | null;
  /**
   * The tasks this one is waiting on, by id. Flattened from the join rows on
   * the way out: a board asks "what blocks this" far more often than it needs
   * to know when the link was made.
   */
  blockedBy: string[];
}

/**
 * One thing that happened to a task. `from` is null on the first line, which is
 * the task being written; `by` is whoever moved it, as they were called then.
 */
export interface TaskEvent {
  id: string;
  status: TaskStatus;
  from: TaskStatus | null;
  by: string | null;
  at: string;
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

/**
 * A page of a project's wiki as the contents list knows it: a title and where
 * it sits. What is written on it arrives when the page is opened.
 */
export interface WikiEntry {
  id: string;
  projectId: string;
  title: string;
  order: number;
  /** The section this page sits in, or null at the top of the wiki. */
  parentId: string | null;
  updatedAt: string;
}

/** The page itself, with its writing. */
export interface WikiPage extends WikiEntry {
  content: string;
}

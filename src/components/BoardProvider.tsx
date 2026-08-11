"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Developer,
  DeveloperInput,
  Membership,
  Project,
  ProjectColumn,
  ProjectRole,
  ProjectTag,
  Sprint,
  Task,
  TaskPriority,
  TaskRow,
  UNPLANNED,
  UNSORTED,
  doneColumnIds,
} from "@/lib/types";
import { startOfDay } from "@/lib/dates";
import { useFeedback } from "@/components/Feedback";

interface TaskInput {
  title: string;
  description: string;
  link: string;
  /** Empty where the work hasn't been placed in time — both ends or neither. */
  startDate: string | null;
  endDate: string | null;
  /** Which tracker column it lands in. Unsaid is the first one on the board. */
  columnId?: string | null;
  /** What it is worth doing first. Ordinary work when nobody says otherwise. */
  priority?: TaskPriority;
  /** Who is on it, by id: up to four, in the order they were picked. */
  assigneeIds: string[];
  /** How long it should take, in minutes, and which unit that was typed in. */
  estimateMinutes?: number | null;
  estimateUnit?: string | null;
  /** The tasks it waits on, by id — written with it rather than after it. */
  blockedBy?: string[];
  /** The task this one is a step of, if it is one. */
  parentId?: string | null;
  /** Steps to create with it. They take its dates and board, and their own
   *  person — a step is somebody's to do, and not always the same somebody. */
  subtasks?: { title: string; assigneeIds: string[] }[];
}

interface RolePatch {
  name?: string;
  canViewTimeline?: boolean;
  canViewTracker?: boolean;
  canViewTeam?: boolean;
  canViewWiki?: boolean;
}

/** What can be changed about a tag: what it is called, and what colour it is. */
interface TagPatch {
  name?: string;
  color?: string;
}

/**
 * What can be changed about a tracker column: its name, its colour, and
 * whether work standing in it counts as finished.
 */
interface ColumnPatch {
  name?: string;
  color?: string;
  isDone?: boolean;
}

interface SprintPatch {
  number?: number;
  startDate?: string;
  endDate?: string;
  archived?: boolean;
}

interface ProjectInput {
  name: string;
  description: string;
  /**
   * What the project is made of. All optional, and all off to begin with: a
   * project is created with a name and built up on its own card.
   */
  hasTimeline?: boolean;
  hasTracker?: boolean;
  hasWiki?: boolean;
  hasSprints?: boolean;
  hasRoles?: boolean;
  hasReports?: boolean;
  /** Stated by hand, or empty to leave the span to the work. */
  startDate?: string | null;
  endDate?: string | null;
  taskHasPriority?: boolean;
  taskHasLink?: boolean;
  taskHasDates?: boolean;
  taskHasHistory?: boolean;
  taskHasComments?: boolean;
  taskHasSubtasks?: boolean;
  taskHasDependencies?: boolean;
  taskHasTags?: boolean;
  /** Whether a task says how long it is expected to take. */
  taskHasEstimate?: boolean;
  /** Put away, or brought back. */
  archived?: boolean;
}

interface BoardContextValue {
  projects: Project[];
  activeProject: Project | null;
  selectProject: (id: string) => void;
  createProject: (input: ProjectInput) => Promise<Project | null>;
  updateProject: (id: string, input: Partial<ProjectInput>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  memberships: Membership[];
  addMember: (projectId: string, developerId: string) => Promise<void>;
  removeMember: (projectId: string, developerId: string) => Promise<void>;
  setMemberRoles: (
    projectId: string,
    developerId: string,
    roleIds: string[]
  ) => Promise<void>;
  /** Replaces someone's invite link; the one they had stops working. */
  rotateInvite: (projectId: string, developerId: string) => Promise<void>;
  /** Switches their link off without giving them a new one. */
  revokeInvite: (projectId: string, developerId: string) => Promise<void>;

  createRole: (projectId: string, name: string) => Promise<ProjectRole | null>;
  updateRole: (
    projectId: string,
    roleId: string,
    input: RolePatch
  ) => Promise<void>;
  deleteRole: (projectId: string, roleId: string) => Promise<void>;
  createTag: (
    projectId: string,
    name: string,
    color: string
  ) => Promise<ProjectTag | null>;
  /**
   * The tracker's columns, in board order. Read from the open project rather
   * than fetched: they arrive with it, and every screen that draws a column
   * has to agree with every other one within the same render.
   */
  columns: ProjectColumn[];
  createColumn: (
    projectId: string,
    input: { name: string; color?: string; isDone?: boolean }
  ) => Promise<ProjectColumn | null>;
  updateColumn: (
    projectId: string,
    columnId: string,
    patch: ColumnPatch
  ) => Promise<void>;
  /**
   * Deletes a column outright. The work standing in it is not deleted with
   * it — it comes back unsorted, here as in the database.
   */
  deleteColumn: (projectId: string, columnId: string) => Promise<void>;
  /** Writes the left-to-right order of the whole board in one go. */
  reorderColumns: (projectId: string, ids: string[]) => Promise<void>;
  updateTag: (
    projectId: string,
    tagId: string,
    patch: TagPatch
  ) => Promise<void>;
  deleteTag: (projectId: string, tagId: string) => Promise<void>;

  tasks: Task[];
  /** Every task in the project, not just the sprint on show. */
  projectTasks: Task[];
  developers: Developer[];
  /** Who a task may be handed to: the roster, minus anybody archived. */
  assignable: Developer[];
  sprints: Sprint[];
  sprint: Sprint | null;
  /** The chosen board: a sprint id, UNPLANNED, or null to follow the dates. */
  sprintId: string | null;
  hasUnplanned: boolean;
  selectSprint: (id: string | null) => void;
  loading: boolean;
  projectLoading: boolean;
  stats: {
    total: number;
    /** How many tasks stand in each column, by id. */
    counts: Map<string, number>;
    /** How much of the board is standing in a column that means finished. */
    progress: number;
  };
  /**
   * Writes a task. Answers with what went wrong, or null when it went
   * through — a caller holding a form has to know, because closing it on a
   * refusal throws away what somebody typed and looks exactly like nothing
   * having happened.
   */
  createTask: (input: TaskInput) => Promise<string | null>;
  updateTask: (id: string, data: Partial<TaskRow>) => Promise<string | null>;
  /** Writes the order the rows were dragged into, for the whole list. */
  reorderTasks: (order: { id: string; order: number }[]) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  createDeveloper: (input: Partial<DeveloperInput>) => Promise<Developer | null>;
  updateDeveloper: (id: string, input: Partial<DeveloperInput>) => Promise<void>;
  setDeveloperActive: (id: string, active: boolean) => Promise<void>;
  deleteDeveloper: (id: string) => Promise<void>;
  createSprint: (input: {
    number?: number;
    startDate: string;
    endDate: string;
  }) => Promise<Sprint | null>;
  updateSprint: (id: string, patch: SprintPatch) => Promise<void>;
  deleteSprint: (id: string) => Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used inside <BoardProvider>");
  return ctx;
}

/** Stable identity so consumers don't re-render on every empty state. */
const EMPTY_ROWS: TaskRow[] = [];
const EMPTY_TASKS: Task[] = [];
const EMPTY_SPRINTS: Sprint[] = [];
const EMPTY_COLUMNS: ProjectColumn[] = [];

/** Pulls the server's error message out of a failed response, if there is one. */
async function errorMessage(res: Response, fallback: string) {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    // Non-JSON body — fall through to the generic message.
  }
  return fallback;
}

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const { notify } = useFeedback();

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  // Who is on which project, in which role. Small enough to hold for the whole
  // workspace, and both the project card and the roster read it.
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);

  // Per-project data is tagged with the project it came from, so switching
  // projects can never show the previous project's tasks while the next ones
  // are still loading.
  const [loaded, setLoaded] = useState<{
    projectId: string | null;
    tasks: TaskRow[];
    sprints: Sprint[];
  }>({ projectId: null, tasks: [], sprints: [] });

  // Which sprint's board is on show. Null means "work it out from the dates".
  const [sprintId, setSprintId] = useState<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId]
  );

  const rows = loaded.projectId === activeId ? loaded.tasks : EMPTY_ROWS;
  const sprints = loaded.projectId === activeId ? loaded.sprints : EMPTY_SPRINTS;

  /** Tasks nobody planned into a sprint, shown as a board of their own. */
  const hasUnplanned = useMemo(
    () => rows.some((row) => !row.sprintId),
    [rows]
  );

  // Falls back to the sprint today sits in, then the last one — opening a
  // project lands on the board being worked on rather than the oldest. An
  // archived sprint is never landed on, though it can still be chosen.
  const sprint = useMemo(() => {
    if (sprintId === UNPLANNED) return null;
    if (sprintId) return sprints.find((s) => s.id === sprintId) ?? null;
    const live = sprints.filter((s) => !s.archived);
    if (live.length === 0) return null;
    const today = startOfDay(new Date()).getTime();
    const current = live.find(
      (s) =>
        startOfDay(new Date(s.startDate)).getTime() <= today &&
        startOfDay(new Date(s.endDate)).getTime() >= today
    );
    return current ?? live[live.length - 1];
  }, [sprintId, sprints]);

  /**
   * Whether this project plans in rounds at all. With sprints switched off the
   * boards stop being one sprint's worth of work and become the whole plan —
   * nothing is hidden behind a round nobody is keeping.
   */
  const planned = activeProject?.hasSprints !== false;

  /** What the boards show: one sprint's worth of work, when there are sprints. */
  // With sprints switched off there is no round to file a new task into, so it
  // is filed into none — and finds its way into whatever the team plans if the
  // tool ever comes back.
  const boardSprintId = !planned
    ? null
    : sprintId === UNPLANNED
      ? null
      : sprint?.id ?? null;
  // Read when a task is created, so the callback stays stable.
  const boardSprintIdRef = useRef(boardSprintId);
  useEffect(() => {
    boardSprintIdRef.current = boardSprintId;
  }, [boardSprintId]);

  const boardRows = useMemo(() => {
    // Sorted here rather than trusted from the server: dragging a row rewrites
    // the order in place, and the list has to move with it before the write
    // comes back.
    const mine = (
      planned
        ? rows.filter((row) => (row.sprintId ?? null) === boardSprintId)
        : rows.slice()
    )
      .slice()
      .sort((a, b) => a.order - b.order);
    // Steps read under the task they belong to. A subtask whose parent is on
    // another board stands on its own, in its own place — it is still work.
    const parents = new Set(mine.filter((r) => !r.parentId).map((r) => r.id));
    const steps = new Map<string, TaskRow[]>();
    for (const row of mine) {
      if (!row.parentId || !parents.has(row.parentId)) continue;
      // Pushed rather than rebuilt: a task with twenty steps shouldn't cost
      // twenty copies of a growing list on every render of the board.
      const under = steps.get(row.parentId);
      if (under) under.push(row);
      else steps.set(row.parentId, [row]);
    }
    if (steps.size === 0) return mine;

    const out: TaskRow[] = [];
    for (const row of mine) {
      if (row.parentId && parents.has(row.parentId)) continue;
      out.push(row, ...(steps.get(row.id) ?? []));
    }
    return out;
  }, [rows, boardSprintId, planned]);

  /** The project's labels by id, for putting them back on their tasks. */
  const tagById = useMemo(
    () => new Map((activeProject?.tags ?? []).map((t) => [t.id, t])),
    [activeProject]
  );

  /**
   * Who is left to hand work to. An archived person is off the team — their
   * tasks were handed back when they were filed away — so they are not somebody
   * a picker should still be offering.
   */
  const assignable = useMemo(
    () => developers.filter((d) => d.active),
    [developers]
  );

  /**
   * Every task in the project, with whoever is on it and whatever it is
   * labelled joined in from the lists the client already holds. The server
   * sends ids, so this is where they become people and tags — one pass when
   * either side changes, instead of a copy of every profile travelling inside
   * every task.
   *
   * This is now the *only* join. The board's own list used to do the same work
   * over again on the rows it shows, so opening a project joined most of its
   * tasks twice and held two objects for each of them — which also meant the
   * task a board handed a dialog was never the same object as the one the same
   * task had in the project-wide list.
   */
  const projectTasks = useMemo(() => {
    if (rows === EMPTY_ROWS || rows.length === 0) return EMPTY_TASKS;
    const byId = new Map(developers.map((d) => [d.id, d]));
    return rows.map((row) => ({
      ...row,
      assignees: row.assigneeIds
        .map((id) => byId.get(id))
        .filter((d): d is Developer => d != null),
      tags: row.tagIds
        .map((id) => tagById.get(id))
        .filter((t): t is ProjectTag => t != null),
    }));
  }, [rows, developers, tagById]);

  /**
   * What the boards show: the same tasks, in the board's own order. Looked up
   * from the joined list rather than joined again — the ordering and folding is
   * `boardRows`' answer, and this only has to put the joined task in each
   * place it decided on.
   */
  const tasks = useMemo(() => {
    if (boardRows.length === 0) return EMPTY_TASKS;
    const joined = new Map(projectTasks.map((task) => [task.id, task]));
    return boardRows
      .map((row) => joined.get(row.id))
      .filter((task): task is Task => task != null);
  }, [boardRows, projectTasks]);

  // Rollback needs the rows as they are now, but reading them from state would
  // give every task edit a new callback identity — and re-render every board.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const membershipsRef = useRef(memberships);
  useEffect(() => {
    membershipsRef.current = memberships;
  }, [memberships]);

  const setTasks = useCallback(
    (update: TaskRow[] | ((prev: TaskRow[]) => TaskRow[])) => {
      setLoaded((prev) => ({
        ...prev,
        tasks: typeof update === "function" ? update(prev.tasks) : update,
      }));
    },
    []
  );

  // Projects and the developer roster load once.
  useEffect(() => {
    (async () => {
      try {
        const [projectRes, devRes, memberRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/developers"),
          fetch("/api/members"),
        ]);
        const loadedProjects: Project[] = await projectRes.json();
        setProjects(loadedProjects);
        setDevelopers(await devRes.json());
        setMemberships(await memberRes.json());
        setActiveId(loadedProjects[0]?.id ?? null);
      } catch {
        notify("error", "Could not load your workspace.");
      }
      setLoading(false);
    })();
  }, [notify]);

  // Tasks and sprint are per-project, so they reload on every switch.
  useEffect(() => {
    if (!activeId) return;

    let cancelled = false;
    (async () => {
      setProjectLoading(true);
      try {
        const [taskRes, sprintRes] = await Promise.all([
          fetch(`/api/tasks?projectId=${activeId}`),
          fetch(`/api/sprints?projectId=${activeId}`),
        ]);
        // A guest whose roles include no board is told so with a 403. That is
        // an answer, not a failure: there is simply nothing to draw.
        if (taskRes.status === 403 || sprintRes.status === 403) {
          if (!cancelled) {
            setLoaded({ projectId: activeId, tasks: [], sprints: [] });
            setSprintId(null);
            setProjectLoading(false);
          }
          return;
        }
        if (!taskRes.ok || !sprintRes.ok) throw new Error("failed");
        const nextTasks = await taskRes.json();
        const nextSprints = await sprintRes.json();
        if (cancelled) return;
        setLoaded({ projectId: activeId, tasks: nextTasks, sprints: nextSprints });
        // Whatever was selected belonged to the project being left.
        setSprintId(null);
      } catch {
        if (!cancelled) notify("error", "Could not load this project.");
      }
      if (!cancelled) setProjectLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, notify]);

  const selectProject = useCallback((id: string) => setActiveId(id), []);

  const createProject = useCallback(
    async (input: ProjectInput) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not create the project."));
        return null;
      }
      const created: Project = await res.json();
      setProjects((prev) => [...prev, created]);
      setActiveId(created.id);
      notify("success", `Project “${created.name}” created.`);
      return created;
    },
    [notify]
  );

  const updateProject = useCallback(
    async (id: string, input: Partial<ProjectInput>) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not save the project."));
        return;
      }
      const updated: Project = await res.json();
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
      notify("success", "Project updated.");
    },
    [notify]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      const name = projects.find((p) => p.id === id)?.name ?? "Project";
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not delete the project."));
        return;
      }
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== id);
        setActiveId((current) => (current === id ? next[0]?.id ?? null : current));
        return next;
      });
      notify("success", `“${name}” deleted.`);
    },
    [projects, notify]
  );

  /** Roles live on the project, so every change writes back into that list. */
  const patchRoles = useCallback(
    (projectId: string, update: (roles: ProjectRole[]) => ProjectRole[]) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, roles: update(p.roles) } : p
        )
      );
    },
    []
  );

  const createRole = useCallback(
    async (projectId: string, name: string) => {
      const res = await fetch(`/api/projects/${projectId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not add this role."));
        return null;
      }
      const created: ProjectRole = await res.json();
      patchRoles(projectId, (roles) => [...roles, created]);
      notify("success", `Role “${created.name}” added.`);
      return created;
    },
    [patchRoles, notify]
  );

  const updateRole = useCallback(
    async (projectId: string, roleId: string, input: RolePatch) => {
      // A checkbox that waits for the network before it moves feels broken, so
      // the tick lands right away and is put back if the save fails.
      const previous = projects
        .find((p) => p.id === projectId)
        ?.roles.find((r) => r.id === roleId);
      patchRoles(projectId, (roles) =>
        roles.map((r) => (r.id === roleId ? { ...r, ...input } : r))
      );

      const res = await fetch(`/api/projects/${projectId}/roles/${roleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        if (previous) {
          patchRoles(projectId, (roles) =>
            roles.map((r) => (r.id === roleId ? previous : r))
          );
        }
        notify("error", await errorMessage(res, "Could not save this role."));
        return;
      }
      const updated: ProjectRole = await res.json();
      patchRoles(projectId, (roles) =>
        roles.map((r) => (r.id === roleId ? updated : r))
      );
    },
    [projects, patchRoles, notify]
  );

  const deleteRole = useCallback(
    async (projectId: string, roleId: string) => {
      const res = await fetch(`/api/projects/${projectId}/roles/${roleId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not remove this role."));
        return;
      }
      patchRoles(projectId, (roles) => roles.filter((r) => r.id !== roleId));
      notify("success", "Role removed.");
    },
    [patchRoles, notify]
  );

  /** Tags live on the project too, and change the same way roles do. */
  const patchTags = useCallback(
    (projectId: string, update: (tags: ProjectTag[]) => ProjectTag[]) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, tags: update(p.tags) } : p
        )
      );
    },
    []
  );

  const createTag = useCallback(
    async (projectId: string, name: string, color: string) => {
      const res = await fetch(`/api/projects/${projectId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not add this tag."));
        return null;
      }
      const created: ProjectTag = await res.json();
      patchTags(projectId, (tags) => [...tags, created]);
      return created;
    },
    [patchTags, notify]
  );

  const updateTag = useCallback(
    async (projectId: string, tagId: string, input: TagPatch) => {
      // The chip changes under the cursor and is put back if the save fails —
      // picking a colour that waits for the network feels broken.
      const previous = projects
        .find((p) => p.id === projectId)
        ?.tags.find((t) => t.id === tagId);
      patchTags(projectId, (tags) =>
        tags.map((t) => (t.id === tagId ? { ...t, ...input } : t))
      );

      const res = await fetch(`/api/projects/${projectId}/tags/${tagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        if (previous) {
          patchTags(projectId, (tags) =>
            tags.map((t) => (t.id === tagId ? previous : t))
          );
        }
        notify("error", await errorMessage(res, "Could not save this tag."));
        return;
      }
      const updated: ProjectTag = await res.json();
      patchTags(projectId, (tags) =>
        tags.map((t) => (t.id === tagId ? updated : t))
      );
    },
    [projects, patchTags, notify]
  );

  const deleteTag = useCallback(
    async (projectId: string, tagId: string) => {
      const res = await fetch(`/api/projects/${projectId}/tags/${tagId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not remove this tag."));
        return;
      }
      patchTags(projectId, (tags) => tags.filter((t) => t.id !== tagId));
      // A tag that is gone is off the work that wore it, here as in the
      // database.
      setTasks((prev) =>
        prev.map((t) =>
          t.tagIds.includes(tagId)
            ? { ...t, tagIds: t.tagIds.filter((id) => id !== tagId) }
            : t
        )
      );
      notify("success", "Tag removed.");
    },
    [patchTags, setTasks, notify]
  );

  /**
   * The tracker's columns live on the project, and change the way tags and
   * roles do — the list the server hands back is what the board draws.
   */
  const patchColumns = useCallback(
    (projectId: string, update: (columns: ProjectColumn[]) => ProjectColumn[]) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId ? { ...p, columns: update(p.columns) } : p
        )
      );
    },
    []
  );

  const createColumn = useCallback(
    async (
      projectId: string,
      input: { name: string; color?: string; isDone?: boolean }
    ) => {
      const res = await fetch(`/api/projects/${projectId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not add this column."));
        return null;
      }
      const created: ProjectColumn = await res.json();
      patchColumns(projectId, (columns) => [...columns, created]);
      return created;
    },
    [patchColumns, notify]
  );

  const updateColumn = useCallback(
    async (projectId: string, columnId: string, patch: ColumnPatch) => {
      // The header changes under the cursor and is put back if the save fails:
      // renaming a column that waits for the network feels broken.
      const previous = projects
        .find((p) => p.id === projectId)
        ?.columns.find((c) => c.id === columnId);
      patchColumns(projectId, (columns) =>
        columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c))
      );

      const res = await fetch(
        `/api/projects/${projectId}/columns/${columnId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) {
        if (previous) {
          patchColumns(projectId, (columns) =>
            columns.map((c) => (c.id === columnId ? previous : c))
          );
        }
        notify("error", await errorMessage(res, "Could not save this column."));
        return;
      }
      const updated: ProjectColumn = await res.json();
      patchColumns(projectId, (columns) =>
        columns.map((c) => (c.id === columnId ? updated : c))
      );
    },
    [projects, patchColumns, notify]
  );

  /**
   * Deleting a column deletes the column. The work that stood in it is let go
   * of rather than deleted — the server nulls the tasks' column, and the board
   * has to say the same thing in the same breath or a card sits in a column
   * that no longer exists until the next reload.
   */
  const deleteColumn = useCallback(
    async (projectId: string, columnId: string) => {
      const name =
        projects
          .find((p) => p.id === projectId)
          ?.columns.find((c) => c.id === columnId)?.name ?? "Column";

      const res = await fetch(
        `/api/projects/${projectId}/columns/${columnId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not delete this column."));
        return;
      }
      const { unsorted = 0 }: { unsorted?: number } = await res
        .json()
        .catch(() => ({}));

      patchColumns(projectId, (columns) =>
        columns.filter((c) => c.id !== columnId)
      );
      setTasks((prev) =>
        prev.map((t) => (t.columnId === columnId ? { ...t, columnId: null } : t))
      );
      notify(
        "success",
        unsorted === 0
          ? `“${name}” deleted.`
          : `“${name}” deleted — ${unsorted} ${
              unsorted === 1 ? "task is" : "tasks are"
            } now unsorted.`
      );
    },
    [projects, patchColumns, setTasks, notify]
  );

  /** The board's own left-to-right order, written whole. */
  const reorderColumns = useCallback(
    async (projectId: string, ids: string[]) => {
      const previous = projects.find((p) => p.id === projectId)?.columns;
      // The board moves under the hand and is put back if the write is refused.
      patchColumns(projectId, (columns) => {
        const byId = new Map(columns.map((c) => [c.id, c]));
        const next = ids
          .map((id) => byId.get(id))
          .filter((c): c is ProjectColumn => c != null);
        const rest = columns.filter((c) => !ids.includes(c.id));
        return [...next, ...rest].map((c, order) => ({ ...c, order }));
      });

      const res = await fetch(`/api/projects/${projectId}/columns`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: ids }),
      });
      if (!res.ok) {
        if (previous) patchColumns(projectId, () => previous);
        notify("error", await errorMessage(res, "Could not reorder the board."));
        return;
      }
      const saved: ProjectColumn[] = await res.json();
      patchColumns(projectId, () => saved);
    },
    [projects, patchColumns, notify]
  );

  const createTask = useCallback(
    async (input: TaskInput): Promise<string | null> => {
      if (!activeId) return "No project is open.";
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          projectId: activeId,
          // A new task belongs to the board it was created on.
          sprintId: boardSprintIdRef.current,
        }),
      });
      if (!res.ok) {
        const problem = await errorMessage(res, "Could not create the task.");
        notify("error", problem);
        return problem;
      }
      // A task and the steps it was made with come back together: the server
      // writes them in one go, so the board never shows a half-made task.
      const { subtasks = [], ...created }: TaskRow & { subtasks?: TaskRow[] } =
        await res.json();

      setTasks((prev) => [...prev, created, ...subtasks]);
      notify("success", `Task “${created.title}” created.`);
      return null;
    },
    [activeId, setTasks, notify]
  );

  const updateTask = useCallback(
    async (id: string, data: Partial<TaskRow>): Promise<string | null> => {
      const previous = rowsRef.current;
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));

      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        // Put the optimistic edit back the way it was, and hand the reason
        // back to whoever asked — a form has somewhere to put it.
        setTasks(previous);
        const problem = await errorMessage(res, "Could not save the task.");
        notify("error", problem);
        return problem;
      }
      const updated: TaskRow = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return null;
    },
    [setTasks, notify]
  );

  /**
   * Where the rows sit. A task carries its steps when it moves, so one drag can
   * renumber the list — it is written in one request, and put back as it was if
   * the write is refused.
   */
  const reorderTasks = useCallback(
    async (order: { id: string; order: number }[]) => {
      if (order.length === 0) return;
      const previous = rowsRef.current;
      const at = new Map(order.map((row) => [row.id, row.order]));
      setTasks((prev) =>
        prev.map((t) => (at.has(t.id) ? { ...t, order: at.get(t.id)! } : t))
      );

      const res = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) {
        setTasks(previous);
        notify("error", await errorMessage(res, "Could not reorder those."));
      }
    },
    [setTasks, notify]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const previous = rowsRef.current;
      const title = previous.find((t) => t.id === id)?.title ?? "Task";
      // The database drops the links pointing at it; the board has to say the
      // same thing, or an arrow is left hanging off work that is gone.
      setTasks((prev) =>
        prev
          .filter((t) => t.id !== id)
          .map((t) =>
            t.blockedBy.includes(id)
              ? { ...t, blockedBy: t.blockedBy.filter((b) => b !== id) }
              : t
          )
      );

      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setTasks(previous);
        notify("error", await errorMessage(res, "Could not delete the task."));
        return;
      }
      notify("success", `“${title}” deleted.`);
    },
    [setTasks, notify]
  );

  const createDeveloper = useCallback(
    async (input: Partial<DeveloperInput>) => {
      const res = await fetch("/api/developers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not add this person."));
        return null;
      }
      const created: Developer = await res.json();
      setDevelopers((prev) => [...prev, created]);
      notify("success", `${created.name} added to the team.`);
      return created;
    },
    [notify]
  );

  const updateDeveloper = useCallback(
    async (id: string, input: Partial<DeveloperInput>) => {
      const res = await fetch(`/api/developers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not save this profile."));
        return;
      }
      const updated: Developer = await res.json();
      setDevelopers((prev) => prev.map((d) => (d.id === id ? updated : d)));
      // Tasks pick the new profile up through the roster join.
      notify("success", `${updated.name}’s profile saved.`);
    },
    [notify]
  );

  /**
   * Archiving keeps the person and their history; it files them away, and hands
   * back whatever they were holding — the server unassigns their tasks, and the
   * boards drop the name in the same breath rather than after a reload.
   */
  const setDeveloperActive = useCallback(
    async (id: string, active: boolean) => {
      const res = await fetch(`/api/developers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        notify(
          "error",
          await errorMessage(
            res,
            active ? "Could not restore them." : "Could not archive them."
          )
        );
        return;
      }
      const updated: Developer = await res.json();
      setDevelopers((prev) => prev.map((d) => (d.id === id ? updated : d)));
      if (!active) {
        setTasks((prev) =>
          prev.map((t) =>
            t.assigneeIds.includes(id)
              ? { ...t, assigneeIds: t.assigneeIds.filter((a) => a !== id) }
              : t
          )
        );
      }
      notify(
        "success",
        active
          ? `${updated.name} restored.`
          : `${updated.name} archived — they come off the work they were on.`
      );
    },
    [setTasks, notify]
  );

  const deleteDeveloper = useCallback(
    async (id: string) => {
      const name = developers.find((d) => d.id === id)?.name ?? "Person";
      const res = await fetch(`/api/developers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not remove this person."));
        return;
      }
      setDevelopers((prev) => prev.filter((d) => d.id !== id));
      // The database takes them off the work they were on; mirror that here.
      setTasks((prev) =>
        prev.map((t) =>
          t.assigneeIds.includes(id)
            ? { ...t, assigneeIds: t.assigneeIds.filter((a) => a !== id) }
            : t
        )
      );
      notify("success", `${name} removed from the team.`);
    },
    [developers, setTasks, notify]
  );

  // A patch rather than a full replacement: the sprint number and its dates are
  // edited from different places, and neither should have to restate the other.
  const setSprints = useCallback(
    (update: (prev: Sprint[]) => Sprint[]) => {
      setLoaded((prev) => ({ ...prev, sprints: update(prev.sprints) }));
    },
    []
  );

  const createSprint = useCallback(
    async (input: { number?: number; startDate: string; endDate: string }) => {
      if (!activeId) return null;
      const res = await fetch("/api/sprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, projectId: activeId }),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not create the sprint."));
        return null;
      }
      const created: Sprint = await res.json();
      setSprints((prev) =>
        [...prev, created].sort((a, b) => a.number - b.number)
      );
      notify("success", `Sprint ${created.number} planned.`);
      return created;
    },
    [activeId, setSprints, notify]
  );

  const updateSprint = useCallback(
    async (id: string, patch: SprintPatch) => {
      const res = await fetch(`/api/sprints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not save the sprint."));
        return;
      }
      const updated: Sprint = await res.json();
      setSprints((prev) =>
        prev
          .map((s) => (s.id === id ? updated : s))
          .sort((a, b) => a.number - b.number)
      );
    },
    [setSprints, notify]
  );

  /** The sprint goes; its tasks stay, unplanned. */
  const deleteSprint = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/sprints/${id}`, { method: "DELETE" });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not delete the sprint."));
        return;
      }
      setLoaded((prev) => ({
        ...prev,
        sprints: prev.sprints.filter((s) => s.id !== id),
        tasks: prev.tasks.map((t) =>
          t.sprintId === id ? { ...t, sprintId: null } : t
        ),
      }));
      setSprintId((current) => (current === id ? null : current));
      notify("success", "Sprint deleted. Its tasks are now unplanned.");
    },
    [notify]
  );

  const selectSprint = useCallback((id: string | null) => setSprintId(id), []);

  /** Puts someone on a project, holding the roles given — none, one or several. */
  const setMemberRoles = useCallback(
    async (projectId: string, developerId: string, roleIds: string[]) => {
      const previous = membershipsRef.current;
      const isTheirs = (m: Membership) =>
        m.projectId === projectId && m.developerId === developerId;
      // Editing in place rather than removing and re-adding: this list is the
      // order people are listed in, and ticking a role must not move anybody.
      setMemberships((prev) =>
        prev.some(isTheirs)
          ? prev.map((m) => (isTheirs(m) ? { ...m, roleIds } : m))
          : [
              ...prev,
              { projectId, developerId, roleIds, hasLogin: false, invite: null },
            ]
      );

      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developerId, roleIds }),
      });
      if (!res.ok) {
        setMemberships(previous);
        notify("error", await errorMessage(res, "Could not save that."));
        return;
      }
      // Putting someone on a project mints their invite link, so the server's
      // answer is what the row should show.
      const saved: Membership = await res.json();
      setMemberships((prev) =>
        prev.map((m) => (isTheirs(m) ? saved : m))
      );
    },
    [notify]
  );

  const addMember = useCallback(
    (projectId: string, developerId: string) =>
      setMemberRoles(projectId, developerId, []),
    [setMemberRoles]
  );

  /**
   * A new link for someone, which is what makes their old one dead, or the end
   * of the link they have. Both write the membership the server hands back.
   */
  const setInvite = useCallback(
    async (projectId: string, developerId: string, method: "POST" | "DELETE") => {
      const res = await fetch(`/api/projects/${projectId}/invites`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developerId }),
      });
      if (!res.ok) {
        notify(
          "error",
          await errorMessage(
            res,
            method === "POST"
              ? "Could not make a new link."
              : "Could not switch the link off."
          )
        );
        return;
      }
      const saved: Membership = await res.json();
      setMemberships((prev) =>
        prev.map((m) =>
          m.projectId === projectId && m.developerId === developerId ? saved : m
        )
      );
      notify(
        "success",
        method === "POST"
          ? "New invite link ready — the old one no longer works."
          : "Invite link switched off."
      );
    },
    [notify]
  );

  const rotateInvite = useCallback(
    (projectId: string, developerId: string) =>
      setInvite(projectId, developerId, "POST"),
    [setInvite]
  );

  const revokeInvite = useCallback(
    (projectId: string, developerId: string) =>
      setInvite(projectId, developerId, "DELETE"),
    [setInvite]
  );

  const removeMember = useCallback(
    async (projectId: string, developerId: string) => {
      const previous = membershipsRef.current;
      setMemberships((prev) =>
        prev.filter(
          (m) => !(m.projectId === projectId && m.developerId === developerId)
        )
      );

      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ developerId }),
      });
      if (!res.ok) {
        setMemberships(previous);
        notify("error", await errorMessage(res, "Could not remove them."));
      }
    },
    [notify]
  );

  /** The open project's columns, in board order. Empty is an empty tracker. */
  const columns = activeProject?.columns ?? EMPTY_COLUMNS;

  // The boards show one sprint, so their tally counts that sprint's work.
  // Counted per column rather than per status: what the states are is the
  // project's answer now, and "finished" is whichever of them says so.
  const stats = useMemo(() => {
    const total = boardRows.length;
    const counts = new Map<string, number>();
    const done = doneColumnIds(columns);
    let finished = 0;
    for (const t of boardRows) {
      const key = t.columnId ?? UNSORTED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (t.columnId && done.has(t.columnId)) finished++;
    }
    const progress = total === 0 ? 0 : (finished / total) * 100;
    return { total, counts, progress };
  }, [boardRows, columns]);

  // Memoised: without it every provider render hands consumers a new object and
  // re-renders every board, however little actually changed.
  const value: BoardContextValue = useMemo(
    () => ({
    projects,
    activeProject,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    memberships,
    addMember,
    removeMember,
    setMemberRoles,
    rotateInvite,
    revokeInvite,
    createRole,
    updateRole,
    deleteRole,
    createTag,
    updateTag,
    deleteTag,
    columns,
    createColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    tasks,
    projectTasks,
    developers,
    assignable,
    sprints,
    sprint,
    sprintId,
    hasUnplanned,
    selectSprint,
    loading,
    projectLoading,
    stats,
    createTask,
    updateTask,
    reorderTasks,
    deleteTask,
    createDeveloper,
    updateDeveloper,
    setDeveloperActive,
    deleteDeveloper,
    createSprint,
    updateSprint,
    deleteSprint,
    }),
    [
      projects,
      activeProject,
      selectProject,
      createProject,
      updateProject,
      deleteProject,
      memberships,
      addMember,
      removeMember,
      setMemberRoles,
      rotateInvite,
      revokeInvite,
      createRole,
      createTag,
      updateTag,
      deleteTag,
      columns,
      createColumn,
      updateColumn,
      deleteColumn,
      reorderColumns,
      updateRole,
      deleteRole,
      tasks,
      projectTasks,
      developers,
      assignable,
      sprints,
      sprint,
      sprintId,
      hasUnplanned,
      selectSprint,
      loading,
      projectLoading,
      stats,
      createTask,
      updateTask,
      reorderTasks,
      deleteTask,
      createDeveloper,
      updateDeveloper,
      setDeveloperActive,
      deleteDeveloper,
      createSprint,
      updateSprint,
      deleteSprint,
    ]
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

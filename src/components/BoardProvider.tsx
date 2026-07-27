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
  ProjectRole,
  Sprint,
  Task,
  TaskRow,
  TaskStatus,
  UNPLANNED,
} from "@/lib/types";
import { startOfDay } from "@/lib/dates";
import { useFeedback } from "@/components/Feedback";

interface TaskInput {
  title: string;
  description: string;
  link: string;
  startDate: string;
  endDate: string;
  status?: TaskStatus;
  developerId: string | null;
  /** The task this one is a step of, if it is one. */
  parentId?: string | null;
  /** Steps to create with it. They take its dates and board, and their own
   *  person — a step is somebody's to do, and not always the same somebody. */
  subtasks?: { title: string; developerId: string | null }[];
}

interface RolePatch {
  name?: string;
  canViewTimeline?: boolean;
  canViewTracker?: boolean;
  canViewTeam?: boolean;
  canViewWiki?: boolean;
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
  hasTimeline: boolean;
  hasTracker: boolean;
  hasWiki: boolean;
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

  tasks: Task[];
  /** Every task in the project, not just the sprint on show. */
  projectTasks: Task[];
  developers: Developer[];
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
    counts: Record<TaskStatus, number>;
    progress: number;
  };
  createTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, data: Partial<TaskRow>) => Promise<void>;
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

  /** What the boards show: one sprint's worth of work. */
  const boardSprintId = sprintId === UNPLANNED ? null : sprint?.id ?? null;
  // Read when a task is created, so the callback stays stable.
  const boardSprintIdRef = useRef(boardSprintId);
  useEffect(() => {
    boardSprintIdRef.current = boardSprintId;
  }, [boardSprintId]);

  const boardRows = useMemo(() => {
    // Sorted here rather than trusted from the server: dragging a row rewrites
    // the order in place, and the list has to move with it before the write
    // comes back.
    const mine = rows
      .filter((row) => (row.sprintId ?? null) === boardSprintId)
      .slice()
      .sort((a, b) => a.order - b.order);
    // Steps read under the task they belong to. A subtask whose parent is on
    // another board stands on its own, in its own place — it is still work.
    const parents = new Set(mine.filter((r) => !r.parentId).map((r) => r.id));
    const steps = new Map<string, TaskRow[]>();
    for (const row of mine) {
      if (!row.parentId || !parents.has(row.parentId)) continue;
      steps.set(row.parentId, [...(steps.get(row.parentId) ?? []), row]);
    }
    if (steps.size === 0) return mine;

    const out: TaskRow[] = [];
    for (const row of mine) {
      if (row.parentId && parents.has(row.parentId)) continue;
      out.push(row, ...(steps.get(row.id) ?? []));
    }
    return out;
  }, [rows, boardSprintId]);

  // The server sends an assignee id; boards want the person. Joining here means
  // one pass when either side changes, instead of a copy of every profile
  // travelling inside every task.
  const tasks = useMemo(() => {
    if (boardRows.length === 0) return EMPTY_TASKS;
    const byId = new Map(developers.map((d) => [d.id, d]));
    return boardRows.map((row) => ({
      ...row,
      developer: row.developerId ? byId.get(row.developerId) ?? null : null,
    }));
  }, [boardRows, developers]);

  /** Every task in the project, for the card's project-wide numbers. */
  const projectTasks = useMemo(() => {
    if (rows === EMPTY_ROWS) return EMPTY_TASKS;
    const byId = new Map(developers.map((d) => [d.id, d]));
    return rows.map((row) => ({
      ...row,
      developer: row.developerId ? byId.get(row.developerId) ?? null : null,
    }));
  }, [rows, developers]);

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

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId]
  );

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

  const createTask = useCallback(
    async (input: TaskInput) => {
      if (!activeId) return;
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
        notify("error", await errorMessage(res, "Could not create the task."));
        return;
      }
      // A task and the steps it was made with come back together: the server
      // writes them in one go, so the board never shows a half-made task.
      const { subtasks = [], ...created }: TaskRow & { subtasks?: TaskRow[] } =
        await res.json();

      setTasks((prev) => [...prev, created, ...subtasks]);
      notify("success", `Task “${created.title}” created.`);
    },
    [activeId, setTasks, notify]
  );

  const updateTask = useCallback(
    async (id: string, data: Partial<TaskRow>) => {
      const previous = rowsRef.current;
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));

      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        // Put the optimistic edit back the way it was.
        setTasks(previous);
        notify("error", await errorMessage(res, "Could not save the task."));
        return;
      }
      const updated: TaskRow = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
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
      setTasks((prev) => prev.filter((t) => t.id !== id));

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

  /** Archiving keeps the person and their history; it just files them away. */
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
      notify(
        "success",
        active ? `${updated.name} restored.` : `${updated.name} archived.`
      );
    },
    [notify]
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
      // The database nulls the assignee on their tasks; mirror that here.
      setTasks((prev) =>
        prev.map((t) => (t.developerId === id ? { ...t, developerId: null } : t))
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

  // The boards show one sprint, so their tally counts that sprint's work.
  const stats = useMemo(() => {
    const total = boardRows.length;
    const counts: Record<TaskStatus, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      IN_TEST: 0,
      ON_HOLD: 0,
      DONE: 0,
    };
    for (const t of boardRows) counts[t.status]++;
    const progress = total === 0 ? 0 : (counts.DONE / total) * 100;
    return { total, counts, progress };
  }, [boardRows]);

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
    tasks,
    projectTasks,
    developers,
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
      updateRole,
      deleteRole,
      tasks,
      projectTasks,
      developers,
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

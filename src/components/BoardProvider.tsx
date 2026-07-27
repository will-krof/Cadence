"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Developer,
  DeveloperInput,
  Project,
  ProjectRole,
  Sprint,
  Task,
  TaskStatus,
} from "@/lib/types";
import { toISODate } from "@/lib/dates";
import { useFeedback } from "@/components/Feedback";

interface TaskInput {
  title: string;
  description: string;
  link: string;
  startDate: string;
  endDate: string;
  status?: TaskStatus;
  developerId: string | null;
}

interface RolePatch {
  name?: string;
  canViewTimeline?: boolean;
  canViewTracker?: boolean;
  canViewTeam?: boolean;
}

interface SprintPatch {
  number?: number;
  startDate?: string;
  endDate?: string;
}

interface ProjectInput {
  name: string;
  description: string;
  hasTimeline: boolean;
  hasTracker: boolean;
  hasTeam: boolean;
}

interface BoardContextValue {
  projects: Project[];
  activeProject: Project | null;
  selectProject: (id: string) => void;
  createProject: (input: ProjectInput) => Promise<Project | null>;
  updateProject: (id: string, input: Partial<ProjectInput>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;

  createRole: (projectId: string, name: string) => Promise<ProjectRole | null>;
  updateRole: (
    projectId: string,
    roleId: string,
    input: RolePatch
  ) => Promise<void>;
  deleteRole: (projectId: string, roleId: string) => Promise<void>;

  tasks: Task[];
  developers: Developer[];
  sprint: Sprint | null;
  loading: boolean;
  projectLoading: boolean;
  stats: {
    total: number;
    counts: Record<TaskStatus, number>;
    progress: number;
  };
  createTask: (input: TaskInput) => Promise<void>;
  updateTask: (id: string, data: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  createDeveloper: (input: Partial<DeveloperInput>) => Promise<Developer | null>;
  updateDeveloper: (id: string, input: Partial<DeveloperInput>) => Promise<void>;
  setDeveloperActive: (id: string, active: boolean) => Promise<void>;
  deleteDeveloper: (id: string) => Promise<void>;
  updateSprint: (patch: SprintPatch) => Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used inside <BoardProvider>");
  return ctx;
}

/** Stable identity so consumers don't re-render on every empty state. */
const EMPTY_TASKS: Task[] = [];

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
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);

  // Per-project data is tagged with the project it came from, so switching
  // projects can never show the previous project's tasks while the next ones
  // are still loading.
  const [loaded, setLoaded] = useState<{
    projectId: string | null;
    tasks: Task[];
    sprint: Sprint | null;
  }>({ projectId: null, tasks: [], sprint: null });

  const tasks = loaded.projectId === activeId ? loaded.tasks : EMPTY_TASKS;
  const sprint = loaded.projectId === activeId ? loaded.sprint : null;

  const setTasks = useCallback(
    (update: Task[] | ((prev: Task[]) => Task[])) => {
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
        const [projectRes, devRes] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/developers"),
        ]);
        const loadedProjects: Project[] = await projectRes.json();
        setProjects(loadedProjects);
        setDevelopers(await devRes.json());
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
          fetch(`/api/sprint?projectId=${activeId}`),
        ]);
        const nextTasks = await taskRes.json();
        const nextSprint = await sprintRes.json();
        if (cancelled) return;
        setLoaded({ projectId: activeId, tasks: nextTasks, sprint: nextSprint });
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
        body: JSON.stringify({ ...input, projectId: activeId }),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not create the task."));
        return;
      }
      const created = await res.json();
      setTasks((prev) => [...prev, created]);
      notify("success", `Task “${created.title}” created.`);
    },
    [activeId, setTasks, notify]
  );

  const updateTask = useCallback(
    async (id: string, data: Partial<Task>) => {
      const previous = loaded.tasks;
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
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    },
    [loaded.tasks, setTasks, notify]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      const previous = loaded.tasks;
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
    [loaded.tasks, setTasks, notify]
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
      // Assignee chips on tasks carry a copy of the person, so refresh those.
      setTasks((prev) =>
        prev.map((t) => (t.developerId === id ? { ...t, developer: updated } : t))
      );
      notify("success", `${updated.name}’s profile saved.`);
    },
    [setTasks, notify]
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
      setTasks((prev) =>
        prev.map((t) => (t.developerId === id ? { ...t, developer: updated } : t))
      );
      notify(
        "success",
        active ? `${updated.name} restored.` : `${updated.name} archived.`
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
      setTasks((prev) =>
        prev.map((t) =>
          t.developerId === id ? { ...t, developerId: null, developer: null } : t
        )
      );
      notify("success", `${name} removed from the team.`);
    },
    [developers, setTasks, notify]
  );

  // A patch rather than a full replacement: the sprint number and its dates are
  // edited from different places, and neither should have to restate the other.
  const updateSprint = useCallback(
    async (patch: SprintPatch) => {
      if (!activeId) return;
      const current = loaded.projectId === activeId ? loaded.sprint : null;
      const today = toISODate(new Date());
      const startDate =
        patch.startDate ??
        (current ? toISODate(new Date(current.startDate)) : today);
      const endDate =
        patch.endDate ?? (current ? toISODate(new Date(current.endDate)) : startDate);
      const number = patch.number ?? current?.number ?? 1;

      const res = await fetch("/api/sprint", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeId, startDate, endDate, number }),
      });
      if (!res.ok) {
        notify("error", await errorMessage(res, "Could not save the sprint."));
        return;
      }
      const next = await res.json();
      setLoaded((prev) => ({ ...prev, sprint: next }));
      notify(
        "success",
        patch.number !== undefined && patch.startDate === undefined && patch.endDate === undefined
          ? `Now on sprint ${next.number}.`
          : "Sprint updated."
      );
    },
    [activeId, loaded.projectId, loaded.sprint, notify]
  );

  const stats = useMemo(() => {
    const total = tasks.length;
    const counts: Record<TaskStatus, number> = {
      TODO: 0,
      IN_PROGRESS: 0,
      IN_TEST: 0,
      ON_HOLD: 0,
      DONE: 0,
    };
    for (const t of tasks) counts[t.status]++;
    const progress = total === 0 ? 0 : (counts.DONE / total) * 100;
    return { total, counts, progress };
  }, [tasks]);

  const value: BoardContextValue = {
    projects,
    activeProject,
    selectProject,
    createProject,
    updateProject,
    deleteProject,
    createRole,
    updateRole,
    deleteRole,
    tasks,
    developers,
    sprint,
    loading,
    projectLoading,
    stats,
    createTask,
    updateTask,
    deleteTask,
    createDeveloper,
    updateDeveloper,
    setDeveloperActive,
    deleteDeveloper,
    updateSprint,
  };

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

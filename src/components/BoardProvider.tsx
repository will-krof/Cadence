"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Developer, Project, Sprint, Task, TaskStatus } from "@/lib/types";

interface TaskInput {
  title: string;
  description: string;
  link: string;
  startDate: string;
  endDate: string;
  developerId: string | null;
}

interface ProjectInput {
  name: string;
  description: string;
  hasTimeline: boolean;
  hasTracker: boolean;
}

interface BoardContextValue {
  projects: Project[];
  activeProject: Project | null;
  selectProject: (id: string) => void;
  createProject: (input: ProjectInput) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;

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
  createDeveloper: (input: { name: string; color: string }) => Promise<void>;
  deleteDeveloper: (id: string) => Promise<void>;
  updateSprint: (startDate: string, endDate: string) => Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used inside <BoardProvider>");
  return ctx;
}

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [developers, setDevelopers] = useState<Developer[]>([]);
  const [sprint, setSprint] = useState<Sprint | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);

  // Projects and the (shared) developer roster load once.
  useEffect(() => {
    (async () => {
      const [projectRes, devRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/developers"),
      ]);
      const loaded: Project[] = await projectRes.json();
      setProjects(loaded);
      setDevelopers(await devRes.json());
      setActiveId(loaded[0]?.id ?? null);
      setLoading(false);
    })();
  }, []);

  // Tasks and sprint are per-project, so they reload on every switch.
  useEffect(() => {
    if (!activeId) {
      setTasks([]);
      setSprint(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setProjectLoading(true);
      const [taskRes, sprintRes] = await Promise.all([
        fetch(`/api/tasks?projectId=${activeId}`),
        fetch(`/api/sprint?projectId=${activeId}`),
      ]);
      const nextTasks = await taskRes.json();
      const nextSprint = await sprintRes.json();
      if (cancelled) return;
      setTasks(nextTasks);
      setSprint(nextSprint);
      setProjectLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId]
  );

  const selectProject = useCallback((id: string) => setActiveId(id), []);

  const createProject = useCallback(async (input: ProjectInput) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const created: Project = await res.json();
    setProjects((prev) => [...prev, created]);
    setActiveId(created.id);
    return created;
  }, []);

  const deleteProject = useCallback(
    async (id: string) => {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== id);
        setActiveId((current) =>
          current === id ? next[0]?.id ?? null : current
        );
        return next;
      });
    },
    []
  );

  const createTask = useCallback(
    async (input: TaskInput) => {
      if (!activeId) return;
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, projectId: activeId }),
      });
      const created = await res.json();
      setTasks((prev) => [...prev, created]);
    },
    [activeId]
  );

  const updateTask = useCallback(async (id: string, data: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const updated = await res.json();
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }, []);

  const createDeveloper = useCallback(
    async (input: { name: string; color: string }) => {
      const res = await fetch("/api/developers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const created = await res.json();
      setDevelopers((prev) => [...prev, created]);
    },
    []
  );

  const deleteDeveloper = useCallback(async (id: string) => {
    setDevelopers((prev) => prev.filter((d) => d.id !== id));
    await fetch(`/api/developers/${id}`, { method: "DELETE" });
    setTasks((prev) =>
      prev.map((t) =>
        t.developerId === id ? { ...t, developerId: null, developer: null } : t
      )
    );
  }, []);

  const updateSprint = useCallback(
    async (startDate: string, endDate: string) => {
      if (!activeId) return;
      const res = await fetch("/api/sprint", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: activeId, startDate, endDate }),
      });
      setSprint(await res.json());
    },
    [activeId]
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
    deleteProject,
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
    deleteDeveloper,
    updateSprint,
  };

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

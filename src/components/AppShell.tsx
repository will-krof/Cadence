"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BoardProvider, useBoard } from "@/components/BoardProvider";
import { GanttBoard } from "@/components/GanttBoard";
import { TrackerBoard } from "@/components/TrackerBoard";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CloseIcon, NewProjectModal } from "@/components/ui";
import { TaskModal } from "@/components/TaskModal";
import { TeamView } from "@/components/TeamView";

type View = "timeline" | "tracker" | "team";

const TIMELINE_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="3" width="8" height="2.6" rx="1.3" fill="currentColor" />
    <rect x="4" y="6.7" width="10.5" height="2.6" rx="1.3" fill="currentColor" />
    <rect x="1.5" y="10.4" width="6.5" height="2.6" rx="1.3" fill="currentColor" />
  </svg>
);

const TRACKER_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect
      x="1.6"
      y="2.4"
      width="4.3"
      height="11.2"
      rx="1.4"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <rect
      x="10.1"
      y="2.4"
      width="4.3"
      height="7"
      rx="1.4"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

const TEAM_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="6" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M1.6 13.2c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M11 3.2a2.4 2.4 0 010 4.4M12.2 9.6c1.4.5 2.2 1.8 2.2 3.6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export interface ShellUser {
  id: string;
  email: string;
  name: string | null;
}

export default function AppShell({ user }: { user: ShellUser }) {
  return (
    <BoardProvider>
      <Shell user={user} />
    </BoardProvider>
  );
}

function Shell({ user }: { user: ShellUser }) {
  const {
    loading,
    projectLoading,
    projects,
    activeProject,
    selectProject,
    createProject,
    deleteProject,
    developers,
    createTask,
  } = useBoard();

  const [view, setView] = useState<View>("timeline");
  const [showAddTask, setShowAddTask] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);

  const available: View[] = useMemo(
    () =>
      activeProject
        ? [
            ...(activeProject.hasTimeline ? (["timeline"] as View[]) : []),
            ...(activeProject.hasTracker ? (["tracker"] as View[]) : []),
            // The team roster is shared across projects, so it's always here.
            "team" as View,
          ]
        : [],
    [activeProject]
  );

  // A project may not have both tools enabled, so the shown view is derived
  // rather than synced — switching projects can never leave it on a view the
  // project doesn't have.
  const activeView = available.includes(view) ? view : available[0];

  return (
    <div className="flex h-full flex-col bg-[var(--plane)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--surface)] px-3 py-2.5 sm:px-4">
        <Wordmark />
        <div className="flex items-center gap-2">
          {activeProject && activeView !== "team" && (
            <button onClick={() => setShowAddTask(true)} className="btn-primary">
              New task
            </button>
          )}
          <ThemeToggle />
          <AccountMenu user={user} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          className="thin-scroll flex w-14 shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--hairline)] bg-[var(--surface)] p-2 lg:w-56"
          aria-label="Projects and views"
        >
          <div className="flex flex-col gap-1">
            <div className="hidden items-center justify-between px-2 pt-1 pb-1 lg:flex">
              <span className="field-label">Projects</span>
              <button
                onClick={() => setShowNewProject(true)}
                className="rounded p-0.5 text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
                aria-label="New project"
                title="New project"
              >
                <PlusIcon />
              </button>
            </div>
            <button
              onClick={() => setShowNewProject(true)}
              className="flex items-center justify-center rounded-[var(--radius)] p-2 text-[var(--ink-muted)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)] lg:hidden"
              aria-label="New project"
              title="New project"
            >
              <PlusIcon />
            </button>

            {projects.map((p) => {
              const active = p.id === activeProject?.id;
              return (
                <div key={p.id} className="group relative">
                  <button
                    onClick={() => selectProject(p.id)}
                    aria-current={active ? "true" : undefined}
                    title={p.description ? `${p.name} — ${p.description}` : p.name}
                    className={`flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-2 text-left text-[0.8125rem] transition lg:pr-7 ${
                      active
                        ? "bg-[var(--accent-wash)] font-medium text-[var(--accent)]"
                        : "text-[var(--ink-secondary)] hover:bg-[var(--plane)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.3rem] text-[0.625rem] font-semibold uppercase"
                      style={{
                        background: active
                          ? "var(--accent)"
                          : "var(--gridline)",
                        color: active ? "#fff" : "var(--ink-secondary)",
                      }}
                    >
                      {p.name.slice(0, 1)}
                    </span>
                    <span className="hidden truncate lg:inline">{p.name}</span>
                  </button>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          `Delete “${p.name}” and all of its tasks? This cannot be undone.`
                        )
                      ) {
                        deleteProject(p.id);
                      }
                    }}
                    className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-1 text-[var(--ink-muted)] opacity-0 transition hover:text-[#d03b3b] focus-visible:opacity-100 group-hover:opacity-100 lg:block"
                    aria-label={`Delete project ${p.name}`}
                  >
                    <CloseIcon size={10} />
                  </button>
                </div>
              );
            })}
          </div>

          {available.length > 0 && (
            <div className="flex flex-col gap-1 border-t border-[var(--hairline)] pt-3">
              <span className="hidden px-2 pb-1 lg:block">
                <span className="field-label">Views</span>
              </span>
              {available.includes("timeline") && (
                <ViewButton
                  active={activeView === "timeline"}
                  onClick={() => setView("timeline")}
                  icon={TIMELINE_ICON}
                  label="Timeline"
                />
              )}
              {available.includes("tracker") && (
                <ViewButton
                  active={activeView === "tracker"}
                  onClick={() => setView("tracker")}
                  icon={TRACKER_ICON}
                  label="Tracker"
                />
              )}
              <ViewButton
                active={activeView === "team"}
                onClick={() => setView("team")}
                icon={TEAM_ICON}
                label="Team"
              />
            </div>
          )}
        </nav>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface)]">
          {loading ? (
            <Centered>Loading…</Centered>
          ) : !activeProject ? (
            <Centered>
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-sm text-[var(--ink-secondary)]">
                  No projects yet.
                </p>
                <button
                  onClick={() => setShowNewProject(true)}
                  className="btn-primary"
                >
                  Create your first project
                </button>
              </div>
            </Centered>
          ) : (
            <>
              <div className="flex items-baseline gap-2 border-b border-[var(--hairline)] px-4 py-2.5 sm:px-6">
                <h2 className="text-[0.8125rem] font-semibold tracking-tight">
                  {activeProject.name}
                </h2>
                {activeProject.description && (
                  <p className="truncate text-[0.75rem] text-[var(--ink-muted)]">
                    {activeProject.description}
                  </p>
                )}
              </div>
              {activeView === "team" ? (
                <TeamView />
              ) : projectLoading ? (
                <Centered>Loading project…</Centered>
              ) : activeView === "timeline" ? (
                <GanttBoard />
              ) : (
                <TrackerBoard />
              )}
            </>
          )}
        </main>
      </div>

      {showAddTask && activeProject && (
        <TaskModal
          developers={developers}
          onClose={() => setShowAddTask(false)}
          onSubmit={async (values) => {
            await createTask(values);
            setShowAddTask(false);
          }}
        />
      )}
      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreate={async (input) => {
            await createProject(input);
            setShowNewProject(false);
          }}
        />
      )}
    </div>
  );
}

function AccountMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const label = user.name?.trim() || user.email;
  const initial = label.slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[0.75rem] font-semibold text-white transition hover:opacity-85"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={label}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-56 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1.5 shadow-xl"
        >
          <div className="border-b border-[var(--hairline)] px-2.5 pb-2 pt-1.5">
            {user.name && (
              <p className="truncate text-[0.8125rem] font-medium">{user.name}</p>
            )}
            <p className="truncate text-[0.75rem] text-[var(--ink-muted)]">
              {user.email}
            </p>
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            role="menuitem"
            className="mt-1 w-full rounded-[var(--radius)] px-2.5 py-2 text-left text-[0.8125rem] text-[var(--ink-secondary)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)] disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={label}
      className={`flex items-center justify-center gap-2.5 rounded-[var(--radius)] px-2 py-2 text-[0.8125rem] font-medium transition lg:justify-start lg:px-3 ${
        active
          ? "bg-[var(--accent-wash)] text-[var(--accent)]"
          : "text-[var(--ink-secondary)] hover:bg-[var(--plane)] hover:text-[var(--ink)]"
      }`}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
      <path
        d="M6 2v8M2 6h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6 text-sm text-[var(--ink-muted)]">
      {children}
    </div>
  );
}

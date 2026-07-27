"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { BoardProvider, useBoard } from "@/components/BoardProvider";
import { GanttBoard } from "@/components/GanttBoard";
import { TrackerBoard } from "@/components/TrackerBoard";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

import { ProjectModal } from "@/components/ProjectModal";
import { ProjectOverview } from "@/components/ProjectOverview";
import { FeedbackProvider } from "@/components/Feedback";
import { TaskModal } from "@/components/TaskModal";
import { TeamView } from "@/components/TeamView";
import { InstallStats } from "@/components/InstallStats";

/** The views a project carries. Team isn't one: it belongs to the workspace. */
type View = "overview" | "timeline" | "tracker";

const SIDEBAR_EVENT = "cadence:sidebarchange";

function subscribeSidebar(onChange: () => void) {
  window.addEventListener(SIDEBAR_EVENT, onChange);
  return () => window.removeEventListener(SIDEBAR_EVENT, onChange);
}

// Falls back to memory so the toggle still works where storage is blocked
// (private browsing), it just won't survive a reload.
let sidebarFallback = false;

function getSidebarCollapsed() {
  try {
    return localStorage.getItem("sidebar") === "collapsed";
  } catch {
    return sidebarFallback;
  }
}

function toggleSidebar() {
  const next = !getSidebarCollapsed();
  sidebarFallback = next;
  try {
    localStorage.setItem("sidebar", next ? "collapsed" : "expanded");
  } catch {
    // Storage unavailable — the in-memory value carries this session.
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENT));
}

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
  /** Everybody who signs up is the admin of their own workspace. */
  role: "ADMIN" | "SUPERADMIN";
}

/**
 * Someone signed in with the login their invite link set up: the projects they
 * are a member of, and the roles they hold on each.
 */
export interface ShellMember {
  name: string;
  username: string | null;
  places: { projectId: string; roleIds: string[] }[];
}

export default function AppShell({
  user,
  member,
}: {
  user?: ShellUser;
  member?: ShellMember;
}) {
  return (
    <FeedbackProvider>
      <BoardProvider>
        <Shell user={user} member={member} />
      </BoardProvider>
    </FeedbackProvider>
  );
}

function Shell({ user, member }: { user?: ShellUser; member?: ShellMember }) {
  const {
    loading,
    projectLoading,
    projects,
    activeProject,
    selectProject,
    createProject,
    developers,
    createTask,
  } = useBoard();

  const [view, setView] = useState<View>("overview");
  // The roster sits beside the projects, not inside one, so which of the two is
  // on show is its own answer — a project stays chosen underneath it.
  const [onTeam, setOnTeam] = useState(false);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  // Reading the stored preference through a store (rather than mirroring it
  // into state in an effect) keeps the server render and hydration agreed.
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    getSidebarCollapsed,
    () => false
  );

  const wide = !collapsed;

  // Roles belong to a project, so the chosen one is looked up rather than
  // stored — switching projects falls back to that project's admin. A member
  // doesn't choose: they are whatever roles they were given.
  const role = useMemo(() => {
    if (!activeProject || member) return null;
    return (
      activeProject.roles.find((r) => r.id === roleId) ??
      activeProject.roles.find((r) => r.isAdmin) ??
      activeProject.roles[0] ??
      null
    );
  }, [activeProject, roleId, member]);

  /** The roles a member holds on the project on show, as it describes them. */
  const heldRoles = useMemo(() => {
    if (!member || !activeProject) return [];
    const held =
      member.places.find((p) => p.projectId === activeProject.id)?.roleIds ?? [];
    return activeProject.roles.filter((r) => held.includes(r.id));
  }, [member, activeProject]);

  // Only the workspace's owner edits a project. A member reads it, however many
  // roles they hold.
  const isAdmin = member ? false : role?.isAdmin ?? true;

  // A tool has to be enabled on the project *and* visible to the viewer.
  // Overview is always there — it is the project's own card, not one of its
  // tools — so a project with no board enabled still has somewhere to land.
  // Held roles are additive: whatever any one of them sees, the member sees.
  const available: View[] = useMemo(() => {
    if (!activeProject) return [];
    const admin = member
      ? heldRoles.some((r) => r.isAdmin)
      : role?.isAdmin ?? true;
    const sees = (
      tool: boolean,
      key: "canViewTimeline" | "canViewTracker"
    ) =>
      tool &&
      (admin ||
        (member ? heldRoles.some((r) => r[key]) : role?.[key] === true));

    return [
      "overview" as View,
      ...(sees(activeProject.hasTimeline, "canViewTimeline")
        ? (["timeline"] as View[])
        : []),
      ...(sees(activeProject.hasTracker, "canViewTracker")
        ? (["tracker"] as View[])
        : []),
    ];
  }, [activeProject, role, member, heldRoles]);

  /**
   * The roster is the workspace's, so it isn't a project's to grant: the owner
   * always has it. A member is let in by any project that carries the tool and
   * a role there that opens it — one project saying yes is enough, since what
   * they'd read is the same list either way.
   */
  const canSeeTeam = useMemo(() => {
    if (!member) return true;
    return projects.some((p) => {
      if (!p.hasTeam) return false;
      const held =
        member.places.find((place) => place.projectId === p.id)?.roleIds ?? [];
      const roles = p.roles.filter((r) => held.includes(r.id));
      return roles.some((r) => r.isAdmin || r.canViewTeam);
    });
  }, [member, projects]);

  // A project may not have both tools enabled, so the shown view is derived
  // rather than synced — switching projects or roles can never leave it on a
  // view that isn't available.
  const activeView = available.includes(view) ? view : available[0];

  // Losing the right to the roster (a role change, a project switched off) puts
  // the projects back on show rather than leaving an empty pane.
  const showingTeam = onTeam && canSeeTeam;

  /** Switching projects opens that project's card, as its admin. */
  function openProject(id: string) {
    selectProject(id);
    setRoleId(null);
    setView("overview");
    setOnTeam(false);
  }

  return (
    <div className="flex h-full flex-col bg-[var(--plane)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--surface)] px-3 py-2.5 sm:px-4">
        <Wordmark />
        <div className="flex items-center gap-2">
          {activeProject && (activeView === "timeline" || activeView === "tracker") && (
            <button onClick={() => setShowAddTask(true)} className="btn-primary">
              New task
            </button>
          )}
          <ThemeToggle />
          {member ? <MemberMenu member={member} /> : user && <AccountMenu user={user} />}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          className={`thin-scroll flex shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--hairline)] bg-[var(--surface)] p-2 ${
            wide ? "w-56" : "w-14"
          }`}
          aria-label="Projects and views"
        >
          <div className="flex flex-col gap-1">
            <div
              className={`flex items-center pt-1 pb-1 ${
                wide ? "justify-between px-2" : "justify-center"
              }`}
            >
              {wide && (
                <span className="field-label">
                  {member ? "Your projects" : "Projects"}
                </span>
              )}
              <button
                onClick={toggleSidebar}
                className="rounded p-1 text-[var(--ink-muted)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)]"
                aria-label={wide ? "Collapse sidebar" : "Expand sidebar"}
                aria-expanded={wide}
                title={wide ? "Collapse sidebar" : "Expand sidebar"}
              >
                <CollapseIcon pointsLeft={wide} />
              </button>
            </div>
            {!member && (
              <button
                onClick={() => setShowNewProject(true)}
                className={`flex items-center gap-2 rounded-[var(--radius)] p-2 text-[0.8125rem] text-[var(--ink-muted)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)] ${
                  wide ? "" : "justify-center"
                }`}
                aria-label="New project"
                title="New project"
              >
                <PlusIcon />
                {wide && <span>New project</span>}
              </button>
            )}

            {/* A project row *is* its overview — clicking it opens the card, and
                the views it carries hang underneath the one on show. Having both
                a project and an "Overview" button meant two controls doing the
                same thing. */}
            {projects.map((p) => {
              const active = p.id === activeProject?.id;
              return (
                <div key={p.id} className="flex flex-col gap-0.5">
                  <button
                    onClick={() => openProject(p.id)}
                    aria-current={active && activeView === "overview" ? "page" : undefined}
                    title={p.description ? `${p.name} — ${p.description}` : p.name}
                    className={`flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-2 text-left text-[0.8125rem] transition ${
                      wide ? "" : "justify-center"
                    } ${
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
                    {wide && <span className="truncate">{p.name}</span>}
                  </button>

                  {active && available.length > 1 && (
                    <div
                      className={`flex flex-col gap-0.5 ${
                        wide
                          ? "ml-3 border-l border-[var(--hairline)] pl-2"
                          : ""
                      }`}
                    >
                      {available.includes("timeline") && (
                        <ViewButton
                          active={activeView === "timeline"}
                          onClick={() => setView("timeline")}
                          icon={TIMELINE_ICON}
                          label="Timeline"
                          wide={wide}
                        />
                      )}
                      {available.includes("tracker") && (
                        <ViewButton
                          active={activeView === "tracker"}
                          onClick={() => setView("tracker")}
                          icon={TRACKER_ICON}
                          label="Tracker"
                          wide={wide}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* The roster stands on its own, level with the projects rather than
              under one of them: someone can be on the team — an HR person, say —
              without being on any project at all. */}
          {canSeeTeam && (
            <div className="flex flex-col gap-1 border-t border-[var(--hairline)] pt-3">
              {wide && (
                <span className="field-label px-2 pb-1">Workspace</span>
              )}
              <button
                onClick={() => setOnTeam(true)}
                aria-current={showingTeam ? "page" : undefined}
                title="Team — everyone in the workspace"
                className={`flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-2 text-left text-[0.8125rem] transition ${
                  wide ? "" : "justify-center"
                } ${
                  showingTeam
                    ? "bg-[var(--accent-wash)] font-medium text-[var(--accent)]"
                    : "text-[var(--ink-secondary)] hover:bg-[var(--plane)] hover:text-[var(--ink)]"
                }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {TEAM_ICON}
                </span>
                {wide && <span className="truncate">Team</span>}
              </button>
            </div>
          )}

          {/* A member can't try other roles on: theirs are what they hold. */}
          {member && wide && (
            <div className="flex flex-col gap-1 border-t border-[var(--hairline)] px-2 pt-3">
              <span className="field-label">Your role</span>
              {heldRoles.length === 0 ? (
                <span className="text-[0.75rem] text-[var(--ink-muted)]">
                  No role yet — you can see the project card.
                </span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {heldRoles.map((r) => (
                    <span
                      key={r.id}
                      className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--accent)]"
                    >
                      {r.name}
                    </span>
                  ))}
                </span>
              )}
            </div>
          )}

          {!member && activeProject && activeProject.roles.length > 0 && wide && (
            <label className="flex flex-col gap-1 border-t border-[var(--hairline)] px-2 pt-3">
              <span className="field-label">Viewing as</span>
              <select
                value={role?.id ?? ""}
                onChange={(e) => setRoleId(e.target.value)}
                className="select"
              >
                {activeProject.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {!isAdmin && (
                <span className="text-[0.625rem] text-[var(--ink-muted)]">
                  Showing what this role sees.
                </span>
              )}
            </label>
          )}

          {/* Only a superadmin has one of these, and it holds counts alone. */}
          {user?.role === "SUPERADMIN" && <InstallStats wide={wide} />}
        </nav>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--surface)]">
          {loading ? (
            <Centered>Loading…</Centered>
          ) : showingTeam ? (
            <>
              <div className="flex items-baseline gap-2 border-b border-[var(--hairline)] px-4 py-2.5 sm:px-6">
                <h2 className="text-[0.8125rem] font-semibold tracking-tight">
                  Team
                </h2>
                <p className="truncate text-[0.75rem] text-[var(--ink-muted)]">
                  Everyone in the workspace, across every project.
                </p>
              </div>
              <TeamView canEdit={!member} />
            </>
          ) : !activeProject ? (
            <Centered>
              {member ? (
                <p className="max-w-sm text-center text-sm text-[var(--ink-secondary)]">
                  You aren’t on any project right now. Ask whoever runs the
                  project you expected to see.
                </p>
              ) : (
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
              )}
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
              {activeView === "overview" ? (
                <ProjectOverview
                  onOpenView={(v) =>
                    v === "team" ? setOnTeam(true) : setView(v)
                  }
                  visibleViews={[
                    ...available.filter(
                      (v): v is "timeline" | "tracker" => v !== "overview"
                    ),
                    ...(canSeeTeam ? (["team"] as const) : []),
                  ]}
                  canEdit={isAdmin}
                />
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
        <ProjectModal
          onClose={() => setShowNewProject(false)}
          onSubmit={async (values) => {
            const created = await createProject(values);
            if (created) setShowNewProject(false);
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

/** Who a signed-in team member is, and the way out. */
function MemberMenu({ member }: { member: ShellMember }) {
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-full border border-[var(--hairline)] px-2.5 text-[0.75rem] font-medium transition hover:bg-[var(--plane)]"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${member.name} — team member`}
      >
        <span className="truncate">{member.name}</span>
        <span className="text-[0.625rem] uppercase tracking-wide text-[var(--ink-muted)]">
          Member
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-60 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1.5 shadow-xl"
        >
          <div className="border-b border-[var(--hairline)] px-2.5 pb-2 pt-1.5">
            <p className="truncate text-[0.8125rem] font-medium">{member.name}</p>
            <p className="truncate text-[0.75rem] text-[var(--ink-muted)]">
              {member.username ?? "Team member"}
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
  wide,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  wide: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={label}
      className={`flex items-center gap-2.5 rounded-[var(--radius)] py-2 text-[0.8125rem] font-medium transition ${
        wide ? "px-3" : "justify-center px-2"
      } ${
        active
          ? "bg-[var(--accent-wash)] text-[var(--accent)]"
          : "text-[var(--ink-secondary)] hover:bg-[var(--plane)] hover:text-[var(--ink)]"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      {wide && (
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      )}
    </button>
  );
}

function CollapseIcon({ pointsLeft }: { pointsLeft: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect
        x="1.6"
        y="2.6"
        width="12.8"
        height="10.8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M6.2 2.6v10.8" stroke="currentColor" strokeWidth="1.4" />
      <path
        d={pointsLeft ? "M11.4 6.4L9.4 8l2 1.6" : "M9.4 6.4L11.4 8l-2 1.6"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

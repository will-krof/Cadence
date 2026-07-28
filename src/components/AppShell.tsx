"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { BoardProvider, useBoard } from "@/components/BoardProvider";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FeedbackProvider } from "@/components/Feedback";
import { ProjectOverview } from "@/components/ProjectOverview";
import {
  VIEW_LABELS,
  TEAM_ICON,
  TIMELINE_ICON,
  TRACKER_ICON,
  WIKI_ICON,
} from "@/components/shell/icons";
import { AccountMenu, MemberMenu } from "@/components/shell/Menus";
import {
  Centered,
  CollapseIcon,
  PlusIcon,
  ViewButton,
} from "@/components/shell/parts";

/**
 * One tool is on screen at a time, and the project card is where every session
 * starts — so the boards, the roster and the wiki are fetched when they are
 * first opened rather than before the app has drawn anything. The two modals
 * are the same: most sessions open neither.
 *
 * The card itself stays in the first load. It is what a project opens on, and
 * splitting it would only trade a fetch for a flash of nothing.
 */
const loading = () => <Centered>Loading…</Centered>;

const GanttBoard = dynamic(
  () => import("@/components/GanttBoard").then((m) => m.GanttBoard),
  { loading }
);
const TrackerBoard = dynamic(
  () => import("@/components/TrackerBoard").then((m) => m.TrackerBoard),
  { loading }
);
const TeamView = dynamic(
  () => import("@/components/TeamView").then((m) => m.TeamView),
  { loading }
);
const WikiView = dynamic(
  () => import("@/components/WikiView").then((m) => m.WikiView),
  { loading }
);
const TaskModal = dynamic(() =>
  import("@/components/TaskModal").then((m) => m.TaskModal)
);
const ProjectModal = dynamic(() =>
  import("@/components/ProjectModal").then((m) => m.ProjectModal)
);
/** Only a superadmin ever draws this one. */
const InstallStats = dynamic(() =>
  import("@/components/InstallStats").then((m) => m.InstallStats)
);
import { HideableView, useHiddenViews } from "@/lib/prefs";

/** The views a project carries. Team isn't one: it belongs to the workspace. */
type View = "overview" | "timeline" | "tracker" | "wiki";

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
    assignable,
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

  /**
   * What the viewer may *do* with the project on show, tool by tool. A role can
   * be given a board to watch without the run of it, so the boards and the wiki
   * ask this rather than assuming that opening something means changing it.
   *
   * The owner previewing a role is shown what that role could do, which is the
   * point of previewing one.
   */
  const may = useMemo(() => {
    const answer = (
      edit: "canEditTimeline" | "canEditTracker" | "canEditWiki" | "canEditTeam"
    ) => {
      if (member) {
        return (
          heldRoles.some((r) => r.isAdmin) || heldRoles.some((r) => r[edit])
        );
      }
      return role == null || role.isAdmin || role[edit] === true;
    };
    return {
      boards: answer("canEditTimeline") || answer("canEditTracker"),
      timeline: answer("canEditTimeline"),
      tracker: answer("canEditTracker"),
      wiki: answer("canEditWiki"),
      team: answer("canEditTeam"),
    };
  }, [member, heldRoles, role]);

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
      key: "canViewTimeline" | "canViewTracker" | "canViewWiki"
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
      ...(sees(activeProject.hasWiki, "canViewWiki") ? (["wiki"] as View[]) : []),
    ];
  }, [activeProject, role, member, heldRoles]);

  /**
   * Which projects' people the viewer may read — `null` for the whole
   * workspace, which is the owner's own reach and nobody else's.
   *
   * The roster stands beside the projects, but the right to it is still a
   * project's to give: an HR role that opens Team on Somnium opens Somnium's
   * people, and no one else's. Empty means the roster isn't theirs at all.
   */
  const teamScope = useMemo<string[] | null>(() => {
    const opensTeam = (project: (typeof projects)[number], roleIds: string[]) =>
      project.roles.some(
        (r) => roleIds.includes(r.id) && (r.isAdmin || r.canViewTeam)
      );

    if (member) {
      return projects
        .filter((p) =>
          opensTeam(
            p,
            member.places.find((place) => place.projectId === p.id)?.roleIds ??
              []
          )
        )
        .map((p) => p.id);
    }

    // The owner, unless they are trying a role on for size: then they are shown
    // what that role sees, which is the one project the role belongs to.
    if (!role || role.isAdmin) return null;
    if (!activeProject) return [];
    return opensTeam(activeProject, [role.id]) ? [activeProject.id] : [];
  }, [member, projects, role, activeProject]);

  const canSeeTeam = teamScope === null || teamScope.length > 0;

  // Tools somebody keeps out of their own sidebar. The project card is never
  // one of them: hiding every tool still leaves a project to open.
  const [hiddenViews, { hide: hideView, show: showView }] = useHiddenViews();

  const archivedProjects = useMemo(
    () => projects.filter((p) => p.archived),
    [projects]
  );

  const shown = useMemo(
    () =>
      available.filter(
        (v) => v === "overview" || !hiddenViews.includes(v as HideableView)
      ),
    [available, hiddenViews]
  );

  /** Tools this project has that are only missing because they were put away. */
  const putAway = useMemo(
    () =>
      available.filter(
        (v): v is HideableView =>
          v !== "overview" && hiddenViews.includes(v as HideableView)
      ),
    [available, hiddenViews]
  );

  // A project may not have every tool enabled, and one of them may be put away,
  // so the shown view is derived rather than synced — switching projects, roles
  // or preferences can never leave it on a view that isn't there.
  const activeView = shown.includes(view) ? view : shown[0];

  // Losing the right to the roster (a role change, a project switched off) puts
  // the projects back on show rather than leaving an empty pane.
  const showingTeam = onTeam && canSeeTeam;

  /**
   * Opening one of a project's tools. It also steps off the roster, which is
   * what makes the sidebar work from inside Team: those buttons name a project
   * view, so pressing one should show it.
   */
  function openView(next: View) {
    setView(next);
    setOnTeam(false);
  }

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
          {activeProject &&
            may.boards &&
            (activeView === "timeline" || activeView === "tracker") && (
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
                same thing.

                Archived projects are still openable — their work didn't go
                anywhere — they just sit apart from the run of projects being
                worked on, the way an archived sprint does. */}
            {projects
              .filter((p) => !p.archived || p.id === activeProject?.id)
              .map((p) => {
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
                    {wide && p.archived && (
                      <span className="shrink-0 text-[0.5625rem] uppercase tracking-wide text-[var(--ink-muted)]">
                        Archived
                      </span>
                    )}
                  </button>

                  {active && (shown.length > 1 || putAway.length > 0) && (
                    <div
                      className={`flex flex-col gap-0.5 ${
                        wide
                          ? "ml-3 border-l border-[var(--hairline)] pl-2"
                          : ""
                      }`}
                    >
                      {shown.includes("timeline") && (
                        <ViewButton
                          active={activeView === "timeline"}
                          onClick={() => openView("timeline")}
                          onHide={() => hideView("timeline")}
                          icon={TIMELINE_ICON}
                          label="Timeline"
                          wide={wide}
                        />
                      )}
                      {shown.includes("tracker") && (
                        <ViewButton
                          active={activeView === "tracker"}
                          onClick={() => openView("tracker")}
                          onHide={() => hideView("tracker")}
                          icon={TRACKER_ICON}
                          label="Tracker"
                          wide={wide}
                        />
                      )}
                      {shown.includes("wiki") && (
                        <ViewButton
                          active={activeView === "wiki"}
                          onClick={() => openView("wiki")}
                          onHide={() => hideView("wiki")}
                          icon={WIKI_ICON}
                          label="Wiki"
                          wide={wide}
                        />
                      )}

                      {/* What was put away, and the way back. Hiding a tool is
                          this browser's preference, not the project's setting,
                          so it is undone from here rather than from the card. */}
                      {putAway.length > 0 && wide && (
                        <span className="flex flex-wrap items-center gap-1 px-1 pt-1">
                          <span className="field-label">Hidden</span>
                          {putAway.map((v) => (
                            <button
                              key={v}
                              onClick={() => showView(v)}
                              className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[0.625rem] text-[var(--ink-muted)] transition hover:border-[var(--baseline)] hover:text-[var(--ink)]"
                              title={`Show ${VIEW_LABELS[v]} again`}
                            >
                              {VIEW_LABELS[v]}
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
              })}
            {/* Put away, and the way back to one. Opening an archived project
                is reading it; it stays out of the run above until the card
                itself brings it back. */}
            {archivedProjects.length > 0 && !member && (
              <div className="flex flex-col gap-0.5 border-t border-[var(--hairline)] pt-2">
                {wide && (
                  <span className="field-label px-2 pb-1">Archived</span>
                )}
                {archivedProjects
                  .filter((p) => p.id !== activeProject?.id)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => openProject(p.id)}
                      title={`${p.name} — archived`}
                      className={`flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-left text-[0.75rem] text-[var(--ink-muted)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)] ${
                        wide ? "" : "justify-center"
                      }`}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[0.3rem] bg-[var(--gridline)] text-[0.625rem] font-semibold uppercase text-[var(--ink-secondary)]">
                        {p.name.slice(0, 1)}
                      </span>
                      {wide && <span className="truncate">{p.name}</span>}
                    </button>
                  ))}
              </div>
            )}
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
                  {teamScope === null
                    ? "Everyone in the workspace, across every project."
                    : "The people on the projects you can see."}
                </p>
              </div>
              <TeamView
                canEdit={!member && teamScope === null}
                /** A role with the roster in hand keeps a profile's working half. */
                canEditPeople={may.team}
                scope={teamScope}
              />
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
                  onOpenView={(v) => (v === "team" ? setOnTeam(true) : openView(v))}
                  visibleViews={[
                    ...shown.filter(
                      (v): v is "timeline" | "tracker" | "wiki" =>
                        v !== "overview"
                    ),
                    ...(canSeeTeam ? (["team"] as const) : []),
                  ]}
                  canEdit={isAdmin}
                />
              ) : projectLoading ? (
                <Centered>Loading project…</Centered>
              ) : activeView === "timeline" ? (
                <GanttBoard canEdit={may.timeline} />
              ) : activeView === "wiki" ? (
                <WikiView project={activeProject} canEdit={may.wiki} />
              ) : (
                <TrackerBoard canEdit={may.tracker} />
              )}
            </>
          )}
        </main>
      </div>

      {showAddTask && activeProject && (
        <TaskModal
          developers={assignable}
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


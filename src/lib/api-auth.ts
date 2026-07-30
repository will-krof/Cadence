import { NextResponse } from "next/server";
import { getSessionUser, SessionUser } from "@/lib/auth";
import { memberProjectIds, MemberViewer, Viewer } from "@/lib/viewer";

/**
 * Resolves the account behind the request, or the 401 response to return.
 * Everything that changes a workspace starts with this: team members who came
 * in through an invite link read, and move work; owners write.
 */
export async function requireUser(): Promise<
  { user: SessionUser; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  return { user };
}

/** Whose workspace the viewer is looking at — their own, or the one they visit. */
export function workspaceOwnerId(viewer: Viewer) {
  return viewer.kind === "owner" ? viewer.user.id : viewer.ownerId;
}

/**
 * Narrows one of the filters below to a single project, without the two ever
 * being merged into the same object.
 *
 * This exists because spreading them together silently threw one of them away.
 * A member's filter is `{ projectId: { in: [...] } }` and a caller's choice is
 * `{ projectId: "…" }` — the same key — so `{ ...scope, ...asked }` kept only
 * the caller's, scope and all, and `{ ...asked, ...scope }` kept only the
 * scope and ignored what was asked for. One of those is a hole and the other
 * is wrong data, and which one you got depended on the order two spreads
 * happened to be written in.
 *
 * `AND` has no such edge: both clauses stand, whatever they are keyed on. Every
 * route that lets a caller name a project goes through here, so the scope can't
 * be dropped by writing the spread the other way round.
 */
export function scopedToProject<T extends object>(
  scope: T,
  projectId: string | null | undefined
) {
  return projectId ? { AND: [scope, { projectId }] } : scope;
}

/** The projects where a member's roles open a board of some kind. */
function boardProjectIds(member: MemberViewer) {
  return member.places
    .filter((p) => p.canViewTimeline || p.canViewTracker)
    .map((p) => p.projectId);
}

/** Narrower still: the projects whose work they may move. */
export function boardWriteFilter(viewer: Viewer) {
  return viewer.kind === "owner"
    ? { project: { userId: viewer.user.id } }
    : {
        projectId: {
          in: viewer.places
            .filter((p) => p.canEditTimeline || p.canEditTracker)
            .map((p) => p.projectId),
        },
      };
}

/** The projects where a member's roles open the wiki. */
function wikiProjectIds(member: MemberViewer) {
  return member.places.filter((p) => p.canViewWiki).map((p) => p.projectId);
}

/** The projects where a member's roles open the team roster. */
function teamProjectIds(member: MemberViewer) {
  return member.places.filter((p) => p.canViewTeam).map((p) => p.projectId);
}

/**
 * The projects a viewer may read: a whole workspace for its owner, the ones
 * they are a member of for everybody else.
 */
export function projectScope(viewer: Viewer) {
  return viewer.kind === "owner"
    ? { userId: viewer.user.id }
    : { userId: viewer.ownerId, id: { in: memberProjectIds(viewer) } };
}

/** The same reach, as a filter on rows that hang off a project. */
export function projectFilter(viewer: Viewer) {
  return viewer.kind === "owner"
    ? { project: { userId: viewer.user.id } }
    : { projectId: { in: memberProjectIds(viewer) } };
}

/** Narrower: only the projects whose boards this viewer can open. */
export function boardFilter(viewer: Viewer) {
  return viewer.kind === "owner"
    ? { project: { userId: viewer.user.id } }
    : { projectId: { in: boardProjectIds(viewer) } };
}

/** Narrower again: only the projects whose roster this viewer can open. */
export function teamFilter(viewer: Viewer) {
  return viewer.kind === "owner"
    ? { project: { userId: viewer.user.id } }
    : { projectId: { in: teamProjectIds(viewer) } };
}

/** Narrower again: only the projects whose wiki this viewer can open. */
export function wikiFilter(viewer: Viewer) {
  return viewer.kind === "owner"
    ? { project: { userId: viewer.user.id } }
    : { projectId: { in: wikiProjectIds(viewer) } };
}

/**
 * The people a viewer may read. A member gets the people on the projects they
 * have something to open — a board to name an assignee on, or the roster
 * itself. A project whose tools their roles all close is a project whose people
 * they have no screen to meet on, so its profiles stay behind.
 */
export function developerScope(viewer: Viewer) {
  if (viewer.kind === "owner") return { userId: viewer.user.id };
  const projectIds = [
    ...new Set([...boardProjectIds(viewer), ...teamProjectIds(viewer)]),
  ];
  return {
    userId: viewer.ownerId,
    OR: [
      { memberships: { some: { projectId: { in: projectIds } } } },
      { tasks: { some: { task: { projectId: { in: projectIds } } } } },
    ],
  };
}

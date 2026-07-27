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

/** The projects where a member's roles open a board of some kind. */
function boardProjectIds(member: MemberViewer) {
  return member.places
    .filter((p) => p.canViewTimeline || p.canViewTracker)
    .map((p) => p.projectId);
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

/**
 * The people a viewer may read. A member gets the people on their own projects
 * — enough to draw an avatar beside a task, and nobody else's profile.
 */
export function developerScope(viewer: Viewer) {
  if (viewer.kind === "owner") return { userId: viewer.user.id };
  const projectIds = memberProjectIds(viewer);
  return {
    userId: viewer.ownerId,
    OR: [
      { memberships: { some: { projectId: { in: projectIds } } } },
      { tasks: { some: { projectId: { in: projectIds } } } },
    ],
  };
}

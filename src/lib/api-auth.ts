import { NextResponse } from "next/server";
import { getSessionUser, SessionUser } from "@/lib/auth";
import { Viewer } from "@/lib/viewer";

/**
 * Resolves the account behind the request, or the 401 response to return.
 * Everything that changes a workspace starts with this: guests who came in
 * through an invite link read, owners write.
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
 * The projects a viewer may read: a whole workspace for its owner, the one
 * project they were invited to for a guest.
 */
export function projectScope(viewer: Viewer) {
  return viewer.kind === "owner"
    ? { userId: viewer.user.id }
    : { id: viewer.projectId, userId: viewer.ownerId };
}

/** The same reach, as a filter on rows that hang off a project. */
export function projectFilter(viewer: Viewer) {
  return viewer.kind === "owner"
    ? { project: { userId: viewer.user.id } }
    : { projectId: viewer.projectId };
}

/**
 * The people a viewer may read. A guest gets the project's own people — enough
 * to draw an avatar beside a task, and nobody else's profile.
 */
export function developerScope(viewer: Viewer) {
  if (viewer.kind === "owner") return { userId: viewer.user.id };
  return {
    userId: viewer.ownerId,
    OR: [
      { memberships: { some: { projectId: viewer.projectId } } },
      { tasks: { some: { projectId: viewer.projectId } } },
    ],
  };
}

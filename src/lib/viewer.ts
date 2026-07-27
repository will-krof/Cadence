import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionDeveloperId,
  getSessionUser,
  SessionUser,
} from "@/lib/auth";

/**
 * Who is asking. Either the account that owns a workspace, or a team member
 * signed in with the login their invite link set up — who reaches the projects
 * they are a member of, through the roles they hold on each one.
 */
export interface OwnerViewer {
  kind: "owner";
  user: SessionUser;
}

/** What one member may do on one project, their roles taken together. */
export interface MemberPlace {
  projectId: string;
  roleIds: string[];
  isAdmin: boolean;
  canViewTimeline: boolean;
  canViewTracker: boolean;
  canViewTeam: boolean;
  canViewWiki: boolean;
}

export interface MemberViewer {
  kind: "member";
  developerId: string;
  developerName: string;
  username: string | null;
  /** The account whose workspace these projects sit in. */
  ownerId: string;
  places: MemberPlace[];
}

export type Viewer = OwnerViewer | MemberViewer;

/** Reads the signed-in team member, and what each of their projects allows. */
export async function getSessionMember(): Promise<MemberViewer | null> {
  const developerId = await getSessionDeveloperId();
  if (!developerId) return null;

  const developer = await prisma.developer.findUnique({
    where: { id: developerId },
    select: {
      id: true,
      name: true,
      username: true,
      active: true,
      userId: true,
      memberships: {
        select: {
          projectId: true,
          roles: {
            select: {
              role: {
                select: {
                  id: true,
                  isAdmin: true,
                  canViewTimeline: true,
                  canViewTracker: true,
                  canViewTeam: true,
                  canViewWiki: true,
                },
              },
            },
          },
        },
      },
    },
  });
  // An archived person is off the team, so their login stops working with them.
  if (!developer || !developer.active) return null;

  return {
    kind: "member",
    developerId: developer.id,
    developerName: developer.name,
    username: developer.username,
    ownerId: developer.userId,
    // Held roles are additive: whatever any one of them can see, they see.
    places: developer.memberships.map((m) => {
      const roles = m.roles.map((r) => r.role);
      const isAdmin = roles.some((r) => r.isAdmin);
      return {
        projectId: m.projectId,
        roleIds: roles.map((r) => r.id),
        isAdmin,
        canViewTimeline: isAdmin || roles.some((r) => r.canViewTimeline),
        canViewTracker: isAdmin || roles.some((r) => r.canViewTracker),
        canViewTeam: isAdmin || roles.some((r) => r.canViewTeam),
        canViewWiki: isAdmin || roles.some((r) => r.canViewWiki),
      };
    }),
  };
}

/**
 * An account session wins over a member one: someone who owns a workspace and
 * is also on somebody's project should land in their own.
 */
export async function getViewer(): Promise<Viewer | null> {
  const user = await getSessionUser();
  if (user) return { kind: "owner", user };
  return getSessionMember();
}

const notSignedIn = () =>
  NextResponse.json({ error: "Not signed in" }, { status: 401 });

/** For the read endpoints, which a member is allowed to reach. */
export async function requireViewer(): Promise<
  { viewer: Viewer; response?: never } | { viewer?: never; response: NextResponse }
> {
  const viewer = await getViewer();
  if (!viewer) return { response: notSignedIn() };
  return { viewer };
}

/**
 * Whoever is asking, as they are called right now. A task's history keeps the
 * name rather than a link to it: what happened, happened, and a profile that is
 * renamed later shouldn't rewrite the record.
 */
export function viewerName(viewer: Viewer) {
  return viewer.kind === "owner"
    ? viewer.user.name || viewer.user.email
    : viewer.developerName;
}

/** The projects a member is on. */
export function memberProjectIds(member: MemberViewer) {
  return member.places.map((p) => p.projectId);
}

/** Their standing on one project, or null if they aren't on it. */
function placeOn(member: MemberViewer, projectId: string) {
  return member.places.find((p) => p.projectId === projectId) ?? null;
}

/** True when a member has a board to look at on the project named. */
export function memberSeesBoards(member: MemberViewer, projectId: string) {
  const place = placeOn(member, projectId);
  return place != null && (place.canViewTimeline || place.canViewTracker);
}

/**
 * Tasks are the one thing a member may change: someone invited as a developer
 * moves their own work across the board. It takes a board in one of their
 * roles, and it never reaches past the projects they are on.
 *
 * A null project means "whichever project the row turns out to be in" — the
 * query scopes that, and this only asks whether any project qualifies.
 */
export function memberDenied(viewer: Viewer, projectId: string | null) {
  if (viewer.kind !== "member") return false;
  if (projectId != null) return !memberSeesBoards(viewer, projectId);
  return !viewer.places.some((p) => p.canViewTimeline || p.canViewTracker);
}

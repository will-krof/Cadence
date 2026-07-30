import { cache } from "react";
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
  canEditTimeline: boolean;
  canViewTracker: boolean;
  canEditTracker: boolean;
  canViewTeam: boolean;
  canEditTeam: boolean;
  canViewWiki: boolean;
  canEditWiki: boolean;
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

/**
 * Reads the signed-in team member, and what each of their projects allows.
 *
 * This is the widest query the app runs before it does anything — a person,
 * their memberships, and every role on each — and it answers a question that
 * cannot change part-way through a request. Memoized for the same reason as
 * `getSessionUser`: one ask per request is what happens now, and this is what
 * keeps it one ask when a second caller turns up.
 */
export const getSessionMember = cache(async function getSessionMember(): Promise<
  MemberViewer | null
> {
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
                  canEditTimeline: true,
                  canViewTracker: true,
                  canEditTracker: true,
                  canViewTeam: true,
                  canEditTeam: true,
                  canViewWiki: true,
                  canEditWiki: true,
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
        // Editing implies watching, so a role that may change a tool can open
        // it whatever its view flag happens to say.
        canViewTimeline:
          isAdmin || roles.some((r) => r.canViewTimeline || r.canEditTimeline),
        canEditTimeline: isAdmin || roles.some((r) => r.canEditTimeline),
        canViewTracker:
          isAdmin || roles.some((r) => r.canViewTracker || r.canEditTracker),
        canEditTracker: isAdmin || roles.some((r) => r.canEditTracker),
        canViewTeam: isAdmin || roles.some((r) => r.canViewTeam || r.canEditTeam),
        canEditTeam: isAdmin || roles.some((r) => r.canEditTeam),
        canViewWiki: isAdmin || roles.some((r) => r.canViewWiki || r.canEditWiki),
        canEditWiki: isAdmin || roles.some((r) => r.canEditWiki),
      };
    }),
  };
});

/**
 * An account session wins over a member one: someone who owns a workspace and
 * is also on somebody's project should land in their own.
 */
export const getViewer = cache(async function getViewer(): Promise<Viewer | null> {
  const user = await getSessionUser();
  if (user) return { kind: "owner", user };
  return getSessionMember();
});

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

/** And true when one of their roles there lets them move the work. */
export function memberMovesWork(member: MemberViewer, projectId: string) {
  const place = placeOn(member, projectId);
  return place != null && (place.canEditTimeline || place.canEditTracker);
}

/** The same question for the wiki: may they write on this project's pages? */
export function memberWritesWiki(member: MemberViewer, projectId: string) {
  return placeOn(member, projectId)?.canEditWiki === true;
}

/** The projects where a member may change the working half of a profile. */
export function teamEditProjectIds(member: MemberViewer) {
  return member.places.filter((p) => p.canEditTeam).map((p) => p.projectId);
}

/**
 * Whether a member may *change* the work rather than watch it. A role can be
 * given a board to watch without being given the run of it, so this asks the
 * edit flags and not the view ones.
 *
 * A null project means "whichever project the row turns out to be in" — the
 * query scopes that, and this only asks whether any project qualifies.
 */
export function memberDenied(viewer: Viewer, projectId: string | null) {
  if (viewer.kind !== "member") return false;
  if (projectId != null) return !memberMovesWork(viewer, projectId);
  return !viewer.places.some((p) => p.canEditTimeline || p.canEditTracker);
}

/** The same question for reading: watching a board is enough to be shown it. */
export function memberCannotRead(viewer: Viewer, projectId: string | null) {
  if (viewer.kind !== "member") return false;
  if (projectId != null) return !memberSeesBoards(viewer, projectId);
  return !viewer.places.some((p) => p.canViewTimeline || p.canViewTracker);
}

/**
 * And for the wiki, which is its own tool with its own flag: a role given the
 * boards is not thereby given what the project wrote down.
 *
 * A project the member isn't on at all reads the same as one whose roles close
 * the wiki — `placeOn` returns null, and null can't view anything.
 */
export function memberCannotReadWiki(viewer: Viewer, projectId: string | null) {
  if (viewer.kind !== "member") return false;
  if (projectId != null) return placeOn(viewer, projectId)?.canViewWiki !== true;
  return !viewer.places.some((p) => p.canViewWiki);
}

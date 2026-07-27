import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, SessionUser } from "@/lib/auth";
import { INVITE_COOKIE } from "@/lib/invite";

/**
 * Who is asking. Either the account that owns a workspace, or someone who
 * followed an invite link — a guest, who is one project's business only and
 * sees it through the roles they were given.
 */
export interface OwnerViewer {
  kind: "owner";
  user: SessionUser;
}

export interface GuestViewer {
  kind: "guest";
  memberId: string;
  projectId: string;
  developerId: string;
  developerName: string;
  /** The account whose workspace the project sits in. */
  ownerId: string;
  roleIds: string[];
  /** Held roles are additive: whatever any one of them can see, they see. */
  isAdmin: boolean;
  canViewTimeline: boolean;
  canViewTracker: boolean;
  canViewTeam: boolean;
}

export type Viewer = OwnerViewer | GuestViewer;

/** Reads the guest an unrevoked invite cookie stands for, if any. */
export async function getInviteGuest(): Promise<GuestViewer | null> {
  const store = await cookies();
  const token = store.get(INVITE_COOKIE)?.value;
  if (!token) return null;

  const member = await prisma.projectMember.findFirst({
    where: { inviteToken: token, inviteRevoked: false },
    select: {
      id: true,
      projectId: true,
      developerId: true,
      developer: { select: { name: true, active: true } },
      project: { select: { userId: true } },
      roles: {
        select: {
          role: {
            select: {
              id: true,
              isAdmin: true,
              canViewTimeline: true,
              canViewTracker: true,
              canViewTeam: true,
            },
          },
        },
      },
    },
  });
  // An archived person is off the team, so their link stops working with them.
  if (!member || !member.developer.active) return null;

  const roles = member.roles.map((r) => r.role);
  const isAdmin = roles.some((r) => r.isAdmin);

  return {
    kind: "guest",
    memberId: member.id,
    projectId: member.projectId,
    developerId: member.developerId,
    developerName: member.developer.name,
    ownerId: member.project.userId,
    roleIds: roles.map((r) => r.id),
    isAdmin,
    canViewTimeline: isAdmin || roles.some((r) => r.canViewTimeline),
    canViewTracker: isAdmin || roles.some((r) => r.canViewTracker),
    canViewTeam: isAdmin || roles.some((r) => r.canViewTeam),
  };
}

/**
 * An account session wins over an invite cookie: someone who owns a workspace
 * and happens to hold an invite link should still land in their own.
 */
export async function getViewer(): Promise<Viewer | null> {
  const user = await getSessionUser();
  if (user) return { kind: "owner", user };
  return getInviteGuest();
}

const notSignedIn = () =>
  NextResponse.json({ error: "Not signed in" }, { status: 401 });

/** For the read endpoints, which a guest is allowed to reach. */
export async function requireViewer(): Promise<
  { viewer: Viewer; response?: never } | { viewer?: never; response: NextResponse }
> {
  const viewer = await getViewer();
  if (!viewer) return { response: notSignedIn() };
  return { viewer };
}

/** True when a guest may look at the boards of the project they were invited to. */
export function guestSeesBoards(guest: GuestViewer) {
  return guest.canViewTimeline || guest.canViewTracker;
}

/**
 * Tasks are the one thing a guest may change: someone invited as a developer
 * moves their own work across the board. It takes a board in one of their
 * roles, and it never reaches past the project they were invited to.
 */
export function guestDenied(viewer: Viewer, projectId: string | null) {
  if (viewer.kind !== "guest") return false;
  if (!guestSeesBoards(viewer)) return true;
  return projectId != null && projectId !== viewer.projectId;
}

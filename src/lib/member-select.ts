import { prisma } from "@/lib/prisma";
import { freshInvite, inviteHasExpired } from "@/lib/invite";

/**
 * How a membership travels: who is on which project, in which roles, and the
 * invite link that sets their login up. The link is the admin's business, so it
 * is left out for anyone who is on the project rather than running it.
 */
export const MEMBER_FIELDS = {
  projectId: true,
  developerId: true,
  roles: { select: { roleId: true } },
  inviteToken: true,
  inviteCreatedAt: true,
  inviteExpiresAt: true,
  inviteRevoked: true,
  inviteUsedAt: true,
  developer: { select: { username: true } },
} as const;

export interface MemberRow {
  projectId: string;
  developerId: string;
  roles: { roleId: string }[];
  inviteToken: string | null;
  inviteCreatedAt: Date | null;
  inviteExpiresAt: Date | null;
  inviteRevoked: boolean;
  inviteUsedAt: Date | null;
  developer: { username: string | null };
}

export function memberPayload(member: MemberRow, withInvite = true) {
  // A revoked link keeps its row without its token — there is nothing left to
  // copy, but the admin should still see that there was a link and that it is
  // dead, rather than the row looking as though one was never made.
  const hasInvite = member.inviteToken != null || member.inviteRevoked;
  return {
    projectId: member.projectId,
    developerId: member.developerId,
    roleIds: member.roles.map((r) => r.roleId),
    /** Once they have picked a username, the link has done its job. */
    hasLogin: member.developer.username != null,
    invite:
      withInvite && hasInvite
        ? {
            token: member.inviteToken,
            createdAt: member.inviteCreatedAt,
            expiresAt: member.inviteExpiresAt,
            revoked: member.inviteRevoked,
            usedAt: member.inviteUsedAt,
          }
        : null,
  };
}

/**
 * Replaces the links that have run out. A three-day link that nobody opened is
 * no use to anybody, so rather than leaving a dead row for an admin to notice,
 * the next look at the memberships hands them a live one.
 *
 * People who already have a login are left alone: their link is spent, and a
 * new one would be an offer to set a fresh password that nobody asked for.
 */
export async function refreshExpiredInvites(where: {
  project: { userId: string };
}) {
  const stale = await prisma.projectMember.findMany({
    where: {
      ...where,
      inviteRevoked: false,
      inviteToken: { not: null },
      inviteExpiresAt: { lte: new Date() },
      developer: { username: null },
      // No role behind it, nothing to invite them into.
      roles: { some: {} },
    },
    select: { id: true, inviteExpiresAt: true },
  });

  await Promise.all(
    stale
      .filter((m) => inviteHasExpired(m.inviteExpiresAt))
      .map((m) =>
        prisma.projectMember.update({ where: { id: m.id }, data: freshInvite() })
      )
  );
}

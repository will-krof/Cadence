/**
 * How a membership travels: who is on which project, in which roles, and the
 * invite link that lets them in. The link is the admin's business, so it is
 * left out for anyone who came in through one.
 */
export const MEMBER_FIELDS = {
  projectId: true,
  developerId: true,
  roles: { select: { roleId: true } },
  inviteToken: true,
  inviteCreatedAt: true,
  inviteRevoked: true,
  inviteUsedAt: true,
} as const;

export interface MemberRow {
  projectId: string;
  developerId: string;
  roles: { roleId: string }[];
  inviteToken: string | null;
  inviteCreatedAt: Date | null;
  inviteRevoked: boolean;
  inviteUsedAt: Date | null;
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
    invite:
      withInvite && hasInvite
        ? {
            token: member.inviteToken,
            createdAt: member.inviteCreatedAt,
            revoked: member.inviteRevoked,
            usedAt: member.inviteUsedAt,
          }
        : null,
  };
}

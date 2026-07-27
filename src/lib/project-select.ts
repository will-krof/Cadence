/**
 * What a project looks like on the wire. Named rather than "everything the row
 * has", so the account that owns it isn't part of what a member downloads.
 */
export const PROJECT_FIELDS = {
  id: true,
  name: true,
  description: true,
  hasTimeline: true,
  hasTracker: true,
  hasTeam: true,
  createdAt: true,
  roles: { orderBy: { createdAt: "asc" } },
} as const;

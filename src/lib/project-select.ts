import type { Prisma } from "@/generated/prisma/client";

/**
 * A stable order: two roles made in the same millisecond would otherwise swap
 * places between requests, and the table would reshuffle under a rename.
 */
const ROLE_ORDER: Prisma.ProjectRoleOrderByWithRelationInput[] = [
  { createdAt: "asc" },
  { name: "asc" },
];

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
  hasWiki: true,
  archived: true,
  createdAt: true,
  roles: { orderBy: ROLE_ORDER },
} as const;

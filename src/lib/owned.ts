import { prisma } from "@/lib/prisma";

/**
 * "Does this belong to the account asking?" — the question every write in the
 * app starts with, asked the same way each time.
 *
 * Each of these answers with the row's id (and whatever else the caller needs
 * to decide with), or null. Null means the same thing whether the row is
 * missing or somebody else's: the route answers 404 either way, so nothing here
 * needs to tell the two apart, and nothing built on it can leak the difference.
 */
export function ownedProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
}

export function ownedDeveloper(userId: string, developerId: string) {
  return prisma.developer.findFirst({
    where: { id: developerId, userId },
    select: { id: true },
  });
}

export function ownedRole(userId: string, projectId: string, roleId: string) {
  return prisma.projectRole.findFirst({
    where: { id: roleId, projectId, project: { userId } },
    select: { id: true, name: true, isAdmin: true },
  });
}

export function ownedTag(userId: string, projectId: string, tagId: string) {
  return prisma.projectTag.findFirst({
    where: { id: tagId, projectId, project: { userId } },
    select: { id: true, name: true },
  });
}

export function ownedWikiPage(userId: string, pageId: string) {
  return prisma.wikiPage.findFirst({
    where: { id: pageId, project: { userId } },
    select: { id: true, projectId: true, parentId: true },
  });
}

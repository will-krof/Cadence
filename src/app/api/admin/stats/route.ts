import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

/**
 * How much the install is being used, for a superadmin. Counts and nothing else:
 * no emails, no names, no project or person titles — a workspace is a row with
 * two numbers on it, in no particular order that could be matched back to
 * anybody. Being a superadmin buys this page and no reach at all into a
 * workspace's contents.
 *
 * Anyone else, signed in or not, is told this doesn't exist rather than that
 * they aren't allowed it.
 */
export async function GET(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;
  if (user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Three grouped counts rather than a query per workspace: how many projects
  // each account has, and how many memberships those projects hold.
  const [accounts, projectsByUser, members, developers, tasks] =
    await Promise.all([
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.project.groupBy({ by: ["userId"], _count: { _all: true } }),
      prisma.projectMember.findMany({
        select: { developerId: true, project: { select: { userId: true } } },
      }),
      prisma.developer.groupBy({ by: ["userId"], _count: { _all: true } }),
      prisma.task.count(),
    ]);

  /** Distinct people on a workspace's projects — one person on three counts once. */
  const peopleByUser = new Map<string, Set<string>>();
  for (const member of members) {
    const owner = member.project.userId;
    const seen = peopleByUser.get(owner) ?? new Set<string>();
    seen.add(member.developerId);
    peopleByUser.set(owner, seen);
  }

  const rosterByUser = new Map(
    developers.map((d) => [d.userId, d._count._all])
  );

  const workspaces = projectsByUser
    .map((row) => ({
      projects: row._count._all,
      /** People given a place on those projects. */
      people: peopleByUser.get(row.userId)?.size ?? 0,
      /** Everybody in the workspace's roster, on a project or not. */
      roster: rosterByUser.get(row.userId) ?? 0,
    }))
    // Sorted by size, so the shape of the install reads at a glance — and so
    // the order says nothing about who is who.
    .sort((a, b) => b.projects - a.projects || b.people - a.people);

  const admins =
    accounts.find((a) => a.role === "ADMIN")?._count._all ?? 0;
  const superadmins =
    accounts.find((a) => a.role === "SUPERADMIN")?._count._all ?? 0;

  return jsonResponse(request, {
    admins,
    superadmins,
    /** Accounts that have never made a project don't appear in the list below. */
    withoutProjects: admins + superadmins - workspaces.length,
    projects: projectsByUser.reduce((sum, row) => sum + row._count._all, 0),
    people: new Set(members.map((m) => m.developerId)).size,
    tasks,
    workspaces,
  });
}

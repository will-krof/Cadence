import { prisma } from "@/lib/prisma";
import { developerScope, teamFilter } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { jsonResponse } from "@/lib/json-response";
import { forbidden, notFound } from "@/lib/responses";
import { NextRequest } from "next/server";

/**
 * Everything assigned to one person, across every project they appear in —
 * the board only ever holds the active project's tasks. A team member sees this
 * through their own projects: their roles have to include the Team view, and
 * the work listed is the work on the projects where they do.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/developers/[id]/tasks">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;
  if (viewer.kind === "member" && !viewer.places.some((p) => p.canViewTeam)) {
    return forbidden("Your role can't see the team");
  }

  const { id } = await ctx.params;

  const reachable = await prisma.developer.findFirst({
    where: { id, ...developerScope(viewer) },
    select: { id: true },
  });
  if (!reachable) return notFound("Developer");

  // The card lists a title, a status, a due date and the project — nothing else
  // needs to travel.
  const tasks = await prisma.task.findMany({
    where: { developerId: id, ...teamFilter(viewer) },
    select: {
      id: true,
      title: true,
      status: true,
      endDate: true,
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ endDate: "asc" }],
  });

  return jsonResponse(request, tasks);
}

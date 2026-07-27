import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

/**
 * Everything assigned to one person, across every project they appear in —
 * the board only ever holds the active project's tasks.
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/developers/[id]/tasks">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;

  const owned = await prisma.developer.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  // The card lists a title, a status, a due date and the project — nothing else
  // needs to travel.
  const tasks = await prisma.task.findMany({
    where: { developerId: id, project: { userId: user.id } },
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

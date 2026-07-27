import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest } from "next/server";

/**
 * Every project membership in the workspace, in one go — the Team view shows
 * the whole roster at once, so asking per project would be a request per row.
 */
export async function GET(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const members = await prisma.projectMember.findMany({
    where: { project: { userId: user.id } },
    select: { projectId: true, developerId: true, roleId: true },
  });
  return jsonResponse(request, members);
}

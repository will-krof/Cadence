import { prisma } from "@/lib/prisma";
import { projectFilter } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import {
  MEMBER_FIELDS,
  memberPayload,
  refreshExpiredInvites,
} from "@/lib/member-select";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest } from "next/server";

/**
 * Every project membership in the workspace, in one go — the Team view shows
 * the whole roster at once, so asking per project would be a request per row.
 *
 * Invite links ride along for the owner, who is the one who hands them out; a
 * member gets the memberships without them.
 */
export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  // The owner is about to be shown these links, so any that ran out are
  // replaced first: what they copy is always a link that works.
  if (viewer.kind === "owner") {
    await refreshExpiredInvites({ project: { userId: viewer.user.id } });
  }

  const members = await prisma.projectMember.findMany({
    where: projectFilter(viewer),
    select: MEMBER_FIELDS,
  });

  const isOwner = viewer.kind === "owner";
  return jsonResponse(
    request,
    members.map((m) => memberPayload(m, isOwner))
  );
}

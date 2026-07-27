import { prisma } from "@/lib/prisma";
import { developerScope, requireUser } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { parseDeveloper } from "@/lib/developer-input";
import {
  DEVELOPER_FIELDS,
  TEAMMATE_FIELDS,
  teammatePayload,
} from "@/lib/developer-select";
import { jsonResponse } from "@/lib/json-response";
import { badRequest } from "@/lib/responses";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  // A team member is shown who their colleagues are, not what the workspace
  // knows about them: salaries, phone numbers and notes stay server-side.
  if (viewer.kind === "member") {
    const teammates = await prisma.developer.findMany({
      where: developerScope(viewer),
      select: TEAMMATE_FIELDS,
      orderBy: { createdAt: "asc" },
    });
    return jsonResponse(request, teammates.map(teammatePayload));
  }

  // A whole roster of profiles in one answer, so it travels compressed.
  const developers = await prisma.developer.findMany({
    where: developerScope(viewer),
    select: DEVELOPER_FIELDS,
    orderBy: { createdAt: "asc" },
  });
  return jsonResponse(request, developers);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  if (!body.name) return badRequest("Name is required");

  const parsed = parseDeveloper(body);
  if ("error" in parsed) return badRequest(parsed.error);

  const developer = await prisma.developer.create({
    data: { ...parsed.data, name: parsed.data.name!, userId: user.id },
    select: DEVELOPER_FIELDS,
  });
  return NextResponse.json(developer, { status: 201 });
}

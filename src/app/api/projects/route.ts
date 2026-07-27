import { prisma } from "@/lib/prisma";
import { projectScope, requireUser } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // A guest sees one project — the one their invite link is for.
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const projects = await prisma.project.findMany({
    where: projectScope(viewer),
    orderBy: { createdAt: "asc" },
    include: { roles: { orderBy: { createdAt: "asc" } } },
  });
  return jsonResponse(request, projects);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // A project with nothing enabled would be unreachable in the UI.
  const hasTimeline = body.hasTimeline !== false;
  const hasTracker = body.hasTracker !== false;
  const hasTeam = body.hasTeam !== false;
  if (!hasTimeline && !hasTracker && !hasTeam) {
    return NextResponse.json(
      { error: "Enable at least one tool" },
      { status: 400 }
    );
  }

  // Every project starts with the two roles most teams need; developers get
  // the boards but not the roster until an admin says otherwise.
  const project = await prisma.project.create({
    data: {
      name,
      description: body.description?.trim() || null,
      hasTimeline,
      hasTracker,
      hasTeam,
      userId: user.id,
      roles: {
        create: [
          {
            name: "admin",
            isAdmin: true,
            canViewTimeline: true,
            canViewTracker: true,
            canViewTeam: true,
          },
          {
            name: "developer",
            canViewTimeline: true,
            canViewTracker: true,
            canViewTeam: false,
          },
        ],
      },
    },
    include: { roles: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(project, { status: 201 });
}

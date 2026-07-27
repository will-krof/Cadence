import { prisma } from "@/lib/prisma";
import { projectScope, requireUser } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { PROJECT_FIELDS } from "@/lib/project-select";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  // A member sees the projects they are on; the owner sees the workspace.
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const projects = await prisma.project.findMany({
    where: projectScope(viewer),
    orderBy: { createdAt: "asc" },
    select: PROJECT_FIELDS,
  });
  return jsonResponse(request, projects);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const named = boundedText(body.name, LIMITS.name);
  const described = boundedText(body.description, LIMITS.description);

  if ("tooLong" in named || "tooLong" in described) {
    return NextResponse.json({ error: "That is too long" }, { status: 400 });
  }
  const name = named.value;
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
      description: described.value,
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
    select: PROJECT_FIELDS,
  });
  return NextResponse.json(project, { status: 201 });
}

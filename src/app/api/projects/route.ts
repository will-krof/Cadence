import { prisma } from "@/lib/prisma";
import { projectScope, requireUser } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { PROJECT_FIELDS } from "@/lib/project-select";
import { parseFlags, parseSpan } from "@/lib/project-input";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { badRequest } from "@/lib/responses";
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
    return badRequest("That is too long");
  }
  const name = named.value;
  if (!name) return badRequest("Name is required");

  // The tools and the task fields are the project's to switch off. Its people
  // are not: every project has a team, so a project with no tool at all is
  // still a project somebody can open.
  const flags = parseFlags(body, { fillIn: true });

  // A project can say when it runs rather than leaving it to its tasks — which
  // is what a team that doesn't plan in sprints needs.
  const span = parseSpan(body);
  if ("error" in span) return badRequest(span.error);

  // Every project starts with the two roles most teams need; developers get
  // the boards but not the roster until an admin says otherwise.
  const project = await prisma.project.create({
    data: {
      name,
      description: described.value,
      ...flags,
      ...span.data,
      userId: user.id,
      roles: {
        create: [
          {
            name: "admin",
            isAdmin: true,
            canViewTimeline: true,
            canViewTracker: true,
            canViewTeam: true,
            canViewWiki: true,
          },
          {
            name: "developer",
            canViewTimeline: true,
            canViewTracker: true,
            canViewTeam: false,
            canViewWiki: true,
          },
        ],
      },
    },
    select: PROJECT_FIELDS,
  });
  return NextResponse.json(project, { status: 201 });
}

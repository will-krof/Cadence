import { prisma } from "@/lib/prisma";
import { boardFilter, workspaceOwnerId } from "@/lib/api-auth";
import { memberDenied, requireViewer } from "@/lib/viewer";
import { TASK_FIELDS } from "@/lib/task-select";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

const forbidden = () =>
  NextResponse.json({ error: "Your role can't do that" }, { status: 403 });

export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId");
  if (memberDenied(viewer, projectId)) return forbidden();

  // scope=all powers the Team view, which only needs to know who works where —
  // not the tasks themselves.
  if (params.get("scope") === "all") {
    const assignments = await prisma.task.findMany({
      where: { ...boardFilter(viewer), developerId: { not: null } },
      select: { developerId: true, projectId: true },
      distinct: ["developerId", "projectId"],
    });
    return jsonResponse(request, assignments);
  }

  const tasks = await prisma.task.findMany({
    // Scoping through the project relation keeps other workspaces' tasks out
    // even when an arbitrary projectId is supplied.
    where: {
      ...boardFilter(viewer),
      ...(projectId ? { projectId } : {}),
    },
    // The assignee's profile is left out on purpose: the client already holds
    // the roster, and repeating it per task (avatars and all) dwarfed the tasks.
    select: TASK_FIELDS,
    orderBy: { order: "asc" },
  });
  return jsonResponse(request, tasks);
}

export async function POST(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title || !body.startDate || !body.endDate || !body.projectId) {
    return NextResponse.json(
      { error: "projectId, title, startDate and endDate are required" },
      { status: 400 }
    );
  }
  if (memberDenied(viewer, body.projectId)) return forbidden();

  const ownerId = workspaceOwnerId(viewer);

  const project = await prisma.project.findFirst({
    where: { id: body.projectId, userId: ownerId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // An assignee must come from the workspace's own roster.
  if (body.developerId) {
    const developer = await prisma.developer.findFirst({
      where: { id: body.developerId, userId: ownerId },
      select: { id: true },
    });
    if (!developer) {
      return NextResponse.json(
        { error: "Developer not found" },
        { status: 404 }
      );
    }
  }

  const maxOrder = await prisma.task.aggregate({
    where: { projectId: body.projectId },
    _max: { order: true },
  });

  const task = await prisma.task.create({
    data: {
      title,
      description: body.description?.trim() || null,
      link: body.link?.trim() || null,
      status: body.status || "TODO",
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      projectId: body.projectId,
      developerId: body.developerId || null,
      sprintId: body.sprintId || null,
      order: (maxOrder._max.order ?? 0) + 1,
    },
    select: TASK_FIELDS,
  });
  return NextResponse.json(task, { status: 201 });
}

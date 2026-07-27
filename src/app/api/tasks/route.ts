import { prisma } from "@/lib/prisma";
import { boardFilter, workspaceOwnerId } from "@/lib/api-auth";
import { memberDenied, requireViewer } from "@/lib/viewer";
import { TASK_FIELDS } from "@/lib/task-select";
import { parseTask } from "@/lib/task-input";
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

  const body = await request.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";

  const parsed = parseTask(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { title, startDate, endDate } = parsed.data;
  if (!projectId || !title || !startDate || !endDate) {
    return NextResponse.json(
      { error: "projectId, title, startDate and endDate are required" },
      { status: 400 }
    );
  }
  if (memberDenied(viewer, projectId)) return forbidden();

  const ownerId = workspaceOwnerId(viewer);

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: ownerId },
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

  // A task belongs to a sprint of its own project. Without this, an id from
  // somewhere else would file the work under a stranger's sprint.
  if (body.sprintId) {
    const sprint = await prisma.sprint.findFirst({
      where: { id: body.sprintId, projectId },
      select: { id: true },
    });
    if (!sprint) {
      return NextResponse.json(
        { error: "That sprint is not on this project" },
        { status: 404 }
      );
    }
  }

  const maxOrder = await prisma.task.aggregate({
    where: { projectId },
    _max: { order: true },
  });

  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      title,
      startDate,
      endDate,
      status: parsed.data.status ?? "TODO",
      projectId,
      developerId: body.developerId || null,
      sprintId: body.sprintId || null,
      order: (maxOrder._max.order ?? 0) + 1,
    },
    select: TASK_FIELDS,
  });
  return NextResponse.json(task, { status: 201 });
}

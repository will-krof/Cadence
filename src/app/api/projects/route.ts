import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(projects);
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

  const project = await prisma.project.create({
    data: {
      name,
      description: body.description?.trim() || null,
      hasTimeline,
      hasTracker,
      hasTeam,
      userId: user.id,
    },
  });
  return NextResponse.json(project, { status: 201 });
}

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const tasks = await prisma.task.findMany({
    include: { developer: true },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title || !body.startDate || !body.endDate) {
    return NextResponse.json(
      { error: "title, startDate and endDate are required" },
      { status: 400 }
    );
  }

  const maxOrder = await prisma.task.aggregate({ _max: { order: true } });

  const task = await prisma.task.create({
    data: {
      title,
      status: body.status || "TODO",
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      developerId: body.developerId || null,
      order: (maxOrder._max.order ?? 0) + 1,
    },
    include: { developer: true },
  });
  return NextResponse.json(task, { status: 201 });
}

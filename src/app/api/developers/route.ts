import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { parseDeveloper } from "@/lib/developer-input";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const developers = await prisma.developer.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(developers);
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const parsed = parseDeveloper(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const developer = await prisma.developer.create({
    data: { ...parsed.data, name: parsed.data.name!, userId: user.id },
  });
  return NextResponse.json(developer, { status: 201 });
}

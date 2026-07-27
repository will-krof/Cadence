import { prisma } from "@/lib/prisma";
import { developerScope, requireUser } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { parseDeveloper } from "@/lib/developer-input";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  // Profiles carry avatars, so this is the other response worth compressing.
  const developers = await prisma.developer.findMany({
    where: developerScope(viewer),
    orderBy: { createdAt: "asc" },
  });
  return jsonResponse(request, developers);
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

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const developers = await prisma.developer.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(developers);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const developer = await prisma.developer.create({
    data: { name, color: body.color || undefined },
  });
  return NextResponse.json(developer, { status: 201 });
}

import { prisma } from "@/lib/prisma";
import { requireUser, wikiFilter } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

/** What a page travels with. */
const WIKI_FIELDS = {
  id: true,
  projectId: true,
  title: true,
  content: true,
  order: true,
  updatedAt: true,
} as const;

/**
 * The wiki of every project the viewer may read one for. Like the roster, this
 * is one request rather than one per project: the client holds them all and
 * shows the active project's.
 */
export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const pages = await prisma.wikiPage.findMany({
    where: wikiFilter(viewer),
    select: WIKI_FIELDS,
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return jsonResponse(request, pages);
}

/** Writing is the owner's: everyone else reads what the project wrote down. */
export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const titled = boundedText(body.title, LIMITS.title);
  if ("tooLong" in titled) {
    return NextResponse.json(
      { error: "That title is too long" },
      { status: 400 }
    );
  }
  if (!titled.value) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const owned = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // A new page goes to the end of the list rather than the top: a wiki is read
  // in the order somebody arranged it in, and the page written first is usually
  // the one that should still be read first.
  const last = await prisma.wikiPage.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const page = await prisma.wikiPage.create({
    data: {
      projectId,
      title: titled.value,
      order: (last?.order ?? -1) + 1,
    },
    select: WIKI_FIELDS,
  });
  return NextResponse.json(page, { status: 201 });
}

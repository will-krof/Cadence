import { prisma } from "@/lib/prisma";
import { requireUser, wikiFilter } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { ownedProject } from "@/lib/owned";
import { badRequest, notFound } from "@/lib/responses";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { jsonResponse } from "@/lib/json-response";
import { WIKI_FIELDS, WIKI_INDEX_FIELDS } from "@/lib/wiki-select";
import { NextRequest, NextResponse } from "next/server";

/**
 * The contents of the wiki: every page the viewer may read, as titles and where
 * they sit. What is written on them arrives a page at a time, when one is
 * opened — a documented project's text dwarfs its table of contents, and most
 * of it is never read in a sitting.
 */
export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const projectId = request.nextUrl.searchParams.get("projectId");
  const pages = await prisma.wikiPage.findMany({
    where: { ...wikiFilter(viewer), ...(projectId ? { projectId } : {}) },
    select: WIKI_INDEX_FIELDS,
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
  if ("tooLong" in titled) return badRequest("That title is too long");
  if (!titled.value) return badRequest("Title is required");

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!(await ownedProject(user.id, projectId))) return notFound("Project");

  // A section of a section, as deep as the project needs — the parent only has
  // to be a page of the same project.
  let parentId: string | null = null;
  if (body.parentId) {
    const parent = await prisma.wikiPage.findFirst({
      where: { id: body.parentId, projectId },
      select: { id: true },
    });
    if (!parent) return notFound("That section is");
    parentId = parent.id;
  }

  // A new page goes to the end of its section rather than the top: a wiki is
  // read in the order somebody arranged it in.
  const last = await prisma.wikiPage.findFirst({
    where: { projectId, parentId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const page = await prisma.wikiPage.create({
    data: {
      projectId,
      parentId,
      title: titled.value,
      order: (last?.order ?? -1) + 1,
    },
    select: WIKI_FIELDS,
  });
  return NextResponse.json(page, { status: 201 });
}

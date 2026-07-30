import { prisma } from "@/lib/prisma";
import { scopedToProject, wikiFilter, workspaceOwnerId } from "@/lib/api-auth";
import {
  memberCannotReadWiki,
  memberWritesWiki,
  requireViewer,
} from "@/lib/viewer";
import { ownedProject } from "@/lib/owned";
import { badRequest, forbidden, notFound } from "@/lib/responses";
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
  // Asked about one project: the role has to open that project's wiki. Without
  // this the only thing standing between a member and another workspace's
  // contents was the filter below, and the filter was being overwritten.
  if (memberCannotReadWiki(viewer, projectId)) return forbidden();

  const pages = await prisma.wikiPage.findMany({
    where: scopedToProject(wikiFilter(viewer), projectId),
    select: WIKI_INDEX_FIELDS,
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return jsonResponse(request, pages);
}

/**
 * Writing takes the wiki in a role that opens it for editing — the owner
 * always, and whoever they said may write on it. Everyone else reads what the
 * project wrote down.
 */
export async function POST(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const titled = boundedText(body.title, LIMITS.title);
  if ("tooLong" in titled) return badRequest("That title is too long");
  if (!titled.value) return badRequest("Title is required");

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!(await ownedProject(workspaceOwnerId(viewer), projectId))) {
    return notFound("Project");
  }
  if (viewer.kind === "member" && !memberWritesWiki(viewer, projectId)) {
    return forbidden();
  }

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

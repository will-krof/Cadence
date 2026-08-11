import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { boundedText, safeColor } from "@/lib/sanitize";
import { ownedProject } from "@/lib/owned";
import { badRequest, conflict, notFound } from "@/lib/responses";
import { DEFAULT_COLUMN_COLOR, MAX_COLUMN_NAME } from "@/lib/types";
import { NextRequest, NextResponse } from "next/server";

/** More columns than this is a board nobody can read across a screen. */
const MAX_COLUMNS = 20;

/**
 * A new column on a project's tracker: what it is called, what colour it is,
 * and whether work standing in it counts as finished.
 *
 * It lands on the right-hand end of the board. Where it sits afterwards is the
 * PUT below — the order is the board's, not the order things were created in.
 */
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/columns">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  const named = boundedText(body.name, MAX_COLUMN_NAME);
  if ("tooLong" in named) {
    return badRequest(`A column is ${MAX_COLUMN_NAME} characters or fewer`);
  }
  const name = named.value;
  if (!name) return badRequest("Name is required");

  if (!(await ownedProject(user.id, id))) return notFound("Project");

  const [taken, count, last] = await Promise.all([
    prisma.projectColumn.findFirst({
      where: { projectId: id, name },
      select: { id: true },
    }),
    prisma.projectColumn.count({ where: { projectId: id } }),
    prisma.projectColumn.aggregate({
      where: { projectId: id },
      _max: { order: true },
    }),
  ]);
  if (taken) return conflict(`This board already has a “${name}” column`);
  if (count >= MAX_COLUMNS) {
    return badRequest(`A board holds ${MAX_COLUMNS} columns at most`);
  }

  const column = await prisma.projectColumn.create({
    data: {
      projectId: id,
      name,
      // A colour that isn't a colour would end up in a style attribute.
      color: safeColor(body.color) ?? DEFAULT_COLUMN_COLOR,
      isDone: body.isDone === true,
      order: (last._max.order ?? -1) + 1,
    },
  });
  return NextResponse.json(column, { status: 201 });
}

/**
 * The order the columns are drawn in, written whole: the ids of this project's
 * columns, left to right.
 *
 * One request rather than a PATCH per column — a board being rearranged is one
 * decision, and half of it landing is a board nobody asked for. Ids that aren't
 * this project's are refused rather than ignored; ones it has that the list
 * leaves out keep their place after the ones it names.
 */
export async function PUT(
  request: NextRequest,
  ctx: RouteContext<"/api/projects/[id]/columns">
) {
  const { user, response } = await requireUser();
  if (response) return response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));

  if (!Array.isArray(body.order)) return badRequest("An order is required");
  const asked: string[] = [];
  for (const raw of body.order) {
    if (typeof raw !== "string" || !raw || asked.includes(raw)) continue;
    asked.push(raw);
  }

  if (!(await ownedProject(user.id, id))) return notFound("Project");

  const mine = await prisma.projectColumn.findMany({
    where: { projectId: id },
    select: { id: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const known = new Set(mine.map((c) => c.id));
  if (asked.some((columnId) => !known.has(columnId))) return notFound("Column");

  // Whatever the list didn't mention keeps its own order, after the rest.
  const ordered = [...asked, ...mine.map((c) => c.id).filter((c) => !asked.includes(c))];

  await prisma.$transaction(
    ordered.map((columnId, order) =>
      prisma.projectColumn.update({ where: { id: columnId }, data: { order } })
    )
  );

  const columns = await prisma.projectColumn.findMany({
    where: { projectId: id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(columns);
}

import { prisma } from "@/lib/prisma";
import { boardFilter } from "@/lib/api-auth";
import { requireViewer } from "@/lib/viewer";
import { ownComment } from "@/lib/task-comments";
import { done, notFound } from "@/lib/responses";
import { NextRequest } from "next/server";

/**
 * Taking a comment back. Your own only — or anybody's, if the workspace is
 * yours. A comment somebody else wrote answers 404 rather than 403, the same as
 * everything else out of reach: a refusal shouldn't map what exists.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: RouteContext<"/api/tasks/[id]/comments/[commentId]">
) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const { id, commentId } = await ctx.params;

  // Scoped through the task, so a comment id alone reaches nothing: the board
  // has to be one this viewer can open before the comment is theirs to consider.
  const comment = await prisma.taskComment.findFirst({
    where: { id: commentId, taskId: id, task: boardFilter(viewer) },
    select: { id: true, byDeveloperId: true },
  });
  if (!comment || !ownComment(viewer, comment.byDeveloperId)) {
    return notFound("Comment");
  }

  await prisma.taskComment.delete({ where: { id: comment.id } });
  return done();
}

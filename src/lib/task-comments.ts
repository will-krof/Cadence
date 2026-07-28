import { Viewer } from "@/lib/viewer";

/** Long enough for a paragraph of thinking, short of a wiki page. */
export const MAX_COMMENT_LENGTH = 4000;

/** A comment as it comes out of the database. */
export interface CommentRow {
  id: string;
  body: string;
  by: string;
  byDeveloperId: string | null;
  createdAt: Date;
}

/** The columns every comment endpoint reads, so none of them drift. */
export const COMMENT_FIELDS = {
  id: true,
  body: true,
  by: true,
  byDeveloperId: true,
  createdAt: true,
} as const;

/**
 * Whose comment this is — which is to say, who may take it back. A team member
 * owns the ones they wrote; the owner of the workspace owns all of them, theirs
 * being the ones with nobody attached.
 */
export function ownComment(viewer: Viewer, byDeveloperId: string | null) {
  return viewer.kind === "owner" || viewer.developerId === byDeveloperId;
}

/**
 * The row as it travels. "May this reader take it back" is answered here rather
 * than left to the browser to work out — it is the server's question, and the
 * DELETE route asks it again anyway.
 */
export function commentPayload(viewer: Viewer, comment: CommentRow) {
  return {
    id: comment.id,
    body: comment.body,
    by: comment.by,
    mine: ownComment(viewer, comment.byDeveloperId),
    createdAt: comment.createdAt,
  };
}

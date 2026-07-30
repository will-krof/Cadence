import { Viewer } from "@/lib/viewer";
import { LIMITS } from "@/lib/sanitize";

/**
 * Whose notes these are. A note belongs to a person, not to a workspace: the
 * account that owns the workspace has its own, and so does every member who
 * signs in. Both halves of the app ask the same question through this, so
 * there is one answer to "which notes are mine" and no route can widen it.
 */
export function noteOwner(viewer: Viewer) {
  return viewer.kind === "owner"
    ? { userId: viewer.user.id, developerId: null }
    : { userId: null, developerId: viewer.developerId };
}

/**
 * The title a note goes by: its first line with any heading marks taken off.
 *
 * Nobody names a note. Apple's do it this way and it is right — you write, and
 * what you wrote first is what the note is called — so the title is worked out
 * on the way in and kept as a column, which is what lets a list of notes be a
 * list rather than every note you have.
 */
export function titleOf(content: string) {
  for (const line of content.split("\n")) {
    const stripped = line
      .replace(/^\s*#{1,6}\s*/, "")
      .replace(/^\s*[-*>]\s*/, "")
      .replace(/[*_`~]/g, "")
      .trim();
    if (stripped) return stripped.slice(0, LIMITS.title);
  }
  return "";
}

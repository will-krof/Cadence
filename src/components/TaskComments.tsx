"use client";

import { useEffect, useState } from "react";
import { TaskComment } from "@/lib/types";
import { CloseIcon } from "@/components/ui";

/**
 * What people have said about a task, oldest first, and the box to add to it.
 *
 * It sits under the history because the two answer neighbouring questions — that
 * one is what happened to the work, this one is what the people around it made
 * of it — and, like the history, it is fetched when the task is opened rather
 * than carried on the board.
 *
 * Anybody who can open the board can write here, whether or not their role lets
 * them move the work: saying something about a task doesn't change it. The
 * server holds to the same line, and answers whose comment each one is.
 */
export function TaskComments({ taskId }: { taskId: string }) {
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/comments`);
        if (!res.ok) throw new Error("failed");
        const data: TaskComment[] = await res.json();
        if (!cancelled) setComments(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "That comment wasn’t saved");
      setComments((prev) => [...(prev ?? []), data as TaskComment]);
      setDraft("");
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That comment wasn’t saved");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    // Gone from the list first, put back if the server disagrees — a comment is
    // small enough that waiting on a round trip to see it go reads as a stall.
    const before = comments ?? [];
    setComments(before.filter((c) => c.id !== id));
    const res = await fetch(`/api/tasks/${taskId}/comments/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setComments(before);
      setProblem("That comment wasn’t deleted");
    }
  }

  // Nothing to say and no way to say it: a failed fetch leaves the section out
  // rather than showing a box that won't post.
  if (failed) return null;

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
      <h3 className="field-label">
        Comments
        {comments && comments.length > 0 && (
          <span className="ml-1.5 text-[var(--ink-muted)]">
            {comments.length}
          </span>
        )}
      </h3>

      {comments == null ? (
        <p className="text-[0.75rem] text-[var(--ink-muted)]">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-[0.75rem] text-[var(--ink-muted)]">
          Nothing said about this yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="flex flex-col gap-0.5 rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--plane)] px-2.5 py-1.5"
            >
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[0.75rem] font-medium">
                  {comment.by}
                </span>
                <span className="shrink-0 tabular-nums text-[0.6875rem] text-[var(--ink-muted)]">
                  {when(comment.createdAt)}
                </span>
                {comment.mine && (
                  <button
                    type="button"
                    onClick={() => remove(comment.id)}
                    className="shrink-0 rounded p-0.5 text-[var(--ink-muted)] transition hover:text-[var(--danger)]"
                    aria-label={`Delete comment by ${comment.by}`}
                    title="Delete this comment"
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
              {/* Written as typed: line breaks are part of what somebody said. */}
              <p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-relaxed">
                {comment.body}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter inside a form full of other fields would submit the task, so
            // it makes a new line here; the modifier posts, as everywhere else.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          className="input min-h-16 min-w-0 flex-1 resize-y leading-relaxed"
          placeholder="Say something about this task…"
          aria-label="New comment"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !draft.trim()}
          className="btn-secondary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Posting…" : "Post"}
        </button>
      </div>

      {problem && (
        <p className="text-[0.6875rem] text-[var(--danger)]">{problem}</p>
      )}
    </section>
  );
}

/** A day and a time, the same reading the history gives its lines. */
function when(at: string) {
  const date = new Date(at);
  return `${date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}, ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

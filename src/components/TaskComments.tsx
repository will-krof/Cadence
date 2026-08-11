"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TaskComment } from "@/lib/types";
import { CloseIcon, Section } from "@/components/ui";

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

  // The list reads oldest first, and only so much of it is on screen at once,
  // so the end is the part worth landing on: the newest thing said, and the box
  // to answer it. Held to whenever the list grows — arriving, and posting.
  const listRef = useRef<HTMLOListElement>(null);
  const count = comments?.length ?? 0;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

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
    <Section title="Comments" count={comments?.length || undefined}>
      {comments == null ? (
        <p className="text-[0.75rem] text-[var(--ink-muted)]">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-[0.75rem] text-[var(--ink-muted)]">
          Nothing said about this yet.
        </p>
      ) : (
        /* A long conversation scrolls in its own right rather than pushing the
           rest of the task off the screen — the box to reply in stays put under
           it, which is the thing somebody scrolled down here to reach. */
        <ol
          ref={listRef}
          className="thin-scroll flex max-h-56 flex-col gap-2 overflow-y-auto pr-0.5"
        >
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="group/comment flex min-w-0 gap-2"
            >
              {/* Who said it, as an initial: a name at the head of every line
                  is the same name three times over in a short thread. */}
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--plane)] text-[0.625rem] font-semibold uppercase text-[var(--ink-secondary)]"
                aria-hidden="true"
              >
                {comment.by.trim().charAt(0)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 truncate text-[0.75rem] font-medium">
                  {comment.by}
                </span>
                <span
                  className="shrink-0 tabular-nums text-[0.6875rem] text-[var(--ink-muted)]"
                  title={when(comment.createdAt)}
                >
                  {shortWhen(comment.createdAt)}
                </span>
                <span className="flex-1" />
                {comment.mine && (
                  <button
                    type="button"
                    onClick={() => remove(comment.id)}
                    className="shrink-0 rounded p-0.5 text-[var(--ink-muted)] opacity-0 transition hover:text-[var(--danger)] focus-visible:opacity-100 group-hover/comment:opacity-100"
                    aria-label={`Delete comment by ${comment.by}`}
                    title="Delete this comment"
                  >
                    <CloseIcon />
                  </button>
                )}
              </div>
              {/* Written as typed: line breaks are part of what somebody said. */}
              <p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
                {comment.body}
              </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* One line to begin with, growing as it is written into: a box the
          height of a paragraph, sitting empty under every task, was the largest
          thing on a card that is mostly for reading. */}
      <div className="mt-0.5 flex items-end gap-2">
        <textarea
          value={draft}
          rows={1}
          onChange={(e) => {
            setDraft(e.target.value);
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            // Enter inside a form full of other fields would submit the task, so
            // it makes a new line here; the modifier posts, as everywhere else.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          className="input min-w-0 flex-1 resize-none overflow-hidden leading-relaxed"
          placeholder="Say something…"
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
    </Section>
  );
}

/**
 * When it was said, as short as it can be and still be clear: the time alone
 * for today, a day and a month for this year, the year as well for anything
 * older. The whole date is the tooltip, as in the history.
 */
function shortWhen(at: string) {
  const date = new Date(at);
  const now = new Date();
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return time;
  return `${date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  })}, ${time}`;
}

/** A day and a time in full, for the tooltip on a shortened one. */
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

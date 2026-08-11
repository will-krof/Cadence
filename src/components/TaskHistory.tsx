"use client";

import { useEffect, useState } from "react";
import {
  ProjectColumn,
  TaskEvent,
  UNSORTED_COLOR,
  columnMeta,
} from "@/lib/types";
import { useBoard } from "@/components/BoardProvider";
import { Section } from "@/components/ui";

/**
 * What has happened to a task, newest first: every column it was moved to, by
 * whom, and when.
 *
 * Each line carries the name the column had at the time, so a history keeps
 * reading after a column is renamed or deleted — the same bargain it already
 * makes with who moved it. The colour is looked up from the board where the
 * column still exists, and is a plain grey where it doesn't.
 *
 * Newest first, and only the last few: a task worked on for a month has thirty
 * of these, and the answer to "what happened to this" is nearly always the last
 * thing that did. The rest is one press away.
 *
 * It is fetched when the task is opened rather than carried on the board: a
 * board draws hundreds of tasks and reads the history of none of them.
 */

/** Lines shown before the list folds. Four is a move and the three before it. */
const SHOWN = 4;

export function TaskHistory({ taskId }: { taskId: string }) {
  const { columns } = useBoard();
  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}/history`);
        if (!res.ok) throw new Error("failed");
        const data: TaskEvent[] = await res.json();
        if (!cancelled) setEvents(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  if (failed || (events && events.length === 0)) return null;

  // Newest first: the server writes them oldest first, which is the order they
  // happened in, and the reverse of the order anybody asks about them in.
  const newest = events ? [...events].reverse() : [];
  const shown = all ? newest : newest.slice(0, SHOWN);
  const hidden = newest.length - shown.length;

  return (
    <Section title="History" count={events?.length}>
      {events == null ? (
        <p className="text-[0.75rem] text-[var(--ink-muted)]">Loading…</p>
      ) : (
        <>
          {/* A rail down the left, so a run of moves reads as one thing that
              happened to one task rather than as four separate lines. */}
          <ol className="flex flex-col border-l border-[var(--hairline)] pl-3">
            {shown.map((event) => (
              <li
                key={event.id}
                className="relative flex flex-wrap items-baseline gap-x-2 py-[0.1875rem] text-[0.75rem]"
              >
                <span
                  className="absolute -left-[1.0625rem] top-[0.4375rem] h-1.5 w-1.5 rounded-full ring-2 ring-[var(--surface-raised)]"
                  style={{ background: colorOf(columns, event.columnId) }}
                  aria-hidden="true"
                />
                <span className="font-medium">
                  {event.fromName ? (
                    <>
                      {event.fromName}{" "}
                      <span
                        className="text-[var(--ink-muted)]"
                        aria-hidden="true"
                      >
                        →
                      </span>{" "}
                      {event.columnName}
                    </>
                  ) : (
                    <>Created in {event.columnName}</>
                  )}
                </span>
                <span
                  className="tabular-nums text-[var(--ink-muted)]"
                  title={full(event.at)}
                >
                  {when(event.at)}
                </span>
                {event.by && (
                  <span className="truncate text-[var(--ink-muted)]">
                    {event.by}
                  </span>
                )}
              </li>
            ))}
          </ol>

          {(hidden > 0 || all) && newest.length > SHOWN && (
            <button
              type="button"
              onClick={() => setAll((was) => !was)}
              className="self-start text-[0.6875rem] text-[var(--accent)] hover:underline"
            >
              {all ? "Show less" : `Show ${hidden} earlier`}
            </button>
          )}
        </>
      )}
    </Section>
  );
}

/** The column's colour where it still exists, and a plain grey where it doesn't. */
function colorOf(columns: ProjectColumn[], columnId: string | null) {
  return columnMeta(columns, columnId)?.color ?? UNSORTED_COLOR;
}

/**
 * When it happened, as short as it can be said and still be unambiguous: the
 * time on its own for today, a day and a month for this year, and the year as
 * well for anything older. The whole date is the tooltip.
 */
function when(at: string) {
  const date = new Date(at);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (sameDay) return time;
  const day = date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  return `${day}, ${time}`;
}

/** The whole of it, for the tooltip on a shortened one. */
function full(at: string) {
  const date = new Date(at);
  return `${date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })}, ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

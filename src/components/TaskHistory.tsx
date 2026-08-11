"use client";

import { useEffect, useState } from "react";
import {
  ProjectColumn,
  TaskEvent,
  UNSORTED_COLOR,
  columnMeta,
} from "@/lib/types";
import { useBoard } from "@/components/BoardProvider";

/**
 * What has happened to a task, oldest first: when it was written down, and
 * every column it was moved to since, by whom.
 *
 * Each line carries the name the column had at the time, so a history keeps
 * reading after a column is renamed or deleted — the same bargain it already
 * makes with who moved it. The colour is looked up from the board where the
 * column still exists, and is a plain grey where it doesn't.
 *
 * It is fetched when the task is opened rather than carried on the board: a
 * board draws hundreds of tasks and reads the history of none of them.
 */
export function TaskHistory({ taskId }: { taskId: string }) {
  const { columns } = useBoard();
  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  const [failed, setFailed] = useState(false);

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

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
      <h3 className="field-label">History</h3>
      {events == null ? (
        <p className="text-[0.75rem] text-[var(--ink-muted)]">Loading…</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {events.map((event) => {
            const color = colorOf(columns, event.columnId);
            return (
              <li
                key={event.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.75rem]"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 self-center rounded-full"
                  style={{ background: color }}
                  aria-hidden="true"
                />
                <span className="font-medium">
                  {event.fromName ? (
                    <>
                      {event.fromName} → {event.columnName}
                    </>
                  ) : (
                    <>Created in {event.columnName}</>
                  )}
                </span>
                <span className="tabular-nums text-[var(--ink-muted)]">
                  {when(event.at)}
                </span>
                {event.by && (
                  <span className="text-[var(--ink-muted)]">· {event.by}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The column's colour where it still exists, and a plain grey where it doesn't. */
function colorOf(columns: ProjectColumn[], columnId: string | null) {
  return columnMeta(columns, columnId)?.color ?? UNSORTED_COLOR;
}

/** A day and a time, because two moves in one day is the usual case. */
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

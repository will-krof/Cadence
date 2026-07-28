"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { CloseIcon, Disclosure, Field } from "@/components/ui";
import { addDays, formatRange, toISODate } from "@/lib/dates";
import { Sprint } from "@/lib/types";

/** What a sprint's row may change about it. */
interface SprintPatch {
  number?: number;
  startDate?: string;
  endDate?: string;
  archived?: boolean;
}

/**
 * The project's sprints, in order. Each is its own board, so planning one ahead
 * gives an empty board waiting for the work that will go in it.
 */
export function SprintsSection({
  sprints,
  tasks,
  canEdit,
  onCreate,
  onUpdate,
  onDelete,
}: {
  sprints: Sprint[];
  tasks: { sprintId: string | null }[];
  canEdit: boolean;
  onCreate: (input: {
    number?: number;
    startDate: string;
    endDate: string;
  }) => Promise<Sprint | null>;
  onUpdate: (id: string, patch: SprintPatch) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const { confirm } = useFeedback();
  const [adding, setAdding] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      if (!task.sprintId) continue;
      map.set(task.sprintId, (map.get(task.sprintId) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const unplanned = tasks.filter((t) => !t.sprintId).length;

  const live = sprints.filter((s) => !s.archived);
  const archived = sprints.filter((s) => s.archived);

  // A new sprint follows the last one: the next number, the fortnight after.
  const last = sprints[sprints.length - 1];
  const suggested = {
    number: (last?.number ?? 0) + 1,
    startDate: last
      ? toISODate(addDays(new Date(last.endDate), 1))
      : toISODate(new Date()),
    endDate: last
      ? toISODate(addDays(new Date(last.endDate), 14))
      : toISODate(addDays(new Date(), 13)),
  };

  async function remove(sprint: Sprint) {
    const held = counts.get(sprint.id) ?? 0;
    const ok = await confirm({
      title: `Delete sprint ${sprint.number}?`,
      body: held
        ? `Its ${held} task${held === 1 ? "" : "s"} won't be deleted — they become unplanned, and you can move them into another sprint.`
        : "This sprint has no tasks in it.",
      confirmLabel: "Delete sprint",
      destructive: true,
    });
    if (ok) await onDelete(sprint.id);
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-[0.8125rem] font-semibold tracking-tight">
            Sprints
          </h3>
          <p className="text-[0.75rem] text-[var(--ink-muted)]">
            Each sprint is its own board. Plan them ahead; the timeline and
            tracker switch between them.
          </p>
        </div>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)} className="btn-secondary">
            Plan a sprint
          </button>
        )}
      </div>

      {sprints.length === 0 && !adding && (
        <p className="text-[0.8125rem] text-[var(--ink-muted)]">
          No sprints yet.
        </p>
      )}

      {live.length === 0 && archived.length > 0 && !adding && (
        <p className="text-[0.8125rem] text-[var(--ink-muted)]">
          Every sprint is archived.
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {live.map((sprint) => (
          <SprintRow
            key={sprint.id}
            sprint={sprint}
            taskCount={counts.get(sprint.id) ?? 0}
            canEdit={canEdit}
            onUpdate={onUpdate}
            onDelete={() => remove(sprint)}
          />
        ))}
      </ul>

      {/* Archived sprints are out of the way but not gone: their work is still
          on the boards, and they can be brought back. */}
      {archived.length > 0 && (
        <Disclosure
          label="Archived"
          count={archived.length}
          defaultOpen={false}
        >
          <ul className="flex flex-col gap-1.5 pt-1.5">
            {archived.map((sprint) => (
              <SprintRow
                key={sprint.id}
                sprint={sprint}
                taskCount={counts.get(sprint.id) ?? 0}
                canEdit={canEdit}
                onUpdate={onUpdate}
                onDelete={() => remove(sprint)}
              />
            ))}
          </ul>
        </Disclosure>
      )}

      {adding && (
        <SprintForm
          initial={suggested}
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            const created = await onCreate(values);
            if (created) setAdding(false);
          }}
        />
      )}

      {unplanned > 0 && (
        <p className="text-[0.75rem] text-[var(--ink-muted)]">
          {unplanned} task{unplanned === 1 ? "" : "s"} not in any sprint — the
          boards list them under “Unplanned”.
        </p>
      )}
    </section>
  );
}

function SprintRow({
  sprint,
  taskCount,
  canEdit,
  onUpdate,
  onDelete,
}: {
  sprint: Sprint;
  taskCount: number;
  canEdit: boolean;
  onUpdate: (id: string, patch: SprintPatch) => void;
  onDelete: () => void;
}) {
  const today = toISODate(new Date());
  const running =
    toISODate(new Date(sprint.startDate)) <= today &&
    toISODate(new Date(sprint.endDate)) >= today;

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border border-[var(--hairline)] px-3 py-2 ${
        sprint.archived ? "opacity-60" : ""
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="text-[0.8125rem] font-medium">
          Sprint {sprint.number}
        </span>
        {running && !sprint.archived && (
          <span className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.5625rem] uppercase tracking-wide text-[var(--accent)]">
            Running
          </span>
        )}
        {sprint.archived && (
          <span className="rounded-full bg-[var(--gridline)] px-2 py-0.5 text-[0.5625rem] uppercase tracking-wide text-[var(--ink-secondary)]">
            Archived
          </span>
        )}
      </span>

      {canEdit ? (
        <span className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={toISODate(new Date(sprint.startDate))}
            onChange={(e) => onUpdate(sprint.id, { startDate: e.target.value })}
            className="input w-[9.5rem]"
            aria-label={`Sprint ${sprint.number} starts`}
          />
          <input
            type="date"
            value={toISODate(new Date(sprint.endDate))}
            onChange={(e) => onUpdate(sprint.id, { endDate: e.target.value })}
            className="input w-[9.5rem]"
            aria-label={`Sprint ${sprint.number} ends`}
          />
        </span>
      ) : (
        <span className="text-[0.8125rem] text-[var(--ink-secondary)]">
          {formatRange(sprint.startDate, sprint.endDate)}
        </span>
      )}

      <span className="ml-auto text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
        {taskCount} task{taskCount === 1 ? "" : "s"}
      </span>

      {canEdit && (
        <>
          <button
            onClick={() =>
              onUpdate(sprint.id, { archived: !sprint.archived })
            }
            className="btn-secondary !px-2 !py-1"
            title={
              sprint.archived
                ? "Bring this sprint back into the run"
                : "Put this sprint away — its tasks stay where they are"
            }
          >
            {sprint.archived ? "Restore" : "Archive"}
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-[var(--ink-muted)] transition hover:text-[var(--danger)]"
            aria-label={`Delete sprint ${sprint.number}`}
            title="Delete sprint"
          >
            <CloseIcon />
          </button>
        </>
      )}
    </li>
  );
}

function SprintForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: { number: number; startDate: string; endDate: string };
  onCancel: () => void;
  onSubmit: (values: {
    number: number;
    startDate: string;
    endDate: string;
  }) => Promise<void>;
}) {
  const [number, setNumber] = useState(String(initial.number));
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [pending, setPending] = useState(false);

  const valid =
    Number(number) >= 1 && startDate !== "" && endDate !== "" && endDate >= startDate;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setPending(true);
    await onSubmit({ number: Math.floor(Number(number)), startDate, endDate });
    setPending(false);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-[var(--radius)] border border-[var(--accent)] bg-[var(--accent-wash)] p-3"
    >
      <Field label="Number" className="w-24">
        <input
          type="number"
          min={1}
          step={1}
          autoFocus
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Starts" className="w-[9.5rem]">
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Ends" className="w-[9.5rem]">
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="input"
        />
      </Field>
      <div className="flex items-center gap-2 pb-0.5">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || !valid}
        >
          {pending ? "Creating…" : "Create sprint"}
        </button>
      </div>
      {endDate < startDate && (
        <p className="w-full text-[0.6875rem] text-[var(--danger)]">
          A sprint can’t end before it starts.
        </p>
      )}
    </form>
  );
}

interface SprintPatch {
  number?: number;
  startDate?: string;
  endDate?: string;
  /** Archiving puts a sprint away without touching the work in it. */
  archived?: boolean;
}

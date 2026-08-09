"use client";

import { useEffect, useMemo, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { useFeedback } from "@/components/Feedback";
import {
  PRIORITY_OPTIONS,
  Project,
  STATUS_OPTIONS,
  statusMeta,
  TaskStatus,
} from "@/lib/types";
import { formatEstimate, HOURS_PER_DAY } from "@/lib/estimate";
import type { ProjectReport } from "@/lib/reports";
import {
  BarChart,
  CompositionBar,
  FlowChart,
  Panel,
  RowBars,
  StatTile,
  TableView,
  formatCount,
} from "@/components/reports/charts";

/**
 * A project's own numbers.
 *
 * What a project manager actually asks, in the order they ask it: where does
 * the work stand, is anything stuck, how has it moved, how fast does it move,
 * how long does a job take, and who is carrying what.
 *
 * Nothing here is stored and nothing here is editable — it is a reading of the
 * boards, computed on the server from the tasks and their history each time it
 * is opened. That is why it needs no permission of its own: whoever may open a
 * board may read what the board adds up to.
 */
export function ReportsView({ project }: { project: Project }) {
  const { developers, activeProject } = useBoard();
  const { notify } = useFeedback();
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(null);
      try {
        const res = await fetch(`/api/projects/${project.id}/reports`);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) {
          setFailed("Could not work out this project's numbers.");
          notify("error", "Could not load the reports.");
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, notify]);

  const people = useMemo(
    () => new Map(developers.map((d) => [d.id, d])),
    [developers]
  );
  const tags = useMemo(
    () => new Map((activeProject?.tags ?? []).map((t) => [t.id, t])),
    [activeProject]
  );

  if (loading) {
    return (
      <p className="p-6 text-[0.8125rem] text-[var(--ink-muted)]">
        Working out the numbers…
      </p>
    );
  }
  if (failed || !report) {
    return (
      <p role="alert" className="p-6 text-[0.8125rem] text-[var(--danger)]">
        {failed ?? "No numbers to show."}
      </p>
    );
  }

  const { totals } = report;
  if (totals.tasks === 0) {
    return (
      <div className="p-6">
        <p className="text-[0.8125rem] text-[var(--ink-secondary)]">
          Nothing to report yet — this project has no tasks. Every chart here is
          worked out from the work itself, so they fill in as it arrives.
        </p>
      </div>
    );
  }

  const donePercent = Math.round((totals.done / totals.tasks) * 100);
  const open = totals.tasks - totals.done;

  const statusSlices = report.byStatus.map((row) => ({
    key: row.status,
    label: statusMeta(row.status as TaskStatus).label,
    value: row.count,
    color: statusMeta(row.status as TaskStatus).color,
  }));

  const prioritySlices = report.byPriority
    .map((row) => {
      const meta =
        PRIORITY_OPTIONS.find((p) => p.value === row.priority) ??
        PRIORITY_OPTIONS[1];
      return {
        key: row.priority,
        label: meta.label,
        value: row.count,
        color: meta.color,
      };
    })
    .filter((s) => s.value > 0);

  const flowSeries = report.byStatus.map((row) => ({
    key: row.status,
    label: statusMeta(row.status as TaskStatus).label,
    color: statusMeta(row.status as TaskStatus).color,
  }));

  const weeks = report.throughput.map((w) => ({
    key: w.week,
    label: w.week.slice(5).replace("-", "/"),
    value: w.count,
    detail: `Week of ${w.week}: ${w.count} finished`,
  }));
  const weeklyAverage =
    weeks.length === 0
      ? 0
      : Math.round(
          (weeks.reduce((sum, w) => sum + w.value, 0) / weeks.length) * 10
        ) / 10;

  const load = report.byPerson
    .map((row) => {
      const person = people.get(row.developerId);
      return {
        key: row.developerId,
        label: person?.name ?? "Somebody who has left",
        done: row.done,
        open: row.total - row.done,
        color: person?.color ?? "#898781",
        detail: `${person?.name ?? "Unknown"}: ${row.done} done of ${row.total}${
          row.estimateMinutes > 0
            ? `, ${formatEstimate(row.estimateMinutes)} estimated`
            : ""
        }`,
      };
    })
    .slice(0, 12);

  const tagSlices = report.byTag
    .map((row) => {
      const tag = tags.get(row.tagId);
      return tag
        ? { key: row.tagId, label: tag.name, value: row.count, color: tag.color }
        : null;
    })
    .filter((s): s is NonNullable<typeof s> => s != null)
    .slice(0, 8);

  const runs = report.velocity.filter((s) => s.total > 0);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <header>
        <h2 className="text-[0.9375rem] font-semibold tracking-tight">
          {project.name} — reports
        </h2>
        <p className="mt-0.5 text-[0.75rem] text-[var(--ink-muted)]">
          Worked out from the tasks and their history, every time this is
          opened. Nothing here is stored, and nothing here can be edited.
        </p>
      </header>

      {/* The headline figures. Not charts: one number each, and the two that
          are problems when they aren't zero say so in the danger colour with
          the word beside them. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          label="Tasks"
          value={formatCount(totals.tasks)}
          hint={`${open} still open`}
        />
        <StatTile
          label="Done"
          value={`${donePercent}%`}
          hint={`${totals.done} of ${totals.tasks}`}
          tone={donePercent === 100 ? "good" : "plain"}
        />
        <StatTile
          label="In progress"
          value={formatCount(totals.inProgress)}
          hint="Work under way now"
        />
        <StatTile
          label="Blocked"
          value={formatCount(totals.blocked)}
          hint="Waiting on unfinished work"
          tone="alert"
        />
        <StatTile
          label="Overdue"
          value={formatCount(totals.overdue)}
          hint="Past their end date, not done"
          tone="alert"
        />
        <StatTile
          label="Estimated"
          value={
            totals.estimateMinutes > 0
              ? formatEstimate(totals.estimateMinutes - totals.estimateDoneMinutes) ||
                "0h"
              : "—"
          }
          hint={
            totals.estimateMinutes > 0
              ? `left of ${formatEstimate(totals.estimateMinutes)} · a day is ${HOURS_PER_DAY}h`
              : `no task has been sized`
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel
          title="How the work has flowed"
          hint={`Every task by status, day by day, over the last ${report.windowDays} days. The top edge is everything the project holds — it rising is scope arriving. A band that widens instead of travelling is where work is piling up.`}
        >
          <FlowChart days={report.flow} series={flowSeries} />
          <TableView
            caption="Tasks by status, by day"
            columns={["Day", ...flowSeries.map((s) => s.label), "Total"]}
            rows={report.flow
              .slice()
              .reverse()
              .map((day) => [
                day.day,
                ...flowSeries.map((s) => day.counts[s.key] ?? 0),
                day.total,
              ])}
          />
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title="Where it stands"
            hint="The same statuses the boards use, in the same colours."
          >
            <CompositionBar slices={statusSlices} />
            <TableView
              caption="Tasks by status"
              columns={["Status", "Tasks", "Share"]}
              rows={statusSlices.map((s) => [
                s.label,
                s.value,
                `${Math.round((s.value / totals.tasks) * 100)}%`,
              ])}
            />
          </Panel>

          {prioritySlices.length > 0 && (
            <Panel
              title="What it is worth doing first"
              hint="Urgent work that isn't moving is the thing this catches."
            >
              <CompositionBar slices={prioritySlices} height={26} />
            </Panel>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="How much gets finished"
          hint="Tasks completed each week. The line is the average across the weeks shown — the number a plan can honestly be built on."
        >
          <BarChart
            bars={weeks}
            everyNthLabel={2}
            reference={{ value: weeklyAverage, label: `avg ${weeklyAverage}` }}
          />
          <TableView
            caption="Tasks finished per week"
            columns={["Week beginning", "Finished"]}
            rows={weeks.map((w) => [w.key, w.value])}
          />
        </Panel>

        <Panel
          title="How long a task takes"
          hint={
            report.cycleTime.sample > 0
              ? `From the day work started on it to the day it was done, across ${report.cycleTime.sample} finished ${
                  report.cycleTime.sample === 1 ? "task" : "tasks"
                }.`
              : "Nothing has been finished yet, so there is nothing to time."
          }
        >
          {report.cycleTime.sample > 0 ? (
            <>
              <div className="mb-1 flex flex-wrap gap-x-5 gap-y-1 text-[0.75rem]">
                <span>
                  <span className="text-[var(--ink-muted)]">Median </span>
                  <span className="font-medium tabular-nums">
                    {report.cycleTime.median} d
                  </span>
                </span>
                <span>
                  <span className="text-[var(--ink-muted)]">Average </span>
                  <span className="font-medium tabular-nums">
                    {report.cycleTime.average} d
                  </span>
                </span>
                <span>
                  <span className="text-[var(--ink-muted)]">9 in 10 within </span>
                  <span className="font-medium tabular-nums">
                    {report.cycleTime.p90} d
                  </span>
                </span>
              </div>
              <BarChart
                bars={report.cycleTime.buckets.map((b) => ({
                  key: b.label,
                  label: b.label.replace(" days", "d").replace(" day", "d"),
                  value: b.count,
                  detail: `${b.count} finished in ${b.label}`,
                }))}
                height={130}
              />
              <TableView
                caption="Finished tasks by how long they took"
                columns={["Took", "Tasks"]}
                rows={report.cycleTime.buckets.map((b) => [b.label, b.count])}
              />
            </>
          ) : (
            <p className="text-[0.75rem] text-[var(--ink-muted)]">
              This fills in as work is finished.
            </p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Who is carrying what"
          hint="Tasks per person, finished and still open. A task shared by four counts for each of them — this is load, not a tally of the project."
        >
          <RowBars rows={load} />
          <TableView
            caption="Tasks per person"
            columns={["Person", "Done", "Open", "Total"]}
            rows={report.byPerson.map((row) => [
              people.get(row.developerId)?.name ?? "Unknown",
              row.done,
              row.total - row.done,
              row.total,
            ])}
          />
        </Panel>

        {runs.length > 0 ? (
          <Panel
            title="What each sprint finished"
            hint="Velocity: the run of these is what says how much the next one can hold."
          >
            <BarChart
              bars={runs.map((s) => ({
                key: s.id,
                label: `#${s.number}`,
                value: s.done,
                detail: `Sprint ${s.number}: ${s.done} of ${s.total} finished${
                  s.estimateMinutes > 0
                    ? ` · ${formatEstimate(s.estimateMinutes)} estimated`
                    : ""
                }`,
              }))}
            />
            <TableView
              caption="Tasks finished per sprint"
              columns={["Sprint", "Finished", "Planned"]}
              rows={runs.map((s) => [`#${s.number}`, s.done, s.total])}
            />
          </Panel>
        ) : (
          tagSlices.length > 0 && (
            <Panel
              title="What the work is about"
              hint="The project's own labels, in its own colours."
            >
              <CompositionBar slices={tagSlices} height={26} />
            </Panel>
          )
        )}
      </div>

      {/* The things a plan is missing, said plainly rather than drawn. Each is a
          count of work the charts above can't say anything useful about. */}
      <Panel
        title="What the numbers can’t see"
        hint="Work the charts above have to leave out, and why."
      >
        <ul className="flex flex-col gap-1.5 text-[0.75rem] text-[var(--ink-secondary)]">
          <Gap
            count={totals.undated}
            of={totals.tasks}
            missing="no start or end date"
            why="the timeline can draw no bar for them"
            whenNone="Every task has been placed in time."
          />
          <Gap
            count={totals.unassigned}
            of={totals.tasks}
            missing="nobody on them"
            why="they count for no one in the load above"
            whenNone="Every task has somebody on it."
          />
          <Gap
            count={totals.tasks - totals.sized}
            of={totals.tasks}
            missing="no estimate"
            why="what is left can only be counted in tasks, not in hours"
            whenNone="Every task has been sized."
          />
        </ul>
      </Panel>
    </div>
  );
}

/**
 * One thing the report can't answer, and how much of the project it covers.
 *
 * Said as a sentence rather than assembled from fragments: a report that
 * reads "20 of 78 have not placed in time" has lost the reader's trust before
 * they get to the number.
 */
function Gap({
  count,
  of,
  missing,
  why,
  whenNone,
}: {
  count: number;
  of: number;
  /** What those tasks are without, as it follows "have …". */
  missing: string;
  /** What that costs the charts above. */
  why: string;
  /** The whole sentence for the happy case, where there is nothing missing. */
  whenNone: string;
}) {
  if (count === 0) {
    return (
      <li className="flex gap-2">
        <span aria-hidden="true" style={{ color: "#0ca30c" }}>
          ✓
        </span>
        <span>{whenNone}</span>
      </li>
    );
  }
  return (
    <li className="flex gap-2">
      <span aria-hidden="true" className="text-[var(--ink-muted)]">
        •
      </span>
      <span>
        <span className="font-medium tabular-nums">{count}</span> of {of} have{" "}
        {missing} — {why}.
      </span>
    </li>
  );
}

/** The statuses, as the charts stack them, for anything that needs the order. */
export const REPORT_STATUS_ORDER = STATUS_OPTIONS.map((s) => s.value);

"use client";

import { useId, useState } from "react";

/**
 * The marks a report is drawn with. Hand-written SVG rather than a charting
 * library: this app ships no third-party front-end code at all, its content
 * security policy allows scripts by nonce only, and everything here is a bar, a
 * band or a line — shapes, not a dependency.
 *
 * The rules they all follow, in one place so no chart has to remember them:
 *
 *  · **Colour never carries meaning alone.** Every series is labelled, every
 *    chart has a legend when it has more than one, and each one can be read as
 *    a table instead. Tracker columns are drawn in the colours the team chose
 *    for them — a report that recoloured them would be a second opinion about
 *    what the board says — and those are colours somebody picked rather than a
 *    palette validated for separation, so two of them can easily sit close
 *    together under red-green colour blindness. Labels are what separate them.
 *  · **Text wears ink, marks wear colour.** No number is ever painted in its
 *    series' colour.
 *  · **A 2px gap of the surface between neighbouring fills**, so two bands of
 *    similar colour still read as two.
 *  · **Recessive chrome.** Gridlines are hairlines, axes are muted, and the
 *    data is the only thing with weight.
 *  · **One scale per chart.** Two measures of different size are two charts.
 */

/** Where the numbers live, so a tile and an axis agree about what a number is. */
export function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

/* ------------------------------------------------------------------ tiles */

/**
 * A headline number. Not a chart: one figure, what it is, and one line of
 * context — the form a single value should take rather than a bar of one bar.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string;
  hint?: string;
  /** `alert` for a number that is a problem when it isn't zero. */
  tone?: "plain" | "alert" | "good";
}) {
  const alarming = tone === "alert" && value !== "0";
  return (
    <div className="card flex min-w-0 flex-col gap-0.5 p-3.5">
      <span className="field-label">{label}</span>
      <span
        className="text-[1.375rem] font-medium leading-tight tracking-tight"
        style={
          alarming
            ? { color: "var(--danger)" }
            : tone === "good"
              ? { color: "#0ca30c" }
              : undefined
        }
      >
        {value}
      </span>
      {hint && (
        <span className="text-[0.6875rem] leading-snug text-[var(--ink-muted)]">
          {hint}
        </span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- legend */

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Which colour is which, in words. Always present where a chart has more than
 * one series — this is the thing that keeps the status palette honest.
 */
export function Legend({ items }: { items: Slice[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex items-center gap-1.5 text-[0.6875rem] text-[var(--ink-secondary)]"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: item.color }}
          />
          <span className="truncate">{item.label}</span>
          <span className="tabular-nums text-[var(--ink-muted)]">
            {formatCount(item.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------ composition */

/**
 * How a whole divides up, as one bar. The form for composition when there is a
 * single total worth reading — a pie asks the eye to compare angles, which it
 * is bad at, and this asks it to compare lengths, which it is good at.
 *
 * Segments too thin to hold a label just have the colour and the legend, which
 * is why the legend is not optional.
 */
export function CompositionBar({
  slices,
  height = 34,
}: {
  slices: Slice[];
  height?: number;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const shown = slices.filter((s) => s.value > 0);
  if (total === 0) {
    return (
      <p className="text-[0.75rem] text-[var(--ink-muted)]">
        Nothing to divide up yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex w-full overflow-hidden rounded-[var(--radius)]"
        style={{ height, gap: 2 }}
        role="img"
        aria-label={shown
          .map((s) => `${s.label}: ${s.value} of ${total}`)
          .join("; ")}
      >
        {shown.map((slice) => {
          const share = (slice.value / total) * 100;
          return (
            <div
              key={slice.key}
              className="flex min-w-0 items-center justify-center rounded-[3px]"
              style={{ width: `${share}%`, background: slice.color }}
              title={`${slice.label}: ${slice.value} of ${total} (${Math.round(share)}%)`}
            >
              {/* Direct labels where there is room for them, in ink on a wash
                  of the colour rather than in the colour itself. */}
              {share >= 9 && (
                <span className="truncate px-1 text-[0.6875rem] font-medium tabular-nums text-white mix-blend-luminosity">
                  {Math.round(share)}%
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Legend items={slices} />
    </div>
  );
}

/* --------------------------------------------------------------- bar chart */

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** What the tooltip says instead of the bare number, when there is more. */
  detail?: string;
  color?: string;
}

/**
 * A column per period or per bucket. Bars start at zero — always — because a
 * bar's meaning is its length, and a truncated axis makes that length a lie.
 */
export function BarChart({
  bars,
  height = 150,
  accent = "var(--accent)",
  everyNthLabel = 1,
  reference,
}: {
  bars: Bar[];
  height?: number;
  accent?: string;
  /** Draw one label in N, for an axis with more ticks than room. */
  everyNthLabel?: number;
  /** A line across the chart — an average, a target — with what it is called. */
  reference?: { value: number; label: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (bars.length === 0) {
    return <p className="text-[0.75rem] text-[var(--ink-muted)]">Nothing yet.</p>;
  }

  const peak = Math.max(1, ...bars.map((b) => b.value));
  const plot = height - 22;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative" style={{ height }}>
        {reference && reference.value > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 flex items-center"
            style={{ bottom: 22 + (reference.value / peak) * plot }}
          >
            <span className="h-px w-full bg-[var(--baseline)]" />
            {/* The card's own background, not the page's — the label sits over
                bars, and a wash of the wrong surface reads as a hole in one. */}
            <span className="absolute right-0 -top-3.5 rounded bg-[var(--surface-raised)] px-1 text-[0.625rem] text-[var(--ink-muted)]">
              {reference.label}
            </span>
          </div>
        )}
        <div className="flex h-full items-end" style={{ gap: 2 }}>
          {bars.map((bar, i) => (
            <div
              key={bar.key}
              className="flex min-w-0 flex-1 cursor-default flex-col items-center justify-end"
              style={{ height }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              title={bar.detail ?? `${bar.label}: ${formatCount(bar.value)}`}
            >
              {/* The value floats above the bar it belongs to while the cursor
                  is on it — a number on every bar is noise, none at all is a
                  chart you have to guess at. */}
              <span
                className={`mb-0.5 text-[0.625rem] tabular-nums transition ${
                  hover === i
                    ? "text-[var(--ink)]"
                    : "text-transparent"
                }`}
              >
                {formatCount(bar.value)}
              </span>
              <span
                className="w-full rounded-t-[4px] transition-opacity"
                style={{
                  height: Math.max(bar.value > 0 ? 2 : 0, (bar.value / peak) * plot),
                  background: bar.color ?? accent,
                  opacity: hover === null || hover === i ? 1 : 0.45,
                }}
              />
              <span className="mt-1 h-4 truncate text-[0.5625rem] text-[var(--ink-muted)]">
                {i % everyNthLabel === 0 ? bar.label : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- horizontal bars */

/**
 * A row per thing, sorted longest first. The form for comparing named
 * quantities — people, tags — because a name reads along a row and gets cut off
 * under a column.
 *
 * Each row is split into what is finished and what isn't, which is the question
 * anybody looking at somebody's load is actually asking.
 */
export function RowBars({
  rows,
}: {
  rows: {
    key: string;
    label: string;
    done: number;
    open: number;
    color: string;
    detail?: string;
  }[];
}) {
  if (rows.length === 0) {
    return <p className="text-[0.75rem] text-[var(--ink-muted)]">Nobody yet.</p>;
  }
  const peak = Math.max(1, ...rows.map((r) => r.done + r.open));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => {
        const total = row.done + row.open;
        return (
          <div key={row.key} className="flex items-center gap-2.5">
            <span className="flex w-28 shrink-0 items-center gap-1.5 sm:w-36">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: row.color }}
              />
              <span className="truncate text-[0.75rem]">{row.label}</span>
            </span>
            <span
              className="flex h-4 min-w-0 flex-1 items-center"
              style={{ gap: 2 }}
              title={row.detail ?? `${row.label}: ${row.done} done of ${total}`}
            >
              {/* Finished work is drawn in the Done colour the boards use; what
                  is left is the person's own. Both are labelled at the end. */}
              {row.done > 0 && (
                <span
                  className="h-full rounded-l-[3px]"
                  style={{
                    width: `${(row.done / peak) * 100}%`,
                    background: "#0ca30c",
                  }}
                />
              )}
              {row.open > 0 && (
                <span
                  className="h-full rounded-r-[3px]"
                  style={{
                    width: `${(row.open / peak) * 100}%`,
                    background: row.color,
                    opacity: 0.75,
                  }}
                />
              )}
              <span className="shrink-0 pl-1 text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
                {row.done}/{total}
              </span>
            </span>
          </div>
        );
      })}
      <p className="text-[0.625rem] text-[var(--ink-muted)]">
        Green is finished; the rest is what they are still carrying.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------- stacked area */

export interface FlowDay {
  day: string;
  total: number;
  counts: Record<string, number>;
}

/**
 * The cumulative flow diagram: how much work stood in each column, day by day.
 *
 * The one chart here that says more than the boards do. The top edge is
 * everything the project has ever held, so it rising is scope arriving; the
 * bottom band is what is finished; the distance between them is the work still
 * open, and a band that widens rather than travels is where things are piling
 * up.
 *
 * Drawn as bands rather than lines because the quantity is a share of a whole —
 * and stacked in a fixed order, so a band never swaps places with its
 * neighbour between renders.
 */
export function FlowChart({
  days,
  series,
  height = 210,
}: {
  days: FlowDay[];
  /** Bottom to top, in the order they stack. */
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  const clip = useId();
  const [at, setAt] = useState<number | null>(null);

  if (days.length < 2) {
    return (
      <p className="text-[0.75rem] text-[var(--ink-muted)]">
        Not enough history yet — this fills in as work moves.
      </p>
    );
  }

  const width = 720;
  const plot = height - 20;
  const peak = Math.max(1, ...days.map((d) => d.total));
  const x = (i: number) => (i / (days.length - 1)) * width;
  const y = (value: number) => plot - (value / peak) * plot;

  // Bands are built bottom-up: each one runs along its own top edge and comes
  // back along the top edge of everything stacked under it. Accumulated in one
  // pass rather than by mapping over a running total, so nothing is reassigned
  // while the component renders.
  const bands: { key: string; label: string; color: string; path: string }[] =
    [];
  const beneath = days.map(() => 0);
  for (const s of series) {
    const tops = days.map((day, i) => beneath[i] + (day.counts[s.key] ?? 0));
    const forwards = tops.map((v, i) => `L ${x(i)} ${y(v)}`).join(" ");
    const backwards = beneath
      .map((_, i) => days.length - 1 - i)
      .map((i) => `L ${x(i)} ${y(beneath[i])}`)
      .join(" ");
    bands.push({
      ...s,
      path: `M ${x(0)} ${y(tops[0])} ${forwards} ${backwards} Z`,
    });
    for (let i = 0; i < beneath.length; i++) beneath[i] = tops[i];
  }

  const reading = at == null ? null : days[at];

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ height }}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Work by column over the last ${days.length} days, ${days[0].day} to ${
            days[days.length - 1].day
          }`}
          onMouseLeave={() => setAt(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const share = (e.clientX - box.left) / box.width;
            setAt(
              Math.max(0, Math.min(days.length - 1, Math.round(share * (days.length - 1))))
            );
          }}
        >
          <defs>
            <clipPath id={clip}>
              <rect x="0" y="0" width={width} height={plot} />
            </clipPath>
          </defs>
          {/* Three gridlines and no more: enough to read a height against,
              little enough to stay behind the data. */}
          {[0.25, 0.5, 0.75].map((share) => (
            <line
              key={share}
              x1="0"
              x2={width}
              y1={plot * share}
              y2={plot * share}
              stroke="var(--hairline)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <g clipPath={`url(#${clip})`}>
            {bands.map((band) => (
              <path
                key={band.key}
                d={band.path}
                fill={band.color}
                stroke="var(--surface)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
          <line
            x1="0"
            x2={width}
            y1={plot}
            y2={plot}
            stroke="var(--baseline)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {at != null && (
            <line
              x1={x(at)}
              x2={x(at)}
              y1="0"
              y2={plot}
              stroke="var(--ink)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              opacity="0.45"
            />
          )}
        </svg>

        {/* What the crosshair is standing on. Held in a corner rather than
            following the cursor: a box that moves is a box you chase. */}
        {reading && (
          <div className="pointer-events-none absolute right-0 top-0 rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[0.6875rem] shadow-lg">
            <p className="mb-0.5 font-medium tabular-nums">{reading.day}</p>
            {series
              .slice()
              .reverse()
              .map((s) => (
                <p
                  key={s.key}
                  className="flex items-center gap-1.5 text-[var(--ink-secondary)]"
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-[2px]"
                    style={{ background: s.color }}
                  />
                  {s.label}
                  <span className="ml-auto pl-2 tabular-nums text-[var(--ink)]">
                    {reading.counts[s.key] ?? 0}
                  </span>
                </p>
              ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-[0.625rem] tabular-nums text-[var(--ink-muted)]">
        <span>{days[0].day}</span>
        <span>{days[days.length - 1].day}</span>
      </div>
      <Legend
        items={series.map((s) => ({
          ...s,
          value: days[days.length - 1].counts[s.key] ?? 0,
        }))}
      />
    </div>
  );
}

/* ------------------------------------------------------------ table view */

/**
 * The same numbers as rows. Required rather than a nicety: a column's colour is
 * whatever the team picked, some of which sit below 3:1 against the light
 * surface, and the rule for that is that the reading must also be available
 * without colour at all.
 */
export function TableView({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="mt-1"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-[0.6875rem] text-[var(--ink-muted)] transition hover:text-[var(--ink)]">
        {open ? "Hide the numbers" : "Read it as a table"}
      </summary>
      <div className="thin-scroll mt-2 max-h-64 overflow-auto">
        <table className="w-full text-left text-[0.6875rem]">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-[var(--surface-raised)]">
            <tr>
              {columns.map((c) => (
                <th
                  key={c}
                  className="border-b border-[var(--hairline)] py-1 pr-3 font-medium text-[var(--ink-secondary)]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="border-b border-[var(--hairline)] py-1 pr-3 tabular-nums text-[var(--ink-secondary)]"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/* --------------------------------------------------------------- panel */

/** One chart, headed by what it answers rather than by what it is called. */
export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex min-w-0 flex-col gap-3 p-4">
      <div>
        <h3 className="text-[0.8125rem] font-semibold tracking-tight">{title}</h3>
        {hint && (
          <p className="mt-0.5 text-[0.75rem] leading-snug text-[var(--ink-muted)]">
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

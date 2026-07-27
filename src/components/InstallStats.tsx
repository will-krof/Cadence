"use client";

import { useEffect, useState } from "react";

interface Stats {
  admins: number;
  superadmins: number;
  withoutProjects: number;
  projects: number;
  people: number;
  tasks: number;
  workspaces: { projects: number; people: number; roster: number }[];
}

/**
 * How much the install is being used, for a superadmin, at the foot of the
 * sidebar.
 *
 * Numbers only. A workspace is a row of counts with no name, no email and
 * nothing that could be matched back to a person — the endpoint doesn't send
 * that, so this can't show it. Being a superadmin is a view of the shape of the
 * install, not a way into anybody's projects.
 */
export function InstallStats({ wide }: { wide: boolean }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;

  if (!wide) {
    return (
      <div
        className="mt-auto border-t border-[var(--hairline)] pt-3 text-center text-[0.625rem] text-[var(--ink-muted)]"
        title="Install statistics"
      >
        ∑
      </div>
    );
  }

  return (
    <div className="mt-auto flex flex-col gap-2 border-t border-[var(--hairline)] px-2 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="field-label">Install</span>
        <span className="rounded-full bg-[var(--accent-wash)] px-1.5 py-0.5 text-[0.5625rem] uppercase tracking-wide text-[var(--accent)]">
          Superadmin
        </span>
      </div>

      {!stats ? (
        <span className="text-[0.6875rem] text-[var(--ink-muted)]">Loading…</span>
      ) : (
        <>
          <dl className="flex flex-col gap-1">
            <Row label="Admins" value={stats.admins} />
            {stats.superadmins > 0 && (
              <Row label="Superadmins" value={stats.superadmins} />
            )}
            <Row label="Projects" value={stats.projects} />
            <Row label="People on projects" value={stats.people} />
            <Row label="Tasks" value={stats.tasks} />
          </dl>

          {stats.workspaces.length > 0 && (
            <>
              <button
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="self-start text-[0.6875rem] text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
              >
                {open ? "Hide" : "Per workspace"} ({stats.workspaces.length})
              </button>
              {open && (
                <ul className="thin-scroll flex max-h-44 flex-col gap-1 overflow-y-auto">
                  {stats.workspaces.map((w, i) => (
                    <li
                      key={i}
                      className="flex items-baseline justify-between gap-2 text-[0.6875rem] text-[var(--ink-secondary)]"
                    >
                      {/* Numbered, not named: which workspace is which is
                          nobody's business, including a superadmin's. */}
                      <span className="text-[var(--ink-muted)]">#{i + 1}</span>
                      <span className="tabular-nums">
                        {w.projects} proj · {w.people} ppl
                        {w.roster > w.people ? ` · ${w.roster} roster` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {stats.withoutProjects > 0 && (
                <span className="text-[0.625rem] text-[var(--ink-muted)]">
                  {stats.withoutProjects} account
                  {stats.withoutProjects === 1 ? "" : "s"} with no project yet
                </span>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[0.6875rem] text-[var(--ink-muted)]">{label}</dt>
      <dd className="text-[0.75rem] font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

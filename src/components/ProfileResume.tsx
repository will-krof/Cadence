"use client";

import { Avatar } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import {
  Developer,
  DeveloperTask,
  EMPLOYMENT_TYPES,
  statusMeta,
  workStatusMeta,
} from "@/lib/types";

/** One project this person appears on, and what they hold there. */
export interface ResumeProject {
  id: string;
  name: string;
  roles: { id: string; name: string }[];
  /** They carry work on it without being named on it. */
  viaTasks: boolean;
  /** They have set their login up through the project's invite link. */
  hasLogin: boolean;
}

/**
 * One person, as a résumé: a single card that reads top to bottom rather than a
 * stack of boxes. Details, then where they work, then what they are carrying,
 * then whatever was written about them.
 *
 * Presentational on purpose — the roster and the shareable profile page both
 * render it, so the page somebody is sent looks like the page it came from.
 */
export function ProfileResume({
  person,
  projects,
  tasks,
  tasksFailed = false,
  showPrivate,
  actions,
  footer,
}: {
  person: Pick<
    Developer,
    | "name"
    | "role"
    | "color"
    | "active"
    | "email"
    | "phone"
    | "birthday"
    | "workStatus"
    | "startDate"
    | "salary"
    | "currency"
    | "employmentType"
    | "notes"
  >;
  projects: ResumeProject[];
  /** Null while they are still loading. */
  tasks: DeveloperTask[] | null;
  tasksFailed?: boolean;
  /**
   * Whether the viewer is allowed the private half of a profile — pay, contact
   * details, notes. Colleagues get the working half; the workspace's owner gets
   * all of it. The server sends nothing more than this allows, so hiding here
   * is the second of two locks rather than the only one.
   */
  showPrivate: boolean;
  /** Buttons for the top corner: sharing, editing, going back. */
  actions?: React.ReactNode;
  /** Anything that belongs after the résumé, like archiving or deleting. */
  footer?: React.ReactNode;
}) {
  const openCount = tasks?.filter((t) => t.status !== "DONE").length ?? 0;

  const details = [
    showPrivate && person.email
      ? { label: "Email", value: person.email, href: `mailto:${person.email}` }
      : null,
    showPrivate && person.phone
      ? { label: "Phone", value: person.phone, href: `tel:${person.phone}` }
      : null,
    // A birthday is the workspace's to keep, not a colleague's to browse.
    showPrivate && person.birthday
      ? { label: "Birthday", value: formatDay(person.birthday) }
      : null,
    showPrivate && person.startDate
      ? { label: "Started", value: formatDay(person.startDate) }
      : null,
    person.employmentType
      ? {
          label: "Employment",
          value:
            EMPLOYMENT_TYPES.find((t) => t.value === person.employmentType)
              ?.label ?? null,
        }
      : null,
    showPrivate && person.salary != null
      ? {
          label: "Salary",
          value: `${person.salary.toLocaleString()} ${person.currency}`,
        }
      : null,
  ].filter((d): d is { label: string; value: string; href?: string } =>
    Boolean(d?.value)
  );

  return (
    <article className="mx-auto w-full max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-start gap-4 p-5 sm:p-6">
        <Avatar person={person} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {person.name}
            </h2>
            {/* Where they are this week, which is what a colleague plans
                around — so it reads beside the name rather than in the details
                below it. */}
            {person.active && person.workStatus && person.workStatus !== "WORKING" && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide"
                style={{ color: workStatusMeta(person.workStatus).color }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: workStatusMeta(person.workStatus).color }}
                />
                {workStatusMeta(person.workStatus).label}
              </span>
            )}
            {!person.active && (
              <span className="rounded-full bg-[var(--gridline)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--ink-secondary)]">
                Archived
              </span>
            )}
          </div>
          <p className="mt-1 text-[0.875rem] text-[var(--ink-secondary)]">
            {person.role || "No job title yet"}
          </p>
          {/* The task count waits for the tasks rather than standing in for
              them, so the line doesn't shuffle as they arrive. */}
          <p className="mt-0.5 text-[0.75rem] text-[var(--ink-muted)]">
            {[
              tasks === null
                ? null
                : `${openCount} open task${openCount === 1 ? "" : "s"}`,
              projects.length > 0
                ? `${projects.length} project${projects.length === 1 ? "" : "s"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Nothing on yet"}
          </p>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </header>

      {details.length > 0 && (
        <Section>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label}>
                <dt className="field-label">{detail.label}</dt>
                <dd className="mt-0.5 text-[0.8125rem]">
                  {detail.href ? (
                    <a
                      href={detail.href}
                      className="text-[var(--accent)] hover:underline"
                    >
                      {detail.value}
                    </a>
                  ) : (
                    detail.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Projects" count={projects.length}>
        {projects.length === 0 ? (
          <Muted>
            {tasks === null ? "Loading…" : "Not on any project yet."}
          </Muted>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {projects.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                  {row.name}
                </span>
                {showPrivate && row.hasLogin && (
                  <span className="shrink-0 text-[0.6875rem] text-[var(--ink-muted)]">
                    Login set up
                  </span>
                )}
                {row.roles.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {row.roles.map((role) => (
                      <span
                        key={role.id}
                        className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--accent)]"
                      >
                        {role.name}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-[0.75rem] text-[var(--ink-muted)]">
                    {row.viaTasks ? "Has tasks, no role" : "No role"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Assigned tasks" count={tasks?.length}>
        {tasksFailed && <Muted tone="error">Could not load their tasks.</Muted>}
        {!tasksFailed && tasks === null && <Muted>Loading…</Muted>}
        {tasks?.length === 0 && <Muted>Nothing assigned right now.</Muted>}
        {tasks && tasks.length > 0 && (
          <ul className="thin-scroll -mx-1 max-h-72 overflow-y-auto px-1">
            {tasks.map((task) => {
              const meta = statusMeta(task.status);
              return (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--hairline)] py-2 last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                    {task.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--plane)] px-2 py-0.5 text-[0.6875rem] text-[var(--ink-secondary)]">
                    {task.project.name}
                  </span>
                  <span
                    className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                    style={{
                      background: `color-mix(in srgb, ${meta.color} 14%, var(--surface-raised))`,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: meta.color }}
                    />
                    {meta.label}
                  </span>
                  <span className="shrink-0 text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
                    {formatDay(task.endDate)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {showPrivate && person.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
            {person.notes}
          </p>
        </Section>
      )}

      {footer && (
        <div className="border-t border-[var(--hairline)] bg-[var(--plane)] p-4 sm:px-6">
          {footer}
        </div>
      )}
    </article>
  );
}

/** One band of the résumé. The hairline is what separates them. */
function Section({
  title,
  count,
  children,
}: {
  title?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[var(--hairline)] p-5 sm:px-6">
      {title && (
        <h3 className="mb-2.5 text-[0.75rem] font-semibold tracking-tight">
          {title}
          {count !== undefined && (
            <span className="ml-2 font-normal text-[var(--ink-muted)]">
              {count}
            </span>
          )}
        </h3>
      )}
      {children}
    </section>
  );
}

function Muted({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <p
      className={`text-[0.8125rem] ${
        tone === "error" ? "text-[#d03b3b]" : "text-[var(--ink-muted)]"
      }`}
    >
      {children}
    </p>
  );
}

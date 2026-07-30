"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { Field, SettingToggle } from "@/components/ui";
import { addDays, diffDays, formatRange, toISODate } from "@/lib/dates";
import {
  PROJECT_TOOL_TOGGLES,
  Project,
  TASK_FIELD_TOGGLES,
} from "@/lib/types";

/** Everything the settings form writes: the project's shape, in one payload. */
export interface ProjectSettingsValues {
  name: string;
  description: string;
  hasTimeline: boolean;
  hasTracker: boolean;
  hasWiki: boolean;
  hasSprints: boolean;
  hasRoles: boolean;
  startDate: string | null;
  endDate: string | null;
  taskHasPriority: boolean;
  taskHasLink: boolean;
  taskHasDates: boolean;
  taskHasHistory: boolean;
  taskHasComments: boolean;
  taskHasSubtasks: boolean;
  taskHasDependencies: boolean;
  taskHasTags: boolean;
}

/** What the form holds while it is being filled in: dates as the inputs want. */
type Draft = Omit<ProjectSettingsValues, "startDate" | "endDate"> & {
  startDate: string;
  endDate: string;
};

/** A stored date as a date input wants it, or empty when there isn't one. */
function dateValue(iso: string | null) {
  return iso ? toISODate(new Date(iso)) : "";
}

function draftOf(project: Project): Draft {
  return {
    name: project.name,
    description: project.description ?? "",
    hasTimeline: project.hasTimeline,
    hasTracker: project.hasTracker,
    hasWiki: project.hasWiki,
    hasSprints: project.hasSprints,
    hasRoles: project.hasRoles,
    startDate: dateValue(project.startDate),
    endDate: dateValue(project.endDate),
    taskHasPriority: project.taskHasPriority,
    taskHasLink: project.taskHasLink,
    taskHasDates: project.taskHasDates,
    taskHasHistory: project.taskHasHistory,
    taskHasComments: project.taskHasComments,
    taskHasSubtasks: project.taskHasSubtasks,
    taskHasDependencies: project.taskHasDependencies,
    taskHasTags: project.taskHasTags,
  };
}

/** Which section each answer belongs to, so a section can say it has changed. */
const SECTION_KEYS = {
  about: ["name", "description"],
  dates: ["startDate", "endDate"],
  tools: PROJECT_TOOL_TOGGLES.map((t) => t.key),
  task: TASK_FIELD_TOGGLES.map((t) => t.key),
} satisfies Record<string, (keyof Draft)[]>;

/**
 * The project's settings, as four questions rather than one long form.
 *
 * The old form was a single column of controls with a paragraph of explanation
 * after every other one, and its Save button was wherever the scroll happened
 * to leave it — so changing one switch meant reading the whole thing and then
 * hunting for the way out. This asks four separate questions, each in its own
 * card with one line saying what the question is for; shows what a task will
 * end up asking for as you switch its fields; marks the sections you have
 * touched; and keeps Save, Cancel and the count of what is unsaved pinned to
 * the bottom of the screen where they can always be reached.
 *
 * Nothing is written until Save: leaving with changes asks first, Escape is the
 * way out, and ⌘/Ctrl+Enter is the way through.
 */
export function ProjectSettingsForm({
  project,
  tagEditor,
  onCancel,
  onSave,
}: {
  project: Project;
  /**
   * The project's tags, editable in place. Handed in rather than built here
   * because a tag is written the moment it is typed — it is a row of the
   * project, like a sprint, not an answer this form is collecting.
   */
  tagEditor?: React.ReactNode;
  onCancel: () => void;
  onSave: (values: ProjectSettingsValues) => Promise<void>;
}) {
  const { confirm } = useFeedback();
  const initial = useMemo(() => draftOf(project), [project]);
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  // Errors are shown against the field, but only once the form has been sent
  // for — a name box that goes red while it is being cleared to retype is
  // telling you off for something you are in the middle of doing.
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const leaving = useRef(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const changed = useMemo(
    () =>
      (Object.keys(initial) as (keyof Draft)[]).filter(
        (key) => initial[key] !== draft[key]
      ),
    [initial, draft]
  );
  const dirty = changed.length > 0;
  const changedIn = (keys: readonly (keyof Draft)[]) =>
    keys.some((key) => changed.includes(key));

  /** Whether this project has anywhere to keep a task. */
  const hasTasks = draft.hasTimeline || draft.hasTracker;

  const nameError = !draft.name.trim() ? "A project needs a name." : null;
  const dateError =
    draft.startDate && draft.endDate && draft.endDate < draft.startDate
      ? "The project can’t end before it starts."
      : null;
  const blocked = Boolean(nameError || dateError);

  /** How long the stated span is, said back in the words a person would use. */
  const span = useMemo(() => {
    if (!draft.startDate || !draft.endDate || dateError) return null;
    const start = new Date(draft.startDate);
    const end = new Date(draft.endDate);
    const days = diffDays(start, end) + 1;
    return `${formatRange(start, end)} · ${days} day${days === 1 ? "" : "s"}`;
  }, [draft.startDate, draft.endDate, dateError]);

  async function leave() {
    if (!dirty) {
      onCancel();
      return;
    }
    // Escape is both the way out of here and the way out of the question it
    // asks, so the question is only ever asked once at a time.
    if (leaving.current) return;
    leaving.current = true;
    const ok = await confirm({
      title: "Leave without saving?",
      body: `${changed.length} change${
        changed.length === 1 ? "" : "s"
      } to this project will be thrown away.`,
      confirmLabel: "Discard changes",
      destructive: true,
    });
    leaving.current = false;
    if (ok) onCancel();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (blocked || pending) return;
    setPending(true);
    await onSave({
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      // Emptying a field clears the stored date rather than leaving the old one
      // behind — an empty box has to mean what it looks like it means.
      startDate: draft.startDate || null,
      endDate: draft.endDate || null,
    });
    setPending(false);
  }

  // Escape leaves, ⌘/Ctrl+Enter saves — the two ways out, from anywhere on the
  // screen rather than only from the buttons at the bottom of it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        void leave();
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <form ref={formRef} className="flex flex-col gap-4" onSubmit={submit}>
      <Section
        title="Name and description"
        hint="What this project is called, and what it is about."
        changed={changedIn(SECTION_KEYS.about)}
      >
        <Field label="Project name">
          <input
            autoFocus
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            className="input"
            aria-invalid={submitted && Boolean(nameError)}
            aria-describedby={nameError ? "project-name-error" : undefined}
          />
        </Field>
        {submitted && nameError && (
          <p
            id="project-name-error"
            className="text-[0.6875rem] text-[var(--danger)]"
          >
            {nameError}
          </p>
        )}

        <Field label="Short description">
          <textarea
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            className="input min-h-16 resize-y"
            placeholder="What is this project about…"
          />
        </Field>
      </Section>

      <Section
        title="When it runs"
        hint="Leave both empty to let the work say it — the earliest task to the latest."
        changed={changedIn(SECTION_KEYS.dates)}
      >
        <div className="flex flex-col gap-3.5 sm:flex-row">
          <Field label="Start date" className="flex-1">
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              className="input"
              aria-invalid={Boolean(dateError)}
            />
          </Field>
          <Field label="End date" className="flex-1">
            <input
              type="date"
              // A span is filled in start-first, and the browser can say so:
              // the end can't be offered a day before the project begins.
              min={draft.startDate || undefined}
              value={draft.endDate}
              onChange={(e) => set("endDate", e.target.value)}
              className="input"
              aria-invalid={Boolean(dateError)}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {dateError ? (
            <p className="text-[0.6875rem] text-[var(--danger)]">{dateError}</p>
          ) : span ? (
            <p className="text-[0.6875rem] text-[var(--ink-secondary)]">
              {span}
            </p>
          ) : (
            <p className="text-[0.6875rem] text-[var(--ink-muted)]">
              Nothing stated — the tasks decide.
            </p>
          )}
          {/* The common spans, so a quarter doesn't have to be counted out on
              a date picker. Each one starts from the date already there. */}
          {!dateError &&
            SPANS.map((preset) => (
              <button
                key={preset.days}
                type="button"
                onClick={() => {
                  const start = draft.startDate || toISODate(new Date());
                  set("startDate", start);
                  set(
                    "endDate",
                    toISODate(addDays(new Date(start), preset.days - 1))
                  );
                }}
                className="chip transition hover:text-[var(--ink)]"
              >
                {preset.label}
              </button>
            ))}
          {(draft.startDate || draft.endDate) && (
            <button
              type="button"
              onClick={() => {
                set("startDate", "");
                set("endDate", "");
              }}
              className="chip transition hover:text-[var(--danger)]"
            >
              Clear dates
            </button>
          )}
        </div>
      </Section>

      <Section
        title="What this project uses"
        hint="Only what is switched on appears in the sidebar. Everything else stays out of the way."
        changed={changedIn(SECTION_KEYS.tools)}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {PROJECT_TOOL_TOGGLES.map((tool) => (
            <SettingToggle
              key={tool.key}
              checked={draft[tool.key]}
              onChange={(v) => set(tool.key, v)}
              label={tool.label}
              hint={tool.hint}
              note={
                // The one pair that can be set against each other: a timeline
                // is drawn from dates the tasks aren't being asked for.
                tool.key === "hasTimeline" &&
                draft.hasTimeline &&
                !draft.taskHasDates ? (
                  <span className="text-[var(--danger)]">
                    Tasks aren’t being asked for dates — switch those back on
                    below, or the chart has nothing to draw.
                  </span>
                ) : undefined
              }
            />
          ))}
        </div>
        <p className="text-[0.6875rem] text-[var(--ink-muted)]">
          The team roster isn’t a tool to switch off — every project has people.
          Sprints and roles already made are kept when their tool goes off, and
          are waiting where they were if it comes back.
        </p>
      </Section>

      <Section
        title="What a task asks for"
        hint="A form should ask what this team actually fills in, and nothing else."
        changed={changedIn(SECTION_KEYS.task)}
        // Tasks live on the two boards. With neither of them on, this project
        // has no tasks, and a page of questions about a task's fields is a
        // page of questions about nothing — so it waits until there is
        // somewhere for a task to be.
        locked={
          hasTasks
            ? null
            : "Switch on the Gantt chart or the task tracker above — tasks are kept on those, and until one of them is on there are none to ask about."
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {TASK_FIELD_TOGGLES.map((toggle) => (
            <SettingToggle
              key={toggle.key}
              checked={draft[toggle.key]}
              onChange={(v) => set(toggle.key, v)}
              disabled={!hasTasks}
              label={toggle.label}
              hint={toggle.hint}
            />
          ))}
        </div>

        {/* Tags are the one field whose answer is the project's own, so the
            list of them is set up right under the switch that shows it. */}
        {hasTasks && draft.taskHasTags && tagEditor}

        {/* The answer to "so what will the form look like?", without having to
            save and go and open one. */}
        {hasTasks && (
          <div className="rounded-[var(--radius)] border border-dashed border-[var(--hairline)] p-3">
            <p className="field-label mb-1.5">A task will ask for</p>
            <div className="flex flex-wrap gap-1.5">
              {ALWAYS_ASKED.map((label) => (
                <span key={label} className="chip">
                  {label}
                </span>
              ))}
              {TASK_FIELD_TOGGLES.filter((t) => draft[t.key]).map((t) => (
                <span key={t.key} className="chip chip-accent">
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-[0.6875rem] text-[var(--ink-muted)]">
          A field put away stops being asked about — on the form, on the card
          and on the boards — but nothing already written is lost: switch it
          back on and it is all still there. Tasks keep their dates whatever
          this says, because the timeline is drawn from them.
        </p>
      </Section>

      {/* Pinned to the foot of the card: on a form this long, the way out
          should not depend on where the scroll happens to be. */}
      <div className="card sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 bg-[var(--surface-raised)] px-4 py-3 shadow-lg">
        <p
          className="mr-auto text-[0.75rem] text-[var(--ink-muted)]"
          aria-live="polite"
        >
          {blocked && submitted ? (
            <span className="text-[var(--danger)]">
              {nameError ?? dateError}
            </span>
          ) : dirty ? (
            <>
              <span className="font-medium text-[var(--ink)]">
                {changed.length} unsaved change
                {changed.length === 1 ? "" : "s"}
              </span>
              {" · nothing is written until you save"}
            </>
          ) : (
            "No changes yet."
          )}
        </p>
        {dirty && (
          <button
            type="button"
            onClick={() => setDraft(initial)}
            className="text-[0.75rem] text-[var(--ink-muted)] underline-offset-2 transition hover:text-[var(--ink)] hover:underline"
          >
            Undo changes
          </button>
        )}
        <button type="button" onClick={leave} className="btn-secondary">
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={pending || !dirty}
          title={dirty ? "Save changes (⌘/Ctrl + Enter)" : "Nothing to save yet"}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

/** What every task carries, whatever the project has switched off. */
const ALWAYS_ASKED = ["Title", "Description", "Who is on it", "Status"];

/** Spans a project is usually given, counted from the day it starts. */
const SPANS = [
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "1 quarter", days: 91 },
];

/**
 * One question, in its own card. The heading says what is being decided and
 * the line under it says why you would care — so a section can be skipped on
 * sight rather than read through.
 */
function Section({
  title,
  hint,
  changed,
  locked = null,
  children,
}: {
  title: string;
  hint: string;
  /** Marks the sections touched, so a long form can be checked over quickly. */
  changed: boolean;
  /**
   * Why this section can't be answered yet, if it can't. A section that
   * depends on an answer further up says so in place, instead of quietly
   * taking settings that would do nothing.
   */
  locked?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div>
        <h3 className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-semibold tracking-tight">
          {title}
          {changed && !locked && (
            <span className="chip chip-accent text-[0.5625rem] tracking-wide uppercase">
              Changed
            </span>
          )}
          {locked && (
            <span className="chip text-[0.5625rem] tracking-wide uppercase">
              Locked
            </span>
          )}
        </h3>
        <p className="mt-0.5 text-[0.75rem] text-[var(--ink-muted)]">{hint}</p>
      </div>
      {locked && (
        <p className="rounded-[var(--radius)] bg-[var(--plane)] px-3 py-2 text-[0.75rem] text-[var(--ink-secondary)]">
          {locked}
        </p>
      )}
      {children}
    </section>
  );
}

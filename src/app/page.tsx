import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { Logo, Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function LandingPage() {
  const viewer = await getViewer();
  const inside = viewer != null;

  return (
    <div className="thin-scroll flex-1 overflow-y-auto bg-[var(--plane)]">
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-2">
          {inside ? (
            <Link href="/app" className="btn-primary">
              Open app
            </Link>
          ) : (
            <Link href="/login" className="btn-primary">
              Log in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-16 sm:px-8">
        <section className="py-14 sm:py-20">
          <p className="mb-3 text-[0.75rem] font-medium uppercase tracking-wider text-[var(--accent)]">
            Timeline, tracker and team in one
          </p>
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Plan the sprint. Then watch it move.
          </h1>
          <p className="mt-5 max-w-xl text-[0.9375rem] leading-relaxed text-[var(--ink-secondary)]">
            Cadence gives every project a Gantt timeline and a kanban tracker
            over the same tasks — so scheduling and day-to-day progress never
            drift apart. Everyone you work with comes in through a link, and
            sees exactly what their role should.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={inside ? "/app" : "/login"} className="btn-primary">
              {inside ? "Open app" : "Log in"}
            </Link>
          </div>
          {!inside && (
            <p className="mt-4 max-w-xl text-[0.8125rem] leading-relaxed text-[var(--ink-muted)]">
              Been sent an invite link? Open it — it takes you straight into the
              project. There is no sign-up: the link is the way in.
            </p>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Feature
            title="Gantt timeline"
            body="Scheduling with sprint boundaries, weekend shading and resizable columns. Hide weekends when they only add noise."
          />
          <Feature
            title="Kanban tracker"
            body="Drag tasks between statuses with a mouse, pen or finger. The same tasks as the timeline — never a second copy to keep in sync."
          />
          <Feature
            title="Sprint by sprint"
            body="Each sprint is its own board. Plan them ahead, and the timeline and tracker switch between them together."
          />
          <Feature
            title="Roles that mean something"
            body="Every project has its own roles, and each one is a list of what it can open: timeline, tracker, team. Admins hold the pen."
          />
          <Feature
            title="Invite links, not accounts"
            body="Put someone on a project and they get a link. It lets them in as themselves, with the roles they hold — no password to set up."
          />
          <Feature
            title="One team, many projects"
            body="Profiles, salaries and contact details live in one roster. Someone can be an admin on one project and a designer on the next."
          />
        </section>

        <section className="mt-14 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6 sm:p-10">
          <h2 className="text-lg font-semibold tracking-tight">
            How people get in
          </h2>
          <ol className="mt-4 flex flex-col gap-4">
            <Step
              n={1}
              title="Add them to the project"
              body="Pick someone from the roster and tick the roles they should hold. A link is made for them there and then."
            />
            <Step
              n={2}
              title="Send them the link"
              body="They open it, see the project and the roles it carries, and they're in — no account, no password."
            />
            <Step
              n={3}
              title="Change your mind whenever"
              body="Regenerate the link and the old one dies on the spot. Switch it off and nobody gets in until you hand out a new one."
            />
          </ol>
        </section>

        <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6 sm:p-10">
          <h2 className="text-lg font-semibold tracking-tight">
            Your workspace is yours
          </h2>
          <p className="mt-2 max-w-xl text-[0.875rem] leading-relaxed text-[var(--ink-secondary)]">
            Projects, tasks and the roster belong to your account. Guests reach
            one project and the roles you gave them — nothing else, and nothing
            you didn’t hand out.
          </p>
        </section>
      </main>

      <footer className="border-t border-[var(--hairline)] px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center gap-2 text-[0.75rem] text-[var(--ink-muted)]">
          <Logo size={16} />
          <span>Cadence</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <h3 className="text-[0.875rem] font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
        {body}
      </p>
    </article>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3.5">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold text-white"
        style={{ background: "var(--accent)" }}
        aria-hidden="true"
      >
        {n}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.875rem] font-semibold tracking-tight">
          {title}
        </span>
        <span className="mt-1 block text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
          {body}
        </span>
      </span>
    </li>
  );
}

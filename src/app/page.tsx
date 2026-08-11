import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { Logo, Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function LandingPage() {
  const viewer = await getViewer();
  const inside = viewer != null;

  return (
    <div className="schematic thin-scroll flex-1 overflow-y-auto bg-[var(--plane)]">
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-2">
          {inside ? (
            <Link href="/app" className="btn-primary">
              Open app
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn-secondary">
                Log in
              </Link>
              <Link href="/signup" className="btn-primary">
                Sign up
              </Link>
            </>
          )}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-16 sm:px-8">
        <section className="py-14 sm:py-20">
          <p className="mb-3 text-[0.75rem] font-medium uppercase tracking-wider text-[var(--accent)]">
            Timeline, tracker, wiki, reports and team in one
          </p>
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Plan the sprint. Then watch it move.
          </h1>
          <p className="mt-5 max-w-xl text-[0.9375rem] leading-relaxed text-[var(--ink-secondary)]">
            Cadence gives every project a Gantt timeline and a kanban tracker
            over the same tasks — so scheduling and day-to-day progress never
            drift apart. The board is yours to name: columns you write, colour
            and reorder yourself, on a tracker that starts empty rather than
            arriving with somebody else’s idea of how you work.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={inside ? "/app" : "/signup"} className="btn-primary">
              {inside ? "Open app" : "Create your workspace"}
            </Link>
            {!inside && (
              <Link href="/login" className="btn-secondary">
                I already have an account
              </Link>
            )}
          </div>
          {!inside && (
            <p className="mt-4 max-w-xl text-[0.8125rem] leading-relaxed text-[var(--ink-muted)]">
              Been sent an invite link? Open it and pick a username and password
              — you don’t need an account of your own, and each link works for
              three days.
            </p>
          )}
        </section>

        {/* What is new leads, because it is the thing people are told about a
            board and don't believe until they see it: the columns are yours. */}
        <section className="mt-2 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6 sm:p-10">
          <p className="text-[0.75rem] font-medium uppercase tracking-wider text-[var(--accent)]">
            New
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            Columns you name yourself
          </h2>
          <p className="mt-3 max-w-2xl text-[0.875rem] leading-relaxed text-[var(--ink-secondary)]">
            No tool knows what your team’s states are called. So a tracker now
            starts with none: write the first column, pick its colour, and add
            the rest as you need them. Rename one, recolour it, drag the board
            into the order you actually work in. Tick which column means the work
            is finished — <em>Shipped</em>, <em>Live</em>, <em>Готово</em>, it’s
            all the same to the reports, which count from what you ticked rather
            than from a word this app decided on.
          </p>
          <p className="mt-3 max-w-2xl text-[0.875rem] leading-relaxed text-[var(--ink-secondary)]">
            And a column you don’t want is <strong>deleted</strong>, not hidden
            from you and left standing for everybody else. The work in it isn’t
            deleted with it — it comes back on the board as unsorted, ready to be
            dragged somewhere that still exists.
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[0.8125rem] text-[var(--ink-secondary)]">
            {[
              "Your words",
              "Your colours",
              "Your order",
              "Deleted means deleted",
              "Never loses a task",
            ].map((claim) => (
              <li key={claim} className="flex items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                  aria-hidden="true"
                />
                {claim}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <Feature
            title="Kanban tracker"
            body="Columns you name, colour and reorder. Drag tasks between them with a mouse, pen or finger — the same tasks as the timeline, never a second copy to keep in sync."
          />
          <Feature
            title="Gantt timeline"
            body="Drag a bar to move the work, drag its edge to resize it, or draw a new task straight onto the days it runs. Weekends fold away when they only add noise."
          />
          <Feature
            title="What waits on what"
            body="Say a task is blocked by another and the chart draws the line. The longest chain — where a day lost is a day off the end — is picked out for you."
          />
          <Feature
            title="Reports that count your board"
            body="Cumulative flow, throughput a week, cycle time, velocity a sprint, and who is carrying what. Worked out from the tasks and their history, stored nowhere, always as true as the boards."
          />
          <Feature
            title="Sprint by sprint"
            body="Each sprint is its own board. Plan them ahead, archive the ones that are done, and the timeline and tracker switch between them together."
          />
          <Feature
            title="A wiki per project"
            body="A tree of pages for everything that isn't a task: decisions, runbooks, the things somebody would otherwise ask twice."
          />
          <Feature
            title="Tasks with room in them"
            body="Up to four people on one, steps inside it, tags in your own colours, an estimate in hours or days, comments, and a history of every move."
          />
          <Feature
            title="Private notes"
            body="A pile of your own that nobody else in the workspace can read — pinned, reordered, and written where you're already working."
          />
          <Feature
            title="One team, many projects"
            body="Profiles, time zones, languages and pay live in one roster. Someone can be an admin on one project and a designer on the next."
          />
          <Feature
            title="Roles that mean something"
            body="Every project has its own roles, and each is a list of what it opens: timeline, tracker, wiki, team — watch it, or work in it."
          />
          <Feature
            title="Invited, not signed up"
            body="Give someone a role on a project and their link appears. It lasts three days, and they spend it picking the username and password they'll sign in with."
          />
          <Feature
            title="Nothing you didn't ask for"
            body="A project starts with everything switched off. Tick the tools it needs, and the fields a task should ask for, and the rest never appears."
          />
        </section>

        <section className="mt-14 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6 sm:p-10">
          <h2 className="text-lg font-semibold tracking-tight">
            How people get in
          </h2>
          <ol className="mt-4 flex flex-col gap-4">
            <Step
              n={1}
              title="Sign up, and the workspace is yours"
              body="An account is a workspace: your projects, your roster, and you as its admin. Nothing in it is visible to anybody until you hand out a link."
            />
            <Step
              n={2}
              title="Put them on the project, in a role"
              body="Add someone from the roster to a project and tick what they are here to do. The moment they hold a role, their invite link is ready on the project card."
            />
            <Step
              n={3}
              title="They pick a login"
              body="The link shows them the project and the roles it carries, then asks for a username and a password. That is what they sign in with from then on."
            />
            <Step
              n={4}
              title="Links don't linger"
              body="Every link runs out after three days, and a fresh one takes its place. Regenerate one and the old one dies on the spot; switch it off and nobody can use it at all."
            />
          </ol>
        </section>

        <section className="mt-6 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6 sm:p-10">
          <h2 className="text-lg font-semibold tracking-tight">
            Your workspace is yours
          </h2>
          <p className="mt-2 max-w-xl text-[0.875rem] leading-relaxed text-[var(--ink-secondary)]">
            Projects, tasks and the roster belong to your account. Everyone else
            reaches the projects you put them on, through the roles you gave
            them — nothing else, and nothing you didn’t hand out.
          </p>
        </section>

        <section className="mt-6 flex flex-col items-start gap-4 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Build the board you actually work on
            </h2>
            <p className="mt-2 max-w-xl text-[0.875rem] leading-relaxed text-[var(--ink-secondary)]">
              Five minutes to a workspace, a project and a board in your own
              words. Nothing to provision, nobody else to invite until you want
              to.
            </p>
          </div>
          <Link
            href={inside ? "/app" : "/signup"}
            className="btn-primary shrink-0"
          >
            {inside ? "Open app" : "Create your workspace"}
          </Link>
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

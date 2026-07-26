import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { Logo, Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function LandingPage() {
  const user = await getSessionUser();

  return (
    <div className="thin-scroll flex-1 overflow-y-auto bg-[var(--plane)]">
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-2">
          {user ? (
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
            Timeline &amp; tracker in one
          </p>
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Plan the sprint. Then watch it move.
          </h1>
          <p className="mt-5 max-w-xl text-[0.9375rem] leading-relaxed text-[var(--ink-secondary)]">
            Cadence gives every project a Gantt timeline and a kanban tracker
            over the same tasks — so scheduling and day-to-day progress never
            drift apart.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={user ? "/app" : "/signup"} className="btn-primary">
              {user ? "Open app" : "Get started — it's free"}
            </Link>
            {!user && (
              <Link href="/login" className="btn-secondary">
                I already have an account
              </Link>
            )}
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Feature
            title="Gantt timeline"
            body="Drag-free scheduling with sprint boundaries, weekend shading and resizable columns. Hide weekends when they only add noise."
          />
          <Feature
            title="Kanban tracker"
            body="Drag tasks between statuses with a mouse, pen or finger. The same tasks as the timeline — never a second copy to keep in sync."
          />
          <Feature
            title="Per-project tools"
            body="Pick a timeline, a tracker, or both when you create a project. Nothing you didn't ask for shows up in the sidebar."
          />
        </section>

        <section className="mt-14 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6 sm:p-10">
          <h2 className="text-lg font-semibold tracking-tight">
            Your workspace is yours
          </h2>
          <p className="mt-2 max-w-xl text-[0.875rem] leading-relaxed text-[var(--ink-secondary)]">
            Every account gets its own projects, tasks and developer roster.
            Nothing is shared unless you decide to share it.
          </p>
          {!user && (
            <Link href="/signup" className="btn-primary mt-6 inline-block">
              Create your account
            </Link>
          )}
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

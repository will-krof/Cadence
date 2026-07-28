import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FeedbackProvider } from "@/components/Feedback";
import { AccountPanel } from "@/components/shell/AccountPanel";

export const metadata = { title: "Your profile · Cadence" };

/**
 * Your own account, on a page of its own rather than in a window over the work.
 * It is its own address, so it can be linked to, opened in a tab and gone back
 * from — which a modal never could.
 *
 * It wears the app's own chrome: the same bar, the same surfaces, a way back to
 * the work in the corner it is always in. It used to stand on the drafting-paper
 * grid the landing page and the sign-in screens use, and that one shared class
 * was enough to make somebody's own profile read as a page from outside the
 * product — a form to fill in on the way in, rather than a screen of the app
 * they are already inside.
 */
export default async function AccountPage() {
  if (!(await getViewer())) redirect("/login");

  return (
    <div className="flex h-full flex-col bg-[var(--plane)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--surface)] px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/app"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-[var(--ink-muted)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)]"
            aria-label="Back to the app"
            title="Back to the app"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M8.5 2.5L4 7l4.5 4.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <Link href="/app" className="min-w-0">
            <Wordmark />
          </Link>
          <span className="t-small hidden truncate border-l border-[var(--hairline)] pl-2.5 sm:inline">
            Your profile
          </span>
        </div>
        <ThemeToggle />
      </header>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
          <h1 className="t-title">Your profile</h1>
          <p className="t-small mt-1.5">
            What you sign in with, what you are here, and when you joined.
          </p>
          <div className="mt-6">
            <FeedbackProvider>
              <AccountPanel />
            </FeedbackProvider>
          </div>
        </main>
      </div>
    </div>
  );
}

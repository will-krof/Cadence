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
 */
export default async function AccountPage() {
  if (!(await getViewer())) redirect("/login");

  return (
    <div className="schematic thin-scroll flex flex-1 flex-col overflow-y-auto bg-[var(--plane)]">
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link href="/app">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/app" className="btn-secondary">
            Back to the app
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl px-5 pb-16 sm:px-8">
        <h1 className="mb-1 text-lg font-semibold tracking-tight">
          Your profile
        </h1>
        <p className="mb-5 text-[0.8125rem] text-[var(--ink-secondary)]">
          What you sign in with, what you are here, and when you joined.
        </p>
        <FeedbackProvider>
          <AccountPanel />
        </FeedbackProvider>
      </main>
    </div>
  );
}

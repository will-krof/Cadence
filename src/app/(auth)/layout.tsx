import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { Wordmark } from "@/components/Logo";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Already signed in? The auth screens have nothing to offer.
  if (await getSessionUser()) redirect("/app");

  return (
    <div className="schematic thin-scroll flex flex-1 flex-col overflow-y-auto bg-[var(--plane)]">
      <header className="px-5 py-4 sm:px-8">
        <Link href="/">
          <Wordmark />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6 shadow-sm">
          {children}
        </div>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AcceptInvite } from "@/components/AcceptInvite";
import { ROLE_VIEWS } from "@/lib/types";

export const metadata: Metadata = { title: "You're invited — Cadence" };

/**
 * What an invite link opens: the project it is for, the roles it carries, and
 * one button to go in. Accepting is a POST rather than the link itself, so a
 * mail client fetching the URL can't spend the invite on the recipient's behalf.
 */
export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;

  const member = await prisma.projectMember.findFirst({
    where: { inviteToken: token, inviteRevoked: false },
    select: {
      project: {
        select: {
          name: true,
          description: true,
          hasTimeline: true,
          hasTracker: true,
          hasTeam: true,
        },
      },
      developer: { select: { name: true, active: true } },
      roles: {
        select: {
          role: {
            select: {
              name: true,
              isAdmin: true,
              canViewTimeline: true,
              canViewTracker: true,
              canViewTeam: true,
            },
          },
        },
      },
    },
  });

  const valid = member != null && member.developer.active;
  const roles = member?.roles.map((r) => r.role) ?? [];
  const admin = roles.some((r) => r.isAdmin);

  // What they will actually be able to open: the project's tools, narrowed to
  // what any one of their roles can see.
  const opens = ROLE_VIEWS.filter(
    (view) =>
      member?.project[view.tool] &&
      (admin || roles.some((role) => role[view.key]))
  ).map((view) => view.label);

  return (
    <div className="thin-scroll flex flex-1 flex-col overflow-y-auto bg-[var(--plane)]">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6 shadow-sm">
          {!valid ? (
            <>
              <h1 className="mb-1 text-lg font-semibold tracking-tight">
                This link no longer works
              </h1>
              <p className="text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
                It was either replaced by a newer one or switched off. Ask
                whoever runs the project for a fresh link.
              </p>
              <Link href="/" className="btn-secondary mt-5 inline-block">
                Back to the start
              </Link>
            </>
          ) : (
            <>
              <p className="field-label">You’re invited</p>
              <h1 className="mt-1 text-lg font-semibold tracking-tight">
                {member.project.name}
              </h1>
              {member.project.description && (
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
                  {member.project.description}
                </p>
              )}

              <dl className="mt-5 flex flex-col gap-3 border-t border-[var(--hairline)] pt-4">
                <div>
                  <dt className="field-label">Going in as</dt>
                  <dd className="mt-0.5 text-[0.8125rem]">
                    {member.developer.name}
                  </dd>
                </div>
                <div>
                  <dt className="field-label">
                    {roles.length === 1 ? "Role" : "Roles"}
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1">
                    {roles.length === 0 ? (
                      <span className="text-[0.8125rem] text-[var(--ink-muted)]">
                        No role yet — you’ll see the project card only.
                      </span>
                    ) : (
                      roles.map((role) => (
                        <span
                          key={role.name}
                          className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--accent)]"
                        >
                          {role.name}
                        </span>
                      ))
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="field-label">You’ll be able to open</dt>
                  <dd className="mt-0.5 text-[0.8125rem] text-[var(--ink-secondary)]">
                    {["Overview", ...opens].join(" · ")}
                  </dd>
                </div>
              </dl>

              <AcceptInvite token={token} projectName={member.project.name} />

              <p className="mt-3 text-[0.6875rem] leading-relaxed text-[var(--ink-muted)]">
                No password and no account: the link is what lets you in, and it
                can be replaced or switched off at any time.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

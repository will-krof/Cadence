import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AcceptInvite } from "@/components/AcceptInvite";
import { INVITE_DAYS, inviteHasExpired } from "@/lib/invite";
import { ROLE_TOOLS, accessOf } from "@/lib/types";

export const metadata: Metadata = { title: "You're invited — Cadence" };

/**
 * What an invite link opens: the project it is for, the roles it carries, and a
 * form to pick the username and password that will get them in from now on.
 * Setting the login up is a POST rather than the link itself, so a mail client
 * fetching the URL can't spend the invite on the recipient's behalf.
 */
export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;

  const member = await prisma.projectMember.findFirst({
    where: { inviteToken: token, inviteRevoked: false },
    select: {
      inviteExpiresAt: true,
      project: {
        select: {
          name: true,
          description: true,
          hasTimeline: true,
          hasTracker: true,
          hasWiki: true,
        },
      },
      developer: { select: { name: true, active: true, username: true } },
      roles: {
        select: {
          role: {
            select: {
              name: true,
              isAdmin: true,
              canViewTimeline: true,
              canEditTimeline: true,
              canViewTracker: true,
              canEditTracker: true,
              canViewTeam: true,
              canEditTeam: true,
              canViewWiki: true,
              canEditWiki: true,
            },
          },
        },
      },
    },
  });

  const live = member != null && member.developer.active;
  const expired = live && inviteHasExpired(member.inviteExpiresAt);
  const alreadySetUp = live && member.developer.username != null;
  const roles = member?.roles.map((r) => r.role) ?? [];
  const admin = roles.some((r) => r.isAdmin);

  // What they will actually be able to open: the project's tools, narrowed to
  // what any one of their roles can see.
  // The roster has no project toggle — every project has people — so a tool
  // without one only has to clear the role. What they may *do* with it comes
  // along: being able to change something is worth knowing before you accept.
  const opens = ROLE_TOOLS.filter(
    (tool) => tool.tool == null || member?.project[tool.tool]
  )
    .map((tool) => {
      const access = admin
        ? "edit"
        : roles.reduce<"none" | "view" | "edit">((best, role) => {
            const here = accessOf(role, tool);
            if (here === "edit" || best === "edit") return "edit";
            return here === "view" || best === "view" ? "view" : "none";
          }, "none");
      return access === "none"
        ? null
        : `${tool.label}${access === "edit" ? "" : " (view only)"}`;
    })
    .filter((label): label is string => label != null);

  return (
    <div className="schematic thin-scroll flex flex-1 flex-col overflow-y-auto bg-[var(--plane)]">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/">
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-start justify-center px-5 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-6 shadow-sm">
          {!live || expired ? (
            <>
              <h1 className="mb-1 text-lg font-semibold tracking-tight">
                {expired ? "This link has expired" : "This link no longer works"}
              </h1>
              <p className="text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
                {expired
                  ? `Invite links last ${INVITE_DAYS} days. A fresh one has taken its place — ask whoever runs the project to send it over.`
                  : "It was either replaced by a newer one or switched off. Ask whoever runs the project for a fresh link."}
              </p>
              <Link href="/" className="btn-secondary mt-5 inline-block">
                Back to the start
              </Link>
            </>
          ) : alreadySetUp ? (
            <>
              <h1 className="mb-1 text-lg font-semibold tracking-tight">
                You already have a login
              </h1>
              <p className="text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
                This link set up your username and password once already. Sign in
                with them to reach {member.project.name}.
              </p>
              <Link href="/login" className="btn-primary mt-5 inline-block">
                Log in
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

              <dl className="mt-5 flex flex-col gap-3 border-y border-[var(--hairline)] py-4">
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

              <AcceptInvite
                token={token}
                projectName={member.project.name}
                suggestedUsername={suggestUsername(member.developer.name)}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/** A first guess at a username, from the name the roster already knows. */
function suggestUsername(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 32);
}

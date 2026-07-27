import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getViewer, memberProjectIds } from "@/lib/viewer";
import { developerScope } from "@/lib/api-auth";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProfileResume, ResumeProject } from "@/components/ProfileResume";
import { ShareProfile } from "@/components/ShareProfile";
import { EmploymentType } from "@/lib/types";

// A profile is nobody's business but the team's, so it stays out of indexes.
export const metadata: Metadata = {
  title: "Profile — Cadence",
  robots: { index: false, follow: false },
};

/**
 * One person's profile, at an address that can be passed around.
 *
 * The link is not a key. Reading it takes a session and a project shared with
 * the person — any role will do — and anybody else is told the page doesn't
 * exist, which is also what somebody guessing ids is told. What the page shows
 * follows the same line as the API: colleagues see the working half of a
 * profile, the workspace's owner sees all of it.
 */
export default async function ProfilePage({
  params,
}: PageProps<"/people/[id]">) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const { id } = await params;
  const isOwner = viewer.kind === "owner";
  // A member sees this person through the projects they have in common; the
  // owner sees the workspace, so every project counts.
  const shared = isOwner ? null : memberProjectIds(viewer);

  // `developerScope` is the same rule the roster endpoint reads by: the owner's
  // whole workspace, or the people a member shares a project with — themselves
  // included, since they are on their own projects. Asking it here rather than
  // in a check of its own means one query, and one place where the rule lives.
  const person = await prisma.developer.findFirst({
    where: { id, ...developerScope(viewer) },
    select: {
      id: true,
      name: true,
      role: true,
      color: true,
      active: true,
      currency: true,
      employmentType: true,
      // The private half travels only when the viewer is the owner.
      email: isOwner,
      phone: isOwner,
      startDate: isOwner,
      salary: isOwner,
      notes: isOwner,
      memberships: {
        where: shared ? { projectId: { in: shared } } : undefined,
        select: {
          project: { select: { id: true, name: true } },
          developer: { select: { username: true } },
          roles: { select: { role: { select: { id: true, name: true } } } },
        },
      },
      tasks: {
        where: shared ? { projectId: { in: shared } } : undefined,
        select: {
          id: true,
          title: true,
          status: true,
          endDate: true,
          project: { select: { id: true, name: true } },
        },
        orderBy: { endDate: "asc" },
      },
    },
  });
  if (!person) notFound();

  const projects: ResumeProject[] = person.memberships.map((m) => ({
    id: m.project.id,
    name: m.project.name,
    roles: m.roles.map((r) => r.role),
    viaTasks: false,
    hasLogin: m.developer.username != null,
  }));
  const named = new Set(projects.map((p) => p.id));
  for (const task of person.tasks) {
    if (named.has(task.project.id)) continue;
    named.add(task.project.id);
    projects.push({
      id: task.project.id,
      name: task.project.name,
      roles: [],
      viaTasks: true,
      hasLogin: false,
    });
  }

  return (
    <div className="thin-scroll flex flex-1 flex-col overflow-y-auto bg-[var(--plane)]">
      <header className="flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link href="/app">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/app" className="btn-secondary">
            Open app
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="w-full px-5 pb-12 sm:px-8">
        <ProfileResume
          person={{
            name: person.name,
            role: person.role,
            color: person.color,
            active: person.active,
            currency: person.currency,
            employmentType: person.employmentType as EmploymentType | null,
            email: person.email ?? null,
            phone: person.phone ?? null,
            startDate: person.startDate
              ? person.startDate.toISOString()
              : null,
            salary: person.salary ?? null,
            notes: person.notes ?? null,
          }}
          projects={projects}
          tasks={person.tasks.map((task) => ({
            ...task,
            endDate: task.endDate.toISOString(),
          }))}
          showPrivate={isOwner}
          actions={<ShareProfile developerId={person.id} />}
        />
      </main>
    </div>
  );
}

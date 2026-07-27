import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = { title: "Cadence — Timeline & Tracker" };

export default async function AppPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  // A team member gets the same app, narrowed to the projects they are on and
  // the roles they hold — there is no separate, lesser view to keep in step.
  if (viewer.kind === "member") {
    return (
      <AppShell
        member={{
          name: viewer.developerName,
          username: viewer.username,
          places: viewer.places.map((p) => ({
            projectId: p.projectId,
            roleIds: p.roleIds,
          })),
        }}
      />
    );
  }

  // The account's own role travels with it: a superadmin's sidebar carries the
  // install's counts, and nothing else about the app changes.
  return <AppShell user={viewer.user} />;
}

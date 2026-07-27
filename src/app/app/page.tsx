import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = { title: "Cadence — Timeline & Tracker" };

export default async function AppPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  // An invited guest gets the same app, narrowed to their project and their
  // roles — there is no separate, lesser view to keep in step.
  if (viewer.kind === "guest") {
    return (
      <AppShell
        guest={{
          name: viewer.developerName,
          projectId: viewer.projectId,
          roleIds: viewer.roleIds,
        }}
      />
    );
  }

  return <AppShell user={viewer.user} />;
}

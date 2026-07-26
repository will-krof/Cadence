import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = { title: "Cadence — Timeline & Tracker" };

export default async function AppPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return <AppShell user={user} />;
}

import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Log in — Cadence" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold tracking-tight">Welcome back</h1>
      <p className="mb-5 text-[0.8125rem] text-[var(--ink-secondary)]">
        Log in to your workspace.
      </p>
      <AuthForm />
    </>
  );
}

import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign up — Cadence" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold tracking-tight">
        Create your account
      </h1>
      <p className="mb-5 text-[0.8125rem] text-[var(--ink-secondary)]">
        Your own projects, tasks and developer roster.
      </p>
      <AuthForm mode="signup" />
    </>
  );
}

import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign up — Cadence" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-1 text-lg font-semibold tracking-tight">
        Create your workspace
      </h1>
      <p className="mb-5 text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
        Your own projects, roster and invite links. You are the admin of it, and
        nobody sees any of it until you hand out a link.
      </p>
      <AuthForm mode="signup" />
    </>
  );
}

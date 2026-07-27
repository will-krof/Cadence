"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";

/**
 * Logging in, and only logging in. Accounts aren't self-served: team members get
 * their login from an invite link, so there is nothing to sign up for. One field
 * takes either — a workspace email, or a member's username.
 */
export function AuthForm() {
  const router = useRouter();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        setPending(false);
        return;
      }

      router.push("/app");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <Field label="Email or username">
        <input
          autoFocus
          required
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          className="input"
          placeholder="you@example.com or alex.ivanenko"
          autoComplete="username"
        />
      </Field>

      <Field label="Password">
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          placeholder="Your password"
          autoComplete="current-password"
        />
      </Field>

      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-[#d03b3b]/30 bg-[#d03b3b]/10 px-3 py-2 text-[0.75rem] text-[#d03b3b]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary mt-1 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Log in"}
      </button>

      <p className="mt-1 text-center text-[0.75rem] leading-relaxed text-[var(--ink-secondary)]">
        Been sent an invite link? Open it to pick your username and password —
        it works for three days.
      </p>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";

/**
 * What an invite link is spent on: the username and password that will get this
 * person in from now on. The link only lasts three days; the login it sets up
 * lasts as long as they are on the project.
 */
export function AcceptInvite({
  token,
  projectName,
  suggestedUsername,
}: {
  token: string;
  projectName: string;
  /** A first guess from their name, which they are free to change. */
  suggestedUsername: string;
}) {
  const router = useRouter();
  const [username, setUsername] = useState(suggestedUsername);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not set your login up. Try again.");
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
    <form onSubmit={submit} className="mt-5 flex flex-col gap-3.5">
      <p className="text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
        Pick a username and a password. That is how you’ll sign in to{" "}
        {projectName} after this.
      </p>

      <Field label="Username">
        <input
          autoFocus
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input"
          placeholder="alex.ivanenko"
          autoComplete="username"
          minLength={3}
          maxLength={32}
        />
      </Field>

      <Field label="Password">
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
        />
      </Field>

      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-[0.75rem] text-[var(--danger)]"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || username.trim().length < 3 || password.length < 8}
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Setting up…" : `Create login and open ${projectName}`}
      </button>

      <p className="text-[0.6875rem] leading-relaxed text-[var(--ink-muted)]">
        Letters, digits, dots, dashes or underscores in a username. This link
        works for three days and can only set a login up once.
      </p>
    </form>
  );
}

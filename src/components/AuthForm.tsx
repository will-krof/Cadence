"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Field } from "@/components/ui";

/**
 * What the form can tell before asking the server. The rules match the ones the
 * server keeps — an account is an email, a member's login is a username of
 * letters, digits, dots, dashes or underscores — so a typo is answered here
 * instead of coming back as "incorrect username or password".
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9._-]{3,32}$/i;
const MIN_PASSWORD_LENGTH = 8;

function loginProblem(value: string): string | null {
  const login = value.trim();
  if (!login) return "Enter your email or username";
  if (login.includes("@")) {
    return EMAIL.test(login) ? null : "That doesn’t look like an email address";
  }
  if (login.length < 3) return "A username is at least 3 characters";
  if (login.length > 32) return "A username is 32 characters or fewer";
  return USERNAME.test(login)
    ? null
    : "Usernames use letters, digits, dots, dashes or underscores";
}

function emailProblem(value: string): string | null {
  const email = value.trim();
  if (!email) return "Enter your email";
  if (email.length > 200) return "That email is too long";
  return EMAIL.test(email) ? null : "That doesn’t look like an email address";
}

function passwordProblem(value: string, signingUp: boolean): string | null {
  if (!value) return "Enter your password";
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Passwords are at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (signingUp && value.length > 200) return "That password is too long";
  return null;
}

/**
 * Signing in, and signing up. An account is a workspace of its own, so the two
 * are the same shape of thing; a team member invited to somebody else's project
 * signs in here too, with the username their invite link set up.
 */
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const signingUp = mode === "signup";

  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // A field says what's wrong once it has been left, or once the button was
  // pressed — not while somebody is halfway through typing it.
  const [shown, setShown] = useState({
    login: false,
    password: false,
    confirm: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const problems = {
    login: signingUp ? emailProblem(login) : loginProblem(login),
    password: passwordProblem(password, signingUp),
    confirm:
      signingUp && confirm !== password ? "Both passwords have to match" : null,
  };
  const valid = !problems.login && !problems.password && !problems.confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShown({ login: true, password: true, confirm: true });
    if (!valid) return;

    setError(null);
    setPending(true);

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          signingUp
            ? { email: login.trim(), password, name: name.trim() }
            : { login: login.trim(), password }
        ),
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
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3.5">
      {signingUp && (
        <Field label="Name (optional)">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Alex Ivanenko"
            autoComplete="name"
            maxLength={120}
          />
        </Field>
      )}

      <Field label={signingUp ? "Email" : "Email or username"}>
        <input
          autoFocus
          type={signingUp ? "email" : "text"}
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          onBlur={() => setShown((s) => ({ ...s, login: true }))}
          className="input"
          placeholder={
            signingUp ? "you@example.com" : "you@example.com or alex.ivanenko"
          }
          autoComplete={signingUp ? "email" : "username"}
          aria-invalid={shown.login && problems.login != null}
        />
        <FieldProblem show={shown.login}>{problems.login}</FieldProblem>
      </Field>

      <Field label="Password">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setShown((s) => ({ ...s, password: true }))}
          className="input"
          placeholder={signingUp ? "At least 8 characters" : "Your password"}
          autoComplete={signingUp ? "new-password" : "current-password"}
          aria-invalid={shown.password && problems.password != null}
        />
        <FieldProblem show={shown.password}>{problems.password}</FieldProblem>
      </Field>

      {signingUp && (
        <Field label="Password again">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setShown((s) => ({ ...s, confirm: true }))}
            className="input"
            placeholder="The same password"
            autoComplete="new-password"
            aria-invalid={shown.confirm && problems.confirm != null}
          />
          <FieldProblem show={shown.confirm}>{problems.confirm}</FieldProblem>
        </Field>
      )}

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
        disabled={pending}
        className="btn-primary mt-1 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending
          ? signingUp
            ? "Creating your workspace…"
            : "Signing in…"
          : signingUp
            ? "Create workspace"
            : "Log in"}
      </button>

      <p className="mt-1 text-center text-[0.75rem] leading-relaxed text-[var(--ink-secondary)]">
        {signingUp ? "Already have an account? " : "Need a workspace of your own? "}
        <Link
          href={signingUp ? "/login" : "/signup"}
          className="font-medium text-[var(--accent)] hover:underline"
        >
          {signingUp ? "Log in" : "Sign up"}
        </Link>
      </p>

      {!signingUp && (
        <p className="text-center text-[0.75rem] leading-relaxed text-[var(--ink-muted)]">
          Been sent an invite link? Open it to pick your username and password —
          it works for three days.
        </p>
      )}
    </form>
  );
}

function FieldProblem({
  show,
  children,
}: {
  show: boolean;
  children: string | null;
}) {
  if (!show || !children) return null;
  return (
    <span role="alert" className="text-[0.6875rem] text-[var(--danger)]">
      {children}
    </span>
  );
}

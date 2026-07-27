"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

function passwordProblem(value: string): string | null {
  if (!value) return "Enter your password";
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Passwords are at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

/**
 * Logging in, and only logging in. Accounts aren't self-served: team members get
 * their login from an invite link, so there is nothing to sign up for. One field
 * takes either — a workspace email, or a member's username.
 */
export function AuthForm() {
  const router = useRouter();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  // A field says what's wrong once it has been left, or once Log in was
  // pressed — not while somebody is halfway through typing it.
  const [shown, setShown] = useState({ login: false, password: false });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const problems = {
    login: loginProblem(login),
    password: passwordProblem(password),
  };
  const valid = !problems.login && !problems.password;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShown({ login: true, password: true });
    if (!valid) return;

    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: login.trim(), password }),
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
      <Field label="Email or username">
        <input
          autoFocus
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          onBlur={() => setShown((s) => ({ ...s, login: true }))}
          className="input"
          placeholder="you@example.com or alex.ivanenko"
          autoComplete="username"
          aria-invalid={shown.login && problems.login != null}
          aria-describedby={
            shown.login && problems.login ? "login-problem" : undefined
          }
        />
        <FieldProblem id="login-problem" show={shown.login}>
          {problems.login}
        </FieldProblem>
      </Field>

      <Field label="Password">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setShown((s) => ({ ...s, password: true }))}
          className="input"
          placeholder="Your password"
          autoComplete="current-password"
          aria-invalid={shown.password && problems.password != null}
          aria-describedby={
            shown.password && problems.password ? "password-problem" : undefined
          }
        />
        <FieldProblem id="password-problem" show={shown.password}>
          {problems.password}
        </FieldProblem>
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

function FieldProblem({
  id,
  show,
  children,
}: {
  id: string;
  show: boolean;
  children: string | null;
}) {
  if (!show || !children) return null;
  return (
    <span id={id} role="alert" className="text-[0.6875rem] text-[#d03b3b]">
      {children}
    </span>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui";
import { useFeedback } from "@/components/Feedback";

/** Who the signed-in account is, whichever of the two kinds it is. */
export interface Account {
  kind: "owner" | "member";
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  /** The account's own standing: ADMIN, SUPERADMIN, or null for a member. */
  role: "ADMIN" | "SUPERADMIN" | null;
  createdAt: string;
  /** A member's roles, project by project. Empty for an owner. */
  places: { projectId: string; project: string; roles: string[] }[];
}

/**
 * Your own profile: what you are called, how you sign in, what you are, and
 * when you joined — with the things you can change about it, and the way out.
 */
export function AccountPanel() {
  const router = useRouter();
  const { notify } = useFeedback();
  const [signingOut, setSigningOut] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [failed, setFailed] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account");
        if (!res.ok) throw new Error("failed");
        const data: Account = await res.json();
        if (cancelled) return;
        setAccount(data);
        setName(data.name ?? "");
        setEmail(data.email ?? "");
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;

    // Only what changed travels, so saving a name never asks about a password.
    const patch: Record<string, string> = {};
    if (name.trim() !== (account.name ?? "")) patch.name = name.trim();
    if (account.kind === "owner" && email.trim() !== (account.email ?? "")) {
      patch.email = email.trim();
    }
    if (newPassword) {
      patch.newPassword = newPassword;
      patch.currentPassword = currentPassword;
    }
    if (Object.keys(patch).length === 0) {
      notify("success", "Nothing to change.");
      return;
    }

    setPending(true);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setPending(false);

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: null }));
      notify("error", error ?? "Could not save that.");
      return;
    }
    const saved: Account = await res.json();
    setAccount({ ...account, ...saved });
    setCurrentPassword("");
    setNewPassword("");
    notify("success", "Your profile is saved.");
  }

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-5 sm:p-6">
      {failed && (
        <p className="text-[0.8125rem] text-[var(--ink-muted)]">
          Couldn’t load your profile.
        </p>
      )}
      {!failed && !account && (
        <p className="text-[0.8125rem] text-[var(--ink-muted)]">Loading…</p>
      )}

      {account && (
        <form className="flex flex-col gap-3.5" onSubmit={save}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[var(--radius)] border border-[var(--hairline)] p-3">
            <Fact label="Signing in as">
              {account.kind === "owner" ? account.email : account.username ?? "—"}
            </Fact>
            <Fact label="You are">
              <span className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--accent)]">
                {account.role === "SUPERADMIN"
                  ? "Superadmin"
                  : account.role === "ADMIN"
                    ? "Workspace admin"
                    : "Team member"}
              </span>
            </Fact>
            <Fact label="Joined">
              {new Date(account.createdAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </Fact>
          </div>

          {/* A member's standing is not one word: it is what they hold, project
              by project, and it is the workspace's to give rather than theirs
              to change. */}
          {account.kind === "member" && account.places.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <span className="field-label">Your roles</span>
              {account.places.map((place) => (
                <div
                  key={place.projectId}
                  className="flex flex-wrap items-center gap-2 text-[0.8125rem]"
                >
                  <span className="min-w-0 flex-1 truncate">{place.project}</span>
                  {place.roles.length === 0 ? (
                    <span className="text-[0.75rem] text-[var(--ink-muted)]">
                      No role yet
                    </span>
                  ) : (
                    place.roles.map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.625rem] uppercase tracking-wide text-[var(--accent)]"
                      >
                        {role}
                      </span>
                    ))
                  )}
                </div>
              ))}
            </section>
          )}

          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="What you are called"
            />
          </Field>

          {account.kind === "owner" && (
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
            </Field>
          )}

          <fieldset className="flex flex-col gap-3.5 border-t border-[var(--hairline)] pt-3">
            <legend className="field-label mb-1.5">Change your password</legend>
            <div className="flex flex-col gap-3.5 sm:flex-row">
              <Field label="Current password" className="flex-1">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="input"
                  autoComplete="current-password"
                  placeholder="Leave blank to keep it"
                />
              </Field>
              <Field label="New password" className="flex-1">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                />
              </Field>
            </div>
          </fieldset>

          <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="btn-secondary mr-auto"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="field-label">{label}</span>
      <span className="text-[0.8125rem]">{children}</span>
    </span>
  );
}

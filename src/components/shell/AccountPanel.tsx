"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Modal } from "@/components/ui";
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

function standing(account: Account) {
  if (account.role === "SUPERADMIN") return "Superadmin";
  if (account.role === "ADMIN") return "Workspace admin";
  return "Team member";
}

/**
 * Your own profile: what you are called, how you sign in, what you are, and
 * when you joined — with the things you can change about it, and the ways out.
 *
 * Laid out as a few plain sections under one heading each, rather than as a
 * single form of stacked boxes: what somebody came here to change is nearly
 * always one of them, and a screen reads faster when its parts are named.
 */
export function AccountPanel() {
  const router = useRouter();
  const { notify } = useFeedback();
  const [signingOut, setSigningOut] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);

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

  if (failed) {
    return (
      <p className="t-body text-[var(--ink-muted)]">Couldn’t load your profile.</p>
    );
  }
  if (!account) {
    return <p className="t-body text-[var(--ink-muted)]">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Who you are here, as three plain facts rather than a boxed panel. */}
      <section className="card flex flex-wrap gap-x-10 gap-y-4 p-4 sm:p-5">
        <Fact label="Signing in as">
          {account.kind === "owner" ? account.email : account.username ?? "—"}
        </Fact>
        <Fact label="You are">
          <span className="chip chip-accent">{standing(account)}</span>
        </Fact>
        <Fact label="Joined">
          {new Date(account.createdAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </Fact>
      </section>

      {/* A member's standing is not one word: it is what they hold, project by
          project, and it is the workspace's to give rather than theirs to
          change. */}
      {account.kind === "member" && account.places.length > 0 && (
        <Section
          title="Your roles"
          hint="What each project lets you do. Ask whoever runs the project to change it."
        >
          <ul className="flex flex-col">
            {account.places.map((place) => (
              <li
                key={place.projectId}
                className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline)] py-2.5 last:border-b-0"
              >
                <span className="t-body min-w-0 flex-1 truncate">
                  {place.project}
                </span>
                {place.roles.length === 0 ? (
                  <span className="t-micro">No role yet</span>
                ) : (
                  place.roles.map((role) => (
                    <span key={role} className="chip chip-accent">
                      {role}
                    </span>
                  ))
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <form className="flex flex-col gap-8" onSubmit={save}>
        <Section title="Details" hint="What you are called around the workspace.">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Name" className="flex-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="What you are called"
              />
            </Field>
            {account.kind === "owner" && (
              <Field label="Email" className="flex-1">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                />
              </Field>
            )}
          </div>
        </Section>

        <Section
          title="Password"
          hint="Leave both blank to keep the one you have."
        >
          <div className="flex flex-col gap-4 sm:flex-row">
            <Field label="Current password" className="flex-1">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
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
        </Section>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--hairline)] pt-5">
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="btn-secondary mr-auto"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>

      {/* The way out that doesn't come back. Kept apart from everything above,
          and behind a window that says what goes. */}
      <section className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[var(--danger-wash)] p-4 sm:p-5">
        <h2 className="t-heading" style={{ color: "var(--danger)" }}>
          Close your account
        </h2>
        <p className="t-small mt-1.5 max-w-prose">
          {account.kind === "owner"
            ? "This deletes your workspace and everything in it — every project, every task, the whole team roster — for good. It cannot be undone."
            : "This removes the login you set up. Your profile stays with the workspace; you just won’t be able to sign in with it again."}
        </p>
        <button
          type="button"
          onClick={() => setClosing(true)}
          className="btn-danger mt-4"
        >
          {account.kind === "owner" ? "Delete my account" : "Remove my login"}
        </button>
      </section>

      {closing && (
        <CloseAccountDialog
          account={account}
          onClose={() => setClosing(false)}
          onDone={() => {
            router.push("/");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * The warning before an account goes. It asks for the password, and — when
 * what is being deleted is a whole workspace — for the email typed out, so
 * that ending a company's projects takes more than one click on the way past.
 */
function CloseAccountDialog({
  account,
  onClose,
  onDone,
}: {
  account: Account;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useFeedback();
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  const owner = account.kind === "owner";
  // Only a workspace asks to be spelled out; a login is one person's own way in.
  const mustType = owner ? account.email ?? "" : null;
  const ready =
    password.length > 0 && (!mustType || typed.trim() === mustType);

  async function remove() {
    setPending(true);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setPending(false);

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: null }));
      notify("error", error ?? "Could not close the account.");
      return;
    }
    onDone();
  }

  return (
    <Modal
      onClose={onClose}
      title={owner ? "Delete your account" : "Remove your login"}
    >
      <div className="flex flex-col gap-4">
        <p className="t-body leading-relaxed">
          {owner
            ? "Everything in this workspace goes with it."
            : "You will be signed out and won’t be able to sign back in."}
        </p>

        {owner && (
          <ul className="flex flex-col gap-1 rounded-[var(--radius)] bg-[var(--danger-wash)] p-3">
            {[
              "Every project, with its timeline and tracker",
              "Every task, subtask and its history",
              "The whole team roster, and every invite link",
            ].map((line) => (
              <li key={line} className="t-small flex items-start gap-2">
                <span aria-hidden="true" style={{ color: "var(--danger)" }}>
                  ×
                </span>
                {line}
              </li>
            ))}
          </ul>
        )}

        <p className="t-small">
          {owner
            ? "This cannot be undone, and there is no copy kept."
            : "Whoever runs the workspace can invite you again later."}
        </p>

        <Field label="Your password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete="current-password"
            autoFocus
          />
        </Field>

        {mustType && (
          <Field label={`Type ${mustType} to confirm`}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="input"
              autoComplete="off"
              spellCheck={false}
              placeholder={mustType}
            />
          </Field>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={!ready || pending}
            className="btn-danger"
          >
            {pending
              ? "Deleting…"
              : owner
                ? "Delete everything"
                : "Remove my login"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** A named group of fields, with room to say what it is for. */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="t-heading">{title}</h2>
        {hint && <p className="t-small mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
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
    <span className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      <span className="t-body">{children}</span>
    </span>
  );
}

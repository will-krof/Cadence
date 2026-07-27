"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ShellMember, ShellUser } from "@/components/AppShell";

export function AccountMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const label = user.name?.trim() || user.email;
  const initial = label.slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-[0.75rem] font-semibold text-white transition hover:opacity-85"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={label}
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-56 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1.5 shadow-xl"
        >
          <div className="border-b border-[var(--hairline)] px-2.5 pb-2 pt-1.5">
            {user.name && (
              <p className="truncate text-[0.8125rem] font-medium">{user.name}</p>
            )}
            <p className="truncate text-[0.75rem] text-[var(--ink-muted)]">
              {user.email}
            </p>
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            role="menuitem"
            className="mt-1 w-full rounded-[var(--radius)] px-2.5 py-2 text-left text-[0.8125rem] text-[var(--ink-secondary)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)] disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Who a signed-in team member is, and the way out. */
export function MemberMenu({ member }: { member: ShellMember }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-full border border-[var(--hairline)] px-2.5 text-[0.75rem] font-medium transition hover:bg-[var(--plane)]"
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${member.name} — team member`}
      >
        <span className="truncate">{member.name}</span>
        <span className="text-[0.625rem] uppercase tracking-wide text-[var(--ink-muted)]">
          Member
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-50 w-60 rounded-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-1.5 shadow-xl"
        >
          <div className="border-b border-[var(--hairline)] px-2.5 pb-2 pt-1.5">
            <p className="truncate text-[0.8125rem] font-medium">{member.name}</p>
            <p className="truncate text-[0.75rem] text-[var(--ink-muted)]">
              {member.username ?? "Team member"}
            </p>
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            role="menuitem"
            className="mt-1 w-full rounded-[var(--radius)] px-2.5 py-2 text-left text-[0.8125rem] text-[var(--ink-secondary)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)] disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

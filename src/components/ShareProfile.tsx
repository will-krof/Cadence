"use client";

import { useEffect, useState } from "react";

/**
 * Copies a link to this person's profile.
 *
 * The link is an address, not a key: it carries no token, and opening it proves
 * nothing. Whoever follows it has to be signed in and has to share a project
 * with the person, whatever role they hold there — the page itself decides
 * that, and answers a 404 to anybody else. So passing the link on can widen who
 * knows the address, never who can read the profile.
 */
export function ShareProfile({ developerId }: { developerId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2_500);
    return () => clearTimeout(timer);
  }, [state]);

  async function share() {
    const url = `${window.location.origin}/people/${developerId}`;
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      onClick={share}
      className="btn-secondary flex items-center gap-1.5"
      title="Copy a link to this profile — only people who share a project with them can open it"
    >
      <LinkIcon />
      {state === "copied"
        ? "Link copied"
        : state === "failed"
          ? "Couldn’t copy"
          : "Share"}
    </button>
  );
}

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1A2.5 2.5 0 014.5 9l1-1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

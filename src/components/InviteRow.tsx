"use client";

import { useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { formatDay } from "@/lib/dates";
import { Developer, Invite, inviteLink } from "@/lib/types";

/**
 * How long a link has left, in the words an admin would use. Rounded down, so
 * "2 days" is never a day-and-a-half dressed up as more than it is.
 */
function expiryNote(expiresAt: string | null) {
  if (!expiresAt) return null;
  const left = new Date(expiresAt).getTime() - Date.now();
  if (left <= 0) return "expired";
  const days = Math.floor(left / (24 * 60 * 60 * 1000));
  if (days === 0) return "expires within a day";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

/**
 * Someone's way into the project: one link, which they spend on picking a
 * username and a password. It lasts three days, and it can be replaced — which
 * kills the one they have — or switched off. Once they have a login of their
 * own, the link has done its job and there is nothing left to hand out.
 */
export function InviteRow({
  person,
  invite,
  hasLogin,
  onRotate,
  onRevoke,
}: {
  person: Developer;
  invite: Invite | null;
  /** They have already set their username and password up through the link. */
  hasLogin: boolean;
  onRotate: () => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const { confirm, notify } = useFeedback();
  const [pending, setPending] = useState<"rotate" | "revoke" | null>(null);

  const link = invite?.token ? inviteLink(invite.token) : null;
  const note = expiryNote(invite?.expiresAt ?? null);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      notify("success", "Invite link copied.");
    } catch {
      notify("error", "Could not copy — select the link and copy it by hand.");
    }
  }

  async function rotate() {
    if (link) {
      const ok = await confirm({
        title: `Replace ${person.name}’s invite link?`,
        body: "The link they have stops working straight away, and they'll need the new one to set their login up.",
        confirmLabel: "Replace link",
        destructive: true,
      });
      if (!ok) return;
    }
    setPending("rotate");
    await onRotate();
    setPending(null);
  }

  async function revoke() {
    const ok = await confirm({
      title: `Switch off ${person.name}’s invite link?`,
      body: "Nobody can use it to set a login up. They stay on the project, and their tasks are untouched.",
      confirmLabel: "Switch off",
      destructive: true,
    });
    if (!ok) return;
    setPending("revoke");
    await onRevoke();
    setPending(null);
  }

  // A login of their own makes the link beside the point: they sign in with it,
  // and taking them off the project is what ends their access.
  if (hasLogin) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-2">
        <span className="field-label shrink-0">Login</span>
        <span className="min-w-0 flex-1 text-[0.75rem] text-[var(--ink-secondary)]">
          Set up
          {person.username && (
            <span className="ml-1 font-mono text-[0.6875rem] text-[var(--ink-muted)]">
              {person.username}
            </span>
          )}
          {invite?.usedAt && (
            <span className="ml-1 text-[var(--ink-muted)]">
              · {formatDay(invite.usedAt)}
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--hairline)] pt-2">
      <span className="field-label shrink-0">Invite link</span>

      {link ? (
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="input min-w-0 flex-1 !py-1 font-mono text-[0.6875rem]"
          aria-label={`Invite link for ${person.name}`}
        />
      ) : (
        <span className="min-w-0 flex-1 text-[0.75rem] text-[var(--ink-muted)]">
          {invite?.revoked
            ? "Switched off — make a new one to let them set a login up."
            : "No link yet."}
        </span>
      )}

      <span className="flex shrink-0 items-center gap-1.5">
        {link && (
          <button onClick={copy} className="btn-secondary !px-2 !py-1">
            Copy
          </button>
        )}
        <button
          onClick={rotate}
          disabled={pending !== null}
          className="btn-secondary !px-2 !py-1 disabled:opacity-50"
        >
          {pending === "rotate" ? "Working…" : link ? "Regenerate" : "New link"}
        </button>
        {link && (
          <button
            onClick={revoke}
            disabled={pending !== null}
            className="btn-secondary !px-2 !py-1 !text-[#d03b3b] disabled:opacity-50"
          >
            {pending === "revoke" ? "Working…" : "Switch off"}
          </button>
        )}
      </span>

      {link && note && (
        <span className="w-full text-[0.625rem] text-[var(--ink-muted)]">
          Good for three days — {note}. It sets their login up once, then a fresh
          link takes over.
        </span>
      )}
    </div>
  );
}

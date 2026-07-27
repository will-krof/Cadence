"use client";

import { useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { formatDay } from "@/lib/dates";
import { Developer, Invite, inviteLink } from "@/lib/types";

/**
 * Someone's way into the project: one link, which carries whatever their roles
 * carry. It can be replaced — which kills the one they have — or switched off.
 */
export function InviteRow({
  person,
  invite,
  onRotate,
  onRevoke,
}: {
  person: Developer;
  invite: Invite | null;
  onRotate: () => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const { confirm, notify } = useFeedback();
  const [pending, setPending] = useState<"rotate" | "revoke" | null>(null);

  const link = invite?.token ? inviteLink(invite.token) : null;

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
        body: "The link they have stops working straight away, and they'll need the new one to get back in.",
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
      body: "They lose access to this project until you give them a new link. They stay on the project, and their tasks are untouched.",
      confirmLabel: "Switch off",
      destructive: true,
    });
    if (!ok) return;
    setPending("revoke");
    await onRevoke();
    setPending(null);
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
            ? "Switched off — make a new one to let them back in."
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

      {invite?.usedAt && link && (
        <span className="w-full text-[0.625rem] text-[var(--ink-muted)]">
          First opened {formatDay(invite.usedAt)}.
        </span>
      )}
    </div>
  );
}

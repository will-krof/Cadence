"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** The one button on the invite page: take the link up and go in. */
export function AcceptInvite({
  token,
  projectName,
}: {
  token: string;
  projectName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not open the project. Try again.");
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
    <div className="mt-5 flex flex-col gap-2">
      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius)] border border-[#d03b3b]/30 bg-[#d03b3b]/10 px-3 py-2 text-[0.75rem] text-[#d03b3b]"
        >
          {error}
        </p>
      )}
      <button
        onClick={accept}
        disabled={pending}
        className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Opening…" : `Open ${projectName}`}
      </button>
    </div>
  );
}

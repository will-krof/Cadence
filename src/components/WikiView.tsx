"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { Project, WikiPage } from "@/lib/types";
import { LIMITS } from "@/lib/sanitize";

/**
 * The project's wiki: what a team needs written down that isn't a task. Pages
 * are plain text and nothing else — there are no uploads anywhere in this app,
 * so a page is words, kept in the row, read the way they were typed.
 *
 * Reading is for whoever the project's roles let in; writing is the owner's.
 */
export function WikiView({
  project,
  canEdit,
}: {
  project: Project;
  /** The owner writes the wiki; everyone else reads it. */
  canEdit: boolean;
}) {
  const { notify, confirm } = useFeedback();
  const [pages, setPages] = useState<WikiPage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Every project's pages arrive in one request, the way the roster does; this
  // view shows the ones belonging to the project on screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/wiki");
        if (!res.ok) throw new Error("failed");
        const data: WikiPage[] = await res.json();
        if (!cancelled) setPages(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const here = useMemo(
    () => (pages ?? []).filter((p) => p.projectId === project.id),
    [pages, project.id]
  );

  const selected = useMemo(
    () => here.find((p) => p.id === selectedId) ?? here[0] ?? null,
    [here, selectedId]
  );

  const write = useCallback((page: WikiPage) => {
    setPages((prev) =>
      (prev ?? []).some((p) => p.id === page.id)
        ? (prev ?? []).map((p) => (p.id === page.id ? page : p))
        : [...(prev ?? []), page]
    );
  }, []);

  async function addPage() {
    const res = await fetch("/api/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, title: "New page" }),
    });
    if (!res.ok) {
      notify("error", "Could not add that page.");
      return;
    }
    const page: WikiPage = await res.json();
    write(page);
    setSelectedId(page.id);
    setEditing(true);
  }

  async function savePage(id: string, values: { title: string; content: string }) {
    const res = await fetch(`/api/wiki/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      notify("error", "Could not save this page.");
      return;
    }
    write(await res.json());
    setEditing(false);
  }

  async function removePage(page: WikiPage) {
    const ok = await confirm({
      title: `Delete “${page.title}”?`,
      body: "The page and everything written on it go. This cannot be undone.",
      confirmLabel: "Delete page",
      destructive: true,
    });
    if (!ok) return;

    const res = await fetch(`/api/wiki/${page.id}`, { method: "DELETE" });
    if (!res.ok) {
      notify("error", "Could not delete this page.");
      return;
    }
    setPages((prev) => (prev ?? []).filter((p) => p.id !== page.id));
    setSelectedId(null);
    setEditing(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="thin-scroll flex flex-col gap-3 overflow-y-auto border-b border-[var(--hairline)] p-4 lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[0.8125rem] font-semibold tracking-tight">
            Pages
            <span className="ml-2 font-normal text-[var(--ink-muted)]">
              {here.length}
            </span>
          </h2>
          {canEdit && (
            <button onClick={addPage} className="btn-primary">
              New page
            </button>
          )}
        </div>

        {pages == null && !failed && (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">Loading…</p>
        )}
        {failed && (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">
            Couldn’t load the wiki.
          </p>
        )}
        {pages != null && here.length === 0 && (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">
            {canEdit
              ? "Nothing written down yet."
              : "This project hasn’t written anything down yet."}
          </p>
        )}

        <nav className="flex flex-col gap-1">
          {here.map((page) => (
            <button
              key={page.id}
              onClick={() => {
                setSelectedId(page.id);
                setEditing(false);
              }}
              aria-current={page.id === selected?.id ? "page" : undefined}
              className={`truncate rounded-[var(--radius)] px-2.5 py-2 text-left text-[0.8125rem] transition ${
                page.id === selected?.id
                  ? "bg-[var(--accent-wash)] font-medium text-[var(--accent)]"
                  : "text-[var(--ink-secondary)] hover:bg-[var(--plane)] hover:text-[var(--ink)]"
              }`}
            >
              {page.title}
            </button>
          ))}
        </nav>
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {selected == null ? (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">
            {canEdit
              ? "Pick a page, or start a new one."
              : "Pick a page to read it."}
          </p>
        ) : editing && canEdit ? (
          <PageForm
            key={selected.id}
            page={selected}
            onCancel={() => setEditing(false)}
            onSave={(values) => savePage(selected.id, values)}
          />
        ) : (
          <article className="mx-auto flex max-w-2xl flex-col gap-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight">
                  {selected.title}
                </h2>
                <p className="mt-0.5 text-[0.75rem] text-[var(--ink-muted)]">
                  Last changed{" "}
                  {new Date(selected.updatedAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    onClick={() => removePage(selected)}
                    className="btn-secondary !text-[#d03b3b]"
                  >
                    Delete
                  </button>
                  <button onClick={() => setEditing(true)} className="btn-primary">
                    Edit page
                  </button>
                </div>
              )}
            </header>

            {/* Written as typed: no markup is rendered from a page, so what is
                stored can't become anything but text on the way out. */}
            {selected.content.trim() ? (
              <div className="whitespace-pre-wrap text-[0.875rem] leading-relaxed text-[var(--ink-secondary)]">
                {selected.content}
              </div>
            ) : (
              <p className="text-[0.8125rem] text-[var(--ink-muted)]">
                This page is empty.
              </p>
            )}
          </article>
        )}
      </div>
    </div>
  );
}

function PageForm({
  page,
  onSave,
  onCancel,
}: {
  page: WikiPage;
  onSave: (values: { title: string; content: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(page.content);
  const [pending, setPending] = useState(false);

  const tooLong = content.length > LIMITS.wiki;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || tooLong) return;
    setPending(true);
    await onSave({ title: title.trim(), content });
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-2xl flex-col gap-3.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="input text-[1rem] font-semibold"
        placeholder="Page title"
        aria-label="Page title"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="input min-h-[24rem] resize-y font-normal leading-relaxed"
        placeholder="Write it down…"
        aria-label="Page content"
      />
      {tooLong && (
        <p className="text-[0.6875rem] text-[#d03b3b]">
          A page is {LIMITS.wiki.toLocaleString()} characters or fewer.
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || tooLong || !title.trim()}
        >
          {pending ? "Saving…" : "Save page"}
        </button>
      </div>
    </form>
  );
}

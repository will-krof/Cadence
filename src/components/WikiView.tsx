"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { Markdown } from "@/components/Markdown";
import { PageForm } from "@/components/wiki/PageForm";
import { Row, WikiTree } from "@/components/wiki/WikiTree";
import { Project, WikiEntry, WikiPage } from "@/lib/types";

/**
 * The project's documentation: sections, sections of sections, as deep as it
 * needs to go. A page is written in the formatting the toolbar puts in —
 * headings, lists, quotes, code, bold, italic — and nothing else: this app
 * stores no media, so a page is words and the shape of them.
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
  const [pages, setPages] = useState<WikiEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // What has been read so far. A wiki is mostly text, and the contents list
  // carries none of it, so a page's writing is fetched the first time it is
  // opened and kept for as long as the view is.
  const [read, setRead] = useState<Map<string, string>>(new Map());
  const [loadingPage, setLoadingPage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/wiki?projectId=${project.id}`);
        if (!res.ok) throw new Error("failed");
        const data: WikiEntry[] = await res.json();
        if (!cancelled) setPages(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const here = useMemo(() => pages ?? [], [pages]);

  /**
   * The wiki as it reads: every page in tree order, each with how deep it sits.
   * Flat rather than nested because that is what a sidebar draws and what a
   * drag lands in — the nesting lives in the depth beside each row.
   */
  const rows = useMemo(() => {
    const byParent = new Map<string | null, WikiEntry[]>();
    for (const page of here) {
      const siblings = byParent.get(page.parentId) ?? [];
      siblings.push(page);
      byParent.set(page.parentId, siblings);
    }
    for (const siblings of byParent.values()) {
      siblings.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    }

    const out: Row[] = [];
    const walk = (parentId: string | null, depth: number, hidden: boolean) => {
      for (const page of byParent.get(parentId) ?? []) {
        const children = byParent.get(page.id) ?? [];
        if (!hidden) out.push({ page, depth, hasChildren: children.length > 0 });
        walk(page.id, depth + 1, hidden || collapsed.has(page.id));
      }
    };
    walk(null, 0, false);
    return out;
  }, [here, collapsed]);

  const selected = useMemo(
    () => here.find((p) => p.id === selectedId) ?? null,
    [here, selectedId]
  );

  /** Files what the server answered, both in the contents and in what is read. */
  const write = useCallback((page: WikiPage) => {
    const { content, ...entry } = page;
    setPages((prev) =>
      (prev ?? []).some((p) => p.id === entry.id)
        ? (prev ?? []).map((p) => (p.id === entry.id ? entry : p))
        : [...(prev ?? []), entry]
    );
    setRead((prev) => new Map(prev).set(page.id, content));
  }, []);

  /**
   * Opens a page: its writing is fetched the first time it is asked for and
   * kept for as long as the view is. Reading is what moves the text, so it is
   * fetched on the press rather than on a render that noticed the press.
   */
  const open = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setEditing(false);
      if (read.has(id)) return;

      setLoadingPage(true);
      try {
        const res = await fetch(`/api/wiki/${id}`);
        if (!res.ok) throw new Error("failed");
        const page: WikiPage = await res.json();
        setRead((prev) => new Map(prev).set(page.id, page.content));
      } catch {
        notify("error", "Could not open that page.");
      }
      setLoadingPage(false);
    },
    [read, notify]
  );

  async function addPage(parentId: string | null) {
    const res = await fetch("/api/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        parentId,
        title: parentId ? "New section" : "New page",
      }),
    });
    if (!res.ok) {
      notify("error", "Could not add that page.");
      return;
    }
    const page: WikiPage = await res.json();
    write(page);
    setSelectedId(page.id);
    if (parentId) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }
    setEditing(true);
  }

  async function savePage(
    id: string,
    values: { title: string; content: string }
  ) {
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

  async function removePage(page: WikiEntry) {
    const under = here.filter((p) => p.parentId === page.id).length;
    const ok = await confirm({
      title: `Delete “${page.title}”?`,
      body: under
        ? `Everything filed under it goes too — ${under} section${
            under === 1 ? "" : "s"
          }. This cannot be undone.`
        : "The page and everything written on it go. This cannot be undone.",
      confirmLabel: "Delete page",
      destructive: true,
    });
    if (!ok) return;

    const res = await fetch(`/api/wiki/${page.id}`, { method: "DELETE" });
    if (!res.ok) {
      notify("error", "Could not delete this page.");
      return;
    }
    // The server cascades; the client drops the subtree the same way rather
    // than asking for the wiki again.
    setPages((prev) => {
      const all: WikiEntry[] = prev ?? [];
      const doomed = new Set([page.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const p of all) {
          if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id)) {
            doomed.add(p.id);
            grew = true;
          }
        }
      }
      return all.filter((p) => !doomed.has(p.id));
    });
    setSelectedId(null);
    setEditing(false);
  }

  /**
   * Where a dragged page lands: inside a section, or between two of its rows.
   * A fractional position is sent for "between"; the server renumbers the
   * section it lands in and answers with the position it settled at.
   */
  async function movePage(
    id: string,
    parentId: string | null,
    order: number
  ) {
    const before: WikiEntry[] = pages ?? [];
    setPages(before.map((p) => (p.id === id ? { ...p, parentId, order } : p)));

    const res = await fetch(`/api/wiki/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId, order }),
    });
    if (!res.ok) {
      setPages(before);
      const { error } = await res.json().catch(() => ({ error: null }));
      notify("error", error ?? "Could not move that page.");
      return;
    }
    write(await res.json());
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div className="thin-scroll flex flex-col gap-3 overflow-y-auto border-b border-[var(--hairline)] p-4 lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[0.8125rem] font-semibold tracking-tight">
            Contents
            <span className="ml-2 font-normal text-[var(--ink-muted)]">
              {here.length}
            </span>
          </h2>
          {canEdit && (
            <button onClick={() => addPage(null)} className="btn-primary">
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

        {rows.length > 0 && (
          <WikiTree
            rows={rows}
            selectedId={selected?.id ?? null}
            collapsed={collapsed}
            canEdit={canEdit}
            onOpen={open}
            onToggle={(id) =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onAddChild={(id) => addPage(id)}
            onMove={movePage}
          />
        )}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {selected == null ? (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">
            {canEdit
              ? "Pick a page, or start a new one."
              : "Pick a page to read it."}
          </p>
        ) : loadingPage && !read.has(selected.id) ? (
          <p className="text-[0.8125rem] text-[var(--ink-muted)]">Loading…</p>
        ) : editing && canEdit ? (
          <PageForm
            key={selected.id}
            page={selected}
            content={read.get(selected.id) ?? ""}
            onCancel={() => setEditing(false)}
            onSave={(values) => savePage(selected.id, values)}
          />
        ) : (
          <article className="mx-auto flex max-w-2xl flex-col gap-3">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Breadcrumb page={selected} pages={here} onOpen={open} />
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
                    className="btn-secondary !text-[var(--danger)]"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => addPage(selected.id)}
                    className="btn-secondary"
                  >
                    Add section
                  </button>
                  <button
                    onClick={() => setEditing(true)}
                    className="btn-primary"
                  >
                    Edit page
                  </button>
                </div>
              )}
            </header>

            {(read.get(selected.id) ?? "").trim() ? (
              <Markdown text={read.get(selected.id) ?? ""} />
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

/** Where the page sits, as the sections above it. */
function Breadcrumb({
  page,
  pages,
  onOpen,
}: {
  page: WikiEntry;
  pages: WikiEntry[];
  onOpen: (id: string) => void;
}) {
  const trail: WikiEntry[] = [];
  let at = page.parentId;
  while (at) {
    const parent = pages.find((p) => p.id === at);
    if (!parent) break;
    trail.unshift(parent);
    at = parent.parentId;
  }
  if (trail.length === 0) return null;

  return (
    <p className="mb-1 flex flex-wrap items-center gap-1 text-[0.6875rem] text-[var(--ink-muted)]">
      {trail.map((p) => (
        <span key={p.id} className="flex items-center gap-1">
          <button
            onClick={() => onOpen(p.id)}
            className="hover:text-[var(--ink)] hover:underline"
          >
            {p.title}
          </button>
          <span aria-hidden="true">/</span>
        </span>
      ))}
    </p>
  );
}


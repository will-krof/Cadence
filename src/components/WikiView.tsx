"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { Markdown } from "@/components/Markdown";
import { Project, WikiPage } from "@/lib/types";
import { LIMITS } from "@/lib/sanitize";

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
  const [pages, setPages] = useState<WikiPage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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

  /**
   * The wiki as it reads: every page in tree order, each with how deep it sits.
   * Flat rather than nested because that is what a sidebar draws and what a
   * drag lands in — the nesting lives in the depth beside each row.
   */
  const rows = useMemo(() => {
    const byParent = new Map<string | null, WikiPage[]>();
    for (const page of here) {
      const siblings = byParent.get(page.parentId) ?? [];
      siblings.push(page);
      byParent.set(page.parentId, siblings);
    }
    for (const siblings of byParent.values()) {
      siblings.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    }

    const out: { page: WikiPage; depth: number; hasChildren: boolean }[] = [];
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

  const write = useCallback((page: WikiPage) => {
    setPages((prev) =>
      (prev ?? []).some((p) => p.id === page.id)
        ? (prev ?? []).map((p) => (p.id === page.id ? page : p))
        : [...(prev ?? []), page]
    );
  }, []);

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
    if (parentId) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }
    setSelectedId(page.id);
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

  async function removePage(page: WikiPage) {
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
      const all = prev ?? [];
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
    const before = pages ?? [];
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
          <Tree
            rows={rows}
            selectedId={selected?.id ?? null}
            collapsed={collapsed}
            canEdit={canEdit}
            onOpen={(id) => {
              setSelectedId(id);
              setEditing(false);
            }}
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
        ) : editing && canEdit ? (
          <PageForm
            key={selected.id}
            page={selected}
            onCancel={() => setEditing(false)}
            onSave={(values) => savePage(selected.id, values)}
          />
        ) : (
          <article className="mx-auto flex max-w-2xl flex-col gap-3">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Breadcrumb page={selected} pages={here} onOpen={setSelectedId} />
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

            {selected.content.trim() ? (
              <Markdown text={selected.content} />
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
  page: WikiPage;
  pages: WikiPage[];
  onOpen: (id: string) => void;
}) {
  const trail: WikiPage[] = [];
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

type Row = { page: WikiPage; depth: number; hasChildren: boolean };

/** Above the row, below it, or into it — the three places a drag can land. */
type Landing = "before" | "after" | "inside";

function Tree({
  rows,
  selectedId,
  collapsed,
  canEdit,
  onOpen,
  onToggle,
  onAddChild,
  onMove,
}: {
  rows: Row[];
  selectedId: string | null;
  collapsed: Set<string>;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  onAddChild: (id: string) => void;
  onMove: (id: string, parentId: string | null, order: number) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; where: Landing } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  /** Which third of the row the pointer is in. */
  function landing(e: React.DragEvent, id: string): Landing {
    const el = rowRefs.current.get(id);
    if (!el) return "inside";
    const box = el.getBoundingClientRect();
    const y = e.clientY - box.top;
    if (y < box.height * 0.28) return "before";
    if (y > box.height * 0.72) return "after";
    return "inside";
  }

  function drop(target: Row, where: Landing) {
    if (!dragId || dragId === target.page.id) return;

    if (where === "inside") {
      // Into the section, at the end of it.
      onMove(dragId, target.page.id, 100_000);
      return;
    }
    // Between two rows of the same section: a position either side of the one
    // it was dropped against, which the server then renumbers.
    onMove(
      dragId,
      target.page.parentId,
      where === "before" ? target.page.order - 1 : target.page.order + 1
    );
  }

  return (
    <nav className="flex flex-col">
      {rows.map((row) => {
        const isOver = over?.id === row.page.id;
        return (
          <div
            key={row.page.id}
            ref={(el) => {
              if (el) rowRefs.current.set(row.page.id, el);
              else rowRefs.current.delete(row.page.id);
            }}
            draggable={canEdit}
            onDragStart={() => setDragId(row.page.id)}
            onDragEnd={() => {
              setDragId(null);
              setOver(null);
            }}
            onDragOver={(e) => {
              if (!canEdit || !dragId) return;
              e.preventDefault();
              setOver({ id: row.page.id, where: landing(e, row.page.id) });
            }}
            onDragLeave={() => setOver((o) => (o?.id === row.page.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const where = over?.id === row.page.id ? over.where : landing(e, row.page.id);
              setOver(null);
              drop(row, where);
              setDragId(null);
            }}
            className={`group/row relative flex items-center gap-0.5 rounded-[var(--radius)] ${
              isOver && over.where === "inside"
                ? "bg-[var(--accent-wash)] ring-1 ring-[var(--accent)]"
                : ""
            } ${dragId === row.page.id ? "opacity-40" : ""}`}
            style={{ paddingLeft: `${row.depth * 0.75}rem` }}
          >
            {/* The line a page would land on, drawn where it would land. */}
            {isOver && over.where !== "inside" && (
              <span
                className={`pointer-events-none absolute inset-x-1 h-0.5 rounded bg-[var(--accent)] ${
                  over.where === "before" ? "top-0" : "bottom-0"
                }`}
              />
            )}

            <button
              onClick={() => onToggle(row.page.id)}
              className={`shrink-0 rounded p-1 text-[var(--ink-muted)] transition hover:text-[var(--ink)] ${
                row.hasChildren ? "" : "invisible"
              }`}
              aria-label={
                collapsed.has(row.page.id)
                  ? `Open ${row.page.title}`
                  : `Close ${row.page.title}`
              }
              aria-expanded={!collapsed.has(row.page.id)}
              tabIndex={row.hasChildren ? 0 : -1}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 10 10"
                fill="none"
                className={`transition-transform ${
                  collapsed.has(row.page.id) ? "" : "rotate-90"
                }`}
              >
                <path
                  d="M3.5 1.5L7 5l-3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              onClick={() => onOpen(row.page.id)}
              aria-current={row.page.id === selectedId ? "page" : undefined}
              className={`min-w-0 flex-1 truncate rounded-[var(--radius)] px-1.5 py-1.5 text-left text-[0.8125rem] transition ${
                row.page.id === selectedId
                  ? "bg-[var(--accent-wash)] font-medium text-[var(--accent)]"
                  : "text-[var(--ink-secondary)] hover:bg-[var(--plane)] hover:text-[var(--ink)]"
              }`}
              title={canEdit ? "Drag to move — onto a page files it inside" : undefined}
            >
              {row.page.title}
            </button>

            {canEdit && (
              <button
                onClick={() => onAddChild(row.page.id)}
                className="shrink-0 rounded p-1 text-[var(--ink-muted)] opacity-0 transition hover:text-[var(--ink)] focus:opacity-100 group-hover/row:opacity-100"
                aria-label={`Add a section under ${row.page.title}`}
                title="Add a section under this"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 2v8M2 6h8"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** What the toolbar puts around, or in front of, what is selected. */
const MARKS: {
  label: string;
  title: string;
  wrap?: string;
  prefix?: string;
  sample: string;
}[] = [
  { label: "B", title: "Bold", wrap: "**", sample: "bold" },
  { label: "I", title: "Italic", wrap: "*", sample: "italic" },
  { label: "S", title: "Strikethrough", wrap: "~~", sample: "struck out" },
  { label: "Code", title: "Code", wrap: "`", sample: "code" },
  { label: "H1", title: "Heading", prefix: "# ", sample: "Heading" },
  { label: "H2", title: "Subheading", prefix: "## ", sample: "Subheading" },
  { label: "List", title: "Bulleted list", prefix: "- ", sample: "item" },
  { label: "1.", title: "Numbered list", prefix: "1. ", sample: "item" },
  { label: "Quote", title: "Quote", prefix: "> ", sample: "quoted" },
  { label: "Link", title: "Link", wrap: "]", sample: "text" },
];

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
  const [preview, setPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const tooLong = content.length > LIMITS.wiki;

  /** Marks up what is selected, or drops a sample in to be typed over. */
  function apply(mark: (typeof MARKS)[number]) {
    const field = bodyRef.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const chosen = content.slice(start, end) || mark.sample;

    let replacement: string;
    let caret: [number, number];

    if (mark.label === "Link") {
      replacement = `[${chosen}](https://)`;
      caret = [start + chosen.length + 3, start + chosen.length + 11];
    } else if (mark.wrap) {
      replacement = `${mark.wrap}${chosen}${mark.wrap}`;
      caret = [
        start + mark.wrap.length,
        start + mark.wrap.length + chosen.length,
      ];
    } else {
      // A line mark goes at the front of every line it covers.
      const lineStart = content.lastIndexOf("\n", start - 1) + 1;
      const block = content.slice(lineStart, end) || mark.sample;
      replacement = block
        .split("\n")
        .map((l) => `${mark.prefix}${l}`)
        .join("\n");
      const next =
        content.slice(0, lineStart) + replacement + content.slice(end);
      setContent(next);
      requestAnimationFrame(() => {
        field.focus();
        const at = lineStart + replacement.length;
        field.setSelectionRange(at, at);
      });
      return;
    }

    setContent(content.slice(0, start) + replacement + content.slice(end));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(caret[0], caret[1]);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || tooLong) return;
    setPending(true);
    await onSave({ title: title.trim(), content });
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-2xl flex-col gap-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="input text-[1rem] font-semibold"
        placeholder="Page title"
        aria-label="Page title"
      />

      <div className="flex flex-wrap items-center gap-1">
        {MARKS.map((mark) => (
          <button
            key={mark.label}
            type="button"
            onClick={() => apply(mark)}
            className="rounded-[var(--radius)] border border-[var(--hairline)] px-2 py-1 text-[0.6875rem] text-[var(--ink-secondary)] transition hover:border-[var(--baseline)] hover:text-[var(--ink)]"
            title={mark.title}
          >
            {mark.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          aria-pressed={preview}
          className={`ml-auto rounded-[var(--radius)] border px-2 py-1 text-[0.6875rem] transition ${
            preview
              ? "border-[var(--accent)] bg-[var(--accent-wash)] text-[var(--accent)]"
              : "border-[var(--hairline)] text-[var(--ink-secondary)] hover:text-[var(--ink)]"
          }`}
        >
          Preview
        </button>
      </div>

      {preview ? (
        <div className="min-h-[24rem] rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-4">
          {content.trim() ? (
            <Markdown text={content} />
          ) : (
            <p className="text-[0.8125rem] text-[var(--ink-muted)]">
              Nothing to show yet.
            </p>
          )}
        </div>
      ) : (
        <textarea
          ref={bodyRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="input min-h-[24rem] resize-y font-normal leading-relaxed"
          placeholder={"# A heading\n\nSomething **worth** writing down.\n\n- a point\n- another"}
          aria-label="Page content"
        />
      )}

      {tooLong && (
        <p className="text-[0.6875rem] text-[#d03b3b]">
          A page is {LIMITS.wiki.toLocaleString()} characters or fewer.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.6875rem] text-[var(--ink-muted)]">
          Formatting only — **bold**, *italic*, # headings, - lists, &gt; quotes,
          `code`, [links](https://). No images: nothing is uploaded or stored.
        </p>
        <div className="flex shrink-0 items-center gap-2">
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
      </div>
    </form>
  );
}

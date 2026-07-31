"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { Markdown } from "@/components/Markdown";
import { MarkupToolbar } from "@/components/MarkupToolbar";
import { CollapseIcon } from "@/components/shell/parts";
import { LIMITS } from "@/lib/sanitize";
import { formatDayShort } from "@/lib/dates";

/** A note as the list knows it: enough to find one by, and nothing written. */
interface NoteEntry {
  id: string;
  title: string;
  snippet?: string;
  updatedAt: string;
}

/** The same note with what is on it. */
interface Note extends NoteEntry {
  content: string;
}

/** How long the typing has to stop before what was typed is sent. */
const SAVE_AFTER_MS = 700;

/** Which half of a row the pointer is in — above the note, or below it. */
function landsAfter(e: React.DragEvent) {
  const box = e.currentTarget.getBoundingClientRect();
  return e.clientY - box.top > box.height / 2;
}

/**
 * Somebody's own notes. Private to whoever is signed in — nobody else in the
 * workspace can read them, the account that owns it included — and kept apart
 * from the wiki on purpose: a wiki is a project writing things down for the
 * people on it, and this is a person thinking.
 *
 * So it works the way notes work rather than the way a document does. A flat
 * pile in whatever order its writer dragged it into; no tree, no titles to fill
 * in — the first line is the title, as it is in every notes app anybody has
 * used; and no Save, because nobody saves a note. What is typed is written a
 * moment after the typing stops, and the list says so.
 *
 * Opening Notes opens the note at the top, which is the one somebody put there.
 */
export function NotesView() {
  const { notify, confirm } = useFeedback();
  const [notes, setNotes] = useState<NoteEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [preview, setPreview] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [state, setState] = useState<"clean" | "typing" | "saving">("clean");
  // The note being dragged, and the row it is currently over — with which half
  // of that row the pointer is in, since that is where it would land.
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const body = useRef<HTMLTextAreaElement>(null);

  // The note being written, so the debounce can save it without being rebuilt
  // on every keystroke — and so leaving the note flushes the last edit.
  const pending = useRef<{ id: string; content: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The pile, and the note at the top of it opened.
   *
   * Arriving at your own notes and being asked to pick one is a question with
   * an obvious answer — the first is the one you put there — so the answer is
   * given. Both fetches happen here rather than in an effect that watches the
   * list, so opening the first note is part of loading rather than a second
   * render reacting to the first.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/notes");
        if (!res.ok) throw new Error("failed");
        const list: NoteEntry[] = await res.json();
        if (cancelled) return;
        setNotes(list);

        const first = list[0];
        if (!first) return;
        setOpenId(first.id);
        try {
          const page = await fetch(`/api/notes/${first.id}`);
          if (!page.ok) throw new Error("failed");
          const note: Note = await page.json();
          if (!cancelled) setDraft(note.content);
        } catch {
          // The pile itself arrived, so the list is not what failed. Leaving
          // the box empty is wrong, so the note is closed again rather than
          // shown as though it had nothing written on it.
          if (!cancelled) setOpenId(null);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Writes whatever is waiting, now. */
  const flush = useCallback(async () => {
    const waiting = pending.current;
    if (!waiting) return;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    setState("saving");
    try {
      const res = await fetch(`/api/notes/${waiting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: waiting.content }),
      });
      if (!res.ok) throw new Error("failed");
      const saved: Note = await res.json();
      setNotes((prev) =>
        (prev ?? []).map((n) =>
          n.id === saved.id
            ? { ...n, title: saved.title, updatedAt: saved.updatedAt }
            : n
        )
      );
      setState("clean");
    } catch {
      // Nothing is thrown away — the text is still in the box, and the next
      // keystroke queues it again.
      pending.current = waiting;
      setState("typing");
      notify("error", "Couldn’t save that just now.");
    }
  }, [notify]);

  // Whatever is unsaved goes with the view: closing the tab mid-sentence
  // shouldn't be how a note is lost.
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  function type(content: string) {
    if (!openId) return;
    setDraft(content);
    pending.current = { id: openId, content };
    setState("typing");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  }

  async function open(id: string) {
    if (id === openId) return;
    await flush();
    setOpenId(id);
    setPreview(false);
    setDraft("");
    try {
      const res = await fetch(`/api/notes/${id}`);
      if (!res.ok) throw new Error("failed");
      const note: Note = await res.json();
      setDraft(note.content);
    } catch {
      notify("error", "Could not open that note.");
    }
  }

  async function add() {
    await flush();
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });
    if (!res.ok) {
      notify("error", "Could not start a new note.");
      return;
    }
    const note: Note = await res.json();
    setNotes((prev) => [{ ...note, snippet: "" }, ...(prev ?? [])]);
    setOpenId(note.id);
    setDraft("");
    setPreview(false);
    requestAnimationFrame(() => body.current?.focus());
  }

  /**
   * Moving a note in the pile. The list is rearranged here and sent as a whole
   * — a move renumbers everything under it, and one request writing the final
   * order is simpler to reason about than a request per note.
   *
   * The list is set before the request goes: dragging is direct, and a row that
   * springs back while a fetch is in flight reads as a failure. If the write
   * really does fail, the order is put back and said out loud.
   */
  async function moveNote(id: string, beforeId: string, after: boolean) {
    if (id === beforeId) return;
    const was = notes ?? [];
    const moving = was.find((n) => n.id === id);
    if (!moving) return;

    const without = was.filter((n) => n.id !== id);
    const at = without.findIndex((n) => n.id === beforeId);
    if (at === -1) return;
    const next = [
      ...without.slice(0, at + (after ? 1 : 0)),
      moving,
      ...without.slice(at + (after ? 1 : 0)),
    ];
    if (next.every((n, i) => n.id === was[i]?.id)) return;

    setNotes(next);
    try {
      const res = await fetch("/api/notes/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: next.map((n, i) => ({ id: n.id, order: i })),
        }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setNotes(was);
      notify("error", "Could not move that note.");
    }
  }

  async function remove(note: NoteEntry) {
    const ok = await confirm({
      title: `Delete ${note.title ? `“${note.title}”` : "this note"}?`,
      body: "It is yours alone, so nobody else has a copy. This cannot be undone.",
      confirmLabel: "Delete note",
      destructive: true,
    });
    if (!ok) return;

    // Nothing in flight should land on a note that is going.
    if (pending.current?.id === note.id) pending.current = null;
    const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    if (!res.ok) {
      notify("error", "Could not delete that note.");
      return;
    }
    const left = (notes ?? []).filter((n) => n.id !== note.id);
    setNotes(left);
    // Deleting what you were reading leaves you at the top of the pile rather
    // than at nothing — the same place opening Notes puts you.
    if (openId === note.id) {
      setOpenId(null);
      setDraft("");
      if (left[0]) void open(left[0].id);
    }
  }

  const here = notes ?? [];
  const open_ = here.find((n) => n.id === openId) ?? null;
  const tooLong = draft.length > LIMITS.note;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Folded away, the pile leaves a rail with the way back on it — the
          same as the wiki's contents, because it is the same gesture. */}
      {!listOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-2 py-1.5 lg:flex-col lg:border-r lg:border-b-0 lg:px-1.5 lg:py-2">
          <button
            onClick={() => setListOpen(true)}
            className="rounded p-1.5 text-[var(--ink-muted)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)]"
            aria-label="Show the notes"
            aria-expanded={false}
          >
            <CollapseIcon pointsLeft={false} />
          </button>
          <span className="text-[0.6875rem] text-[var(--ink-muted)] lg:[writing-mode:vertical-rl]">
            Notes
          </span>
        </div>
      )}

      <div
        className={`thin-scroll flex-col overflow-y-auto border-b border-[var(--hairline)] lg:w-72 lg:shrink-0 lg:border-r lg:border-b-0 ${
          listOpen ? "flex" : "hidden"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <h2 className="flex items-center gap-2 text-[0.8125rem] font-semibold tracking-tight">
            <button
              onClick={() => setListOpen(false)}
              className="rounded p-1 text-[var(--ink-muted)] transition hover:bg-[var(--plane)] hover:text-[var(--ink)]"
              aria-label="Hide the notes"
              aria-expanded={true}
            >
              <CollapseIcon pointsLeft={true} />
            </button>
            Notes
            <span className="font-normal text-[var(--ink-muted)]">
              {here.length}
            </span>
          </h2>
          <button onClick={add} className="btn-primary">
            New note
          </button>
        </div>

        {notes == null && !failed && (
          <p className="px-3 text-[0.8125rem] text-[var(--ink-muted)]">
            Loading…
          </p>
        )}
        {failed && (
          <p className="px-3 text-[0.8125rem] text-[var(--ink-muted)]">
            Couldn’t load your notes.
          </p>
        )}
        {notes != null && here.length === 0 && (
          <p className="px-3 text-[0.8125rem] text-[var(--ink-muted)]">
            Nothing here yet. A note is yours alone — nobody else in the
            workspace can read it.
          </p>
        )}

        {/* The pile is dragged into whatever order suits it. A note isn't
            filed under anything, so there is no landing but between two others
            — which makes the whole gesture "above this one, or below it". */}
        <div className="flex flex-col">
          {here.map((note) => (
            <div
              key={note.id}
              draggable
              onDragStart={(e) => {
                // Firefox refuses to start a drag without something on the
                // transfer.
                e.dataTransfer.setData("text/plain", note.id);
                e.dataTransfer.effectAllowed = "move";
                setDragId(note.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!dragId || dragId === note.id) return;
                e.preventDefault();
                setOver({ id: note.id, after: landsAfter(e) });
              }}
              onDragLeave={() =>
                setOver((o) => (o?.id === note.id ? null : o))
              }
              onDrop={(e) => {
                e.preventDefault();
                const after =
                  over?.id === note.id ? over.after : landsAfter(e);
                setOver(null);
                if (dragId) void moveNote(dragId, note.id, after);
                setDragId(null);
              }}
              className={`relative border-t border-[var(--hairline)] ${
                dragId === note.id ? "opacity-40" : ""
              }`}
            >
              {/* The line it would land on, drawn where it would land. */}
              {over?.id === note.id && (
                <span
                  className={`pointer-events-none absolute inset-x-1 h-0.5 rounded bg-[var(--accent)] ${
                    over.after ? "bottom-0" : "top-0"
                  }`}
                />
              )}
              <button
                onClick={() => open(note.id)}
                aria-current={note.id === openId ? "true" : undefined}
                title="Drag to move it up or down the pile"
                className={`group/note flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition ${
                  note.id === openId
                    ? "bg-[var(--accent-wash)]"
                    : "hover:bg-[var(--plane)]"
                }`}
              >
                <span className="flex items-baseline gap-2">
                  <span
                    className={`min-w-0 flex-1 truncate text-[0.8125rem] font-medium ${
                      note.title ? "" : "text-[var(--ink-muted)] italic"
                    }`}
                  >
                    {note.title || "New note"}
                  </span>
                  <span className="shrink-0 text-[0.625rem] text-[var(--ink-muted)] tabular-nums">
                    {formatDayShort(note.updatedAt)}
                  </span>
                </span>
                {note.snippet && (
                  <span className="truncate text-[0.75rem] text-[var(--ink-muted)]">
                    {note.snippet}
                  </span>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {open_ == null ? (
          <p className="p-4 text-[0.8125rem] text-[var(--ink-muted)] sm:p-6">
            Pick a note, or start a new one.
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold tracking-tight">
                {open_.title || "New note"}
              </h3>
              {/* What the app is doing with what was typed, in words. There is
                  no Save button to look at, so this is the only thing that can
                  say it. */}
              <span
                className="text-[0.6875rem] text-[var(--ink-muted)]"
                aria-live="polite"
              >
                {state === "saving"
                  ? "Saving…"
                  : state === "typing"
                    ? "Unsaved"
                    : "Saved"}
              </span>
              <button
                onClick={() => remove(open_)}
                className="btn-secondary !text-[var(--danger)]"
              >
                Delete
              </button>
            </div>

            <MarkupToolbar
              field={body}
              content={draft}
              onChange={type}
              preview={preview}
              onPreview={setPreview}
            />

            {preview ? (
              <div className="thin-scroll min-h-0 flex-1 overflow-y-auto rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-4">
                {draft.trim() ? (
                  <Markdown text={draft} />
                ) : (
                  <p className="text-[0.8125rem] text-[var(--ink-muted)]">
                    Nothing written yet.
                  </p>
                )}
              </div>
            ) : (
              <textarea
                ref={body}
                value={draft}
                onChange={(e) => type(e.target.value)}
                onBlur={() => void flush()}
                className="input min-h-0 flex-1 resize-none leading-relaxed font-normal"
                placeholder={"Start typing.\n\nThe first line is what the note is called."}
                aria-label="This note"
              />
            )}

            {tooLong && (
              <p className="text-[0.6875rem] text-[var(--danger)]">
                A note is {LIMITS.note.toLocaleString()} characters or fewer.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { MarkupToolbar } from "@/components/MarkupToolbar";
import { WikiEntry } from "@/lib/types";
import { LIMITS } from "@/lib/sanitize";

export function PageForm({
  page,
  content: written,
  onSave,
  onCancel,
}: {
  page: WikiEntry;
  /** What is on the page, as fetched. */
  content: string;
  onSave: (values: { title: string; content: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [content, setContent] = useState(written);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const tooLong = content.length > LIMITS.wiki;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || tooLong) return;
    setPending(true);
    await onSave({ title: title.trim(), content });
    setPending(false);
  }

  return (
    // The whole pane, rather than a column down the middle of it: writing is
    // the one thing in this app that wants every inch of the screen, and a
    // page written in a 42-character column is a page written through a
    // letterbox. The box grows with the window; only the writing scrolls.
    <form
      onSubmit={submit}
      className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-6"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="input text-[1rem] font-semibold"
        placeholder="Page title"
        aria-label="Page title"
      />

      <MarkupToolbar
        field={bodyRef}
        content={content}
        onChange={setContent}
        preview={preview}
        onPreview={setPreview}
      />

      {preview ? (
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-4">
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
          className="input min-h-0 flex-1 resize-none font-normal leading-relaxed"
          placeholder={"# A heading\n\nSomething **worth** writing down.\n\n- a point\n- another"}
          aria-label="Page content"
        />
      )}

      {tooLong && (
        <p className="text-[0.6875rem] text-[var(--danger)]">
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

"use client";

import { useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { WikiEntry } from "@/lib/types";
import { LIMITS } from "@/lib/sanitize";

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

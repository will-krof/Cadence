"use client";

import { MARKS, applyMark } from "@/lib/markup";

/**
 * The row of buttons above anything written in this app's formatting: a wiki
 * page, and somebody's own notes. It works on the field it is handed rather
 * than holding the text itself, so both callers keep their own state and their
 * own idea of when it is saved.
 */
export function MarkupToolbar({
  field,
  content,
  onChange,
  preview,
  onPreview,
}: {
  field: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onChange: (text: string) => void;
  /** Whether the writing is being read back rather than written. */
  preview: boolean;
  onPreview: (on: boolean) => void;
}) {
  function apply(mark: (typeof MARKS)[number]) {
    const box = field.current;
    if (!box) return;
    const { text, select } = applyMark(
      content,
      box.selectionStart,
      box.selectionEnd,
      mark
    );
    onChange(text);
    // After React has written the new text, not before it: setting a range on
    // the old string puts the caret in the wrong place.
    requestAnimationFrame(() => {
      box.focus();
      box.setSelectionRange(select[0], select[1]);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {MARKS.map((mark) => (
        <button
          key={mark.label}
          type="button"
          onClick={() => apply(mark)}
          disabled={preview}
          className="rounded-[var(--radius)] border border-[var(--hairline)] px-2 py-1 text-[0.6875rem] text-[var(--ink-secondary)] transition hover:border-[var(--baseline)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
          title={mark.title}
        >
          {mark.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPreview(!preview)}
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
  );
}

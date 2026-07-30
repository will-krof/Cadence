/**
 * The formatting a toolbar puts in, and where the caret lands afterwards.
 *
 * Shared by the two places somebody writes prose in this app — a wiki page and
 * their own notes — so bold means the same keystrokes and the same characters
 * in both, and neither has to know how the other spells a list.
 */
export interface Mark {
  label: string;
  title: string;
  /** Put around what is selected. */
  wrap?: string;
  /** Put at the front of every line it covers. */
  prefix?: string;
  /** Dropped in to be typed over when nothing is selected. */
  sample: string;
}

export const MARKS: Mark[] = [
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

/** The text after a mark is applied, and where to put the caret in it. */
export interface Marked {
  text: string;
  /** Start and end of what should be selected once it lands. */
  select: [number, number];
}

/**
 * Marks up what is selected, or drops the sample in to be typed over.
 *
 * A line mark goes at the front of every line the selection touches; a wrap
 * goes around it; a link is the one that puts the caret somewhere other than
 * on the words — in the empty address, which is what you type next.
 */
export function applyMark(
  content: string,
  start: number,
  end: number,
  mark: Mark
): Marked {
  const chosen = content.slice(start, end) || mark.sample;

  if (mark.label === "Link") {
    const replacement = `[${chosen}](https://)`;
    return {
      text: content.slice(0, start) + replacement + content.slice(end),
      select: [start + chosen.length + 3, start + chosen.length + 11],
    };
  }

  if (mark.wrap) {
    const replacement = `${mark.wrap}${chosen}${mark.wrap}`;
    return {
      text: content.slice(0, start) + replacement + content.slice(end),
      select: [
        start + mark.wrap.length,
        start + mark.wrap.length + chosen.length,
      ],
    };
  }

  const lineStart = content.lastIndexOf("\n", start - 1) + 1;
  const block = content.slice(lineStart, end) || mark.sample;
  const replacement = block
    .split("\n")
    .map((line) => `${mark.prefix}${line}`)
    .join("\n");
  const at = lineStart + replacement.length;
  return {
    text: content.slice(0, lineStart) + replacement + content.slice(end),
    select: [at, at],
  };
}

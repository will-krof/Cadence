"use client";

import { Fragment, ReactNode } from "react";
import { safeHttpUrl } from "@/lib/sanitize";

/**
 * The formatting a wiki page is written in: headings, lists, quotes, code,
 * bold, italic, strikethrough and links. Markdown as far as it goes, and it
 * deliberately doesn't go as far as images or HTML — this app stores no media,
 * and a page that could carry markup could carry a script.
 *
 * Nothing here builds HTML from the page's text: every branch returns elements,
 * so what was typed can only ever become words, and a link only survives if it
 * parses as http or https.
 */

type Inline = ReactNode;

/** `**bold**`, `*italic*`, `` `code` ``, `~~struck~~`, `[text](https://…)`. */
const INLINE =
  /(\*\*|__)(?=\S)([\s\S]*?\S)\1|(\*|_)(?=\S)([\s\S]*?\S)\3|(~~)(?=\S)([\s\S]*?\S)\5|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/;

function inline(text: string, key = 0): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  let n = key;

  while (rest) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) {
      out.push(rest);
      break;
    }

    if (match.index > 0) out.push(rest.slice(0, match.index));
    const [whole, , strong, , emphasis, , struck, code, linkText, href] = match;

    if (strong !== undefined) {
      out.push(<strong key={n++}>{inline(strong, n)}</strong>);
    } else if (emphasis !== undefined) {
      out.push(<em key={n++}>{inline(emphasis, n)}</em>);
    } else if (struck !== undefined) {
      out.push(
        <s key={n++} className="opacity-70">
          {inline(struck, n)}
        </s>
      );
    } else if (code !== undefined) {
      out.push(
        <code
          key={n++}
          className="rounded bg-[var(--plane)] px-1 py-0.5 font-mono text-[0.8125em]"
        >
          {code}
        </code>
      );
    } else if (linkText !== undefined) {
      // Only http and https survive: a `javascript:` link in a page anybody can
      // edit is a script waiting for a reader to click it.
      const safe = safeHttpUrl(href);
      out.push(
        safe ? (
          <a
            key={n++}
            href={safe}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent)] underline underline-offset-2"
          >
            {inline(linkText, n)}
          </a>
        ) : (
          <Fragment key={n++}>{linkText}</Fragment>
        )
      );
    }

    rest = rest.slice(match.index + whole.length);
  }

  return out;
}

/** Lines of a list, with how deep each one is indented. */
interface Item {
  depth: number;
  ordered: boolean;
  text: string;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)([-*+])\s+(.*)$/;
const NUMBER = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

const HEADING_CLASS = [
  "text-[1.375rem] font-semibold tracking-tight mt-6 first:mt-0",
  "text-[1.125rem] font-semibold tracking-tight mt-6 first:mt-0",
  "text-[1rem] font-semibold tracking-tight mt-5 first:mt-0",
  "text-[0.9375rem] font-semibold mt-4 first:mt-0",
  "text-[0.875rem] font-semibold mt-4 first:mt-0",
  "text-[0.875rem] font-semibold uppercase tracking-wide text-[var(--ink-muted)] mt-4 first:mt-0",
];

/** Nested lists, built from how far each item is indented. */
function list(items: Item[], key: number): ReactNode {
  const Tag = items[0].ordered ? "ol" : "ul";
  const nodes: ReactNode[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const nested: Item[] = [];
    while (i + 1 < items.length && items[i + 1].depth > item.depth) {
      nested.push(items[++i]);
    }
    nodes.push(
      <li key={i} className="ml-4 list-outside">
        {inline(item.text)}
        {nested.length > 0 && list(nested, 0)}
      </li>
    );
  }

  return (
    <Tag
      key={key}
      className={`my-2 flex flex-col gap-1 ${
        items[0].ordered ? "list-decimal" : "list-disc"
      }`}
    >
      {nodes}
    </Tag>
  );
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code, kept exactly as typed.
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      blocks.push(
        <pre
          key={key++}
          className="thin-scroll my-3 overflow-x-auto rounded-[var(--radius)] border border-[var(--hairline)] bg-[var(--plane)] p-3 font-mono text-[0.8125rem] leading-relaxed"
        >
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    if (!line.trim()) continue;

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(
        <hr key={key++} className="my-5 border-t border-[var(--hairline)]" />
      );
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${Math.min(level + 1, 6)}` as "h2";
      blocks.push(
        <Tag key={key++} className={`${HEADING_CLASS[level - 1]} text-[var(--ink)]`}>
          {inline(heading[2])}
        </Tag>
      );
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(QUOTE.exec(lines[i++])![1]);
      }
      i--;
      blocks.push(
        <blockquote
          key={key++}
          className="my-3 border-l-2 border-[var(--baseline)] pl-3 text-[var(--ink-secondary)]"
        >
          {inline(quoted.join(" "))}
        </blockquote>
      );
      continue;
    }

    if (BULLET.test(line) || NUMBER.test(line)) {
      const items: Item[] = [];
      while (i < lines.length && (BULLET.test(lines[i]) || NUMBER.test(lines[i]))) {
        const bullet = BULLET.exec(lines[i]);
        const numbered = bullet ? null : NUMBER.exec(lines[i]);
        const parts = (bullet ?? numbered)!;
        items.push({
          depth: Math.floor(parts[1].replace(/\t/g, "  ").length / 2),
          ordered: numbered != null,
          text: parts[3],
        });
        i++;
      }
      i--;
      blocks.push(list(items, key++));
      continue;
    }

    // Everything else is a paragraph, and runs until a blank line.
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !NUMBER.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !/^```/.test(lines[i])
    ) {
      paragraph.push(lines[i++]);
    }
    i--;
    blocks.push(
      <p key={key++} className="my-2 leading-relaxed">
        {paragraph.map((l, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {inline(l)}
          </Fragment>
        ))}
      </p>
    );
  }

  return <div className="text-[0.875rem] text-[var(--ink-secondary)]">{blocks}</div>;
}

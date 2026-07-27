"use client";

import { useRef, useState } from "react";
import { WikiEntry } from "@/lib/types";

export type Row = { page: WikiEntry; depth: number; hasChildren: boolean };

/** Above the row, below it, or into it — the three places a drag can land. */
type Landing = "before" | "after" | "inside";

export function WikiTree({
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

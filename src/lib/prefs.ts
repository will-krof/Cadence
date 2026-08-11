"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * The small choices somebody makes about their own view of the workspace —
 * which boards they keep in the sidebar, how wide they dragged a column, what
 * they have folded away. They belong to the browser rather than the workspace:
 * nobody else's screen should rearrange itself because of what one person put
 * away.
 *
 * Tracker columns used to be among these, hidden per browser. They aren't any
 * more: a column is a row the project owns, and a board it doesn't want is
 * deleted rather than hidden from one person while everybody else still works
 * in it.
 *
 * Stored as a comma-separated list under one key each, and read through
 * `useSyncExternalStore` so every component that cares agrees within the same
 * render.
 */
const EVENT = "cadence:prefschange";

// Where storage is blocked (private browsing), the choice still works for the
// session; it just doesn't survive a reload.
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

/**
 * Parsed lists, cached against the raw string they came from: the store hands
 * back the *same* array until the stored value actually changes, which is what
 * `useSyncExternalStore` needs to avoid re-rendering forever.
 */
const cache = new Map<string, { raw: string | null; list: string[] }>();
const EMPTY: string[] = [];

function snapshot(key: string): string[] {
  const raw = read(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.list;
  const list = raw ? raw.split(",").filter(Boolean) : EMPTY;
  cache.set(key, { raw, list });
  return list;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  // Another tab of the same workspace is the same person: keep them in step.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function store(key: string, list: string[]) {
  const raw = list.join(",");
  memory.set(key, raw);
  try {
    localStorage.setItem(key, raw);
  } catch {
    // Storage unavailable — the in-memory copy carries this session.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * A remembered set of strings, narrowed to the values that mean something now:
 * a status or a view that no longer exists is dropped rather than kept around
 * as a name nothing answers to.
 */
function useStoredSet<T extends string>(
  key: string,
  allowed: readonly T[]
): [T[], (next: T[]) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => EMPTY
  );
  const list = raw.filter((v): v is T => (allowed as readonly string[]).includes(v));
  const set = useCallback((next: T[]) => store(key, next), [key]);
  return [list, set];
}

/**
 * A remembered yes or no, stored as the same kind of list as the sets above.
 * Both answers are written down — "off" rather than nothing — so a preference
 * that starts life switched on can be switched off and stay that way.
 */
function useStoredFlag(
  key: string,
  fallback = false
): [boolean, (on: boolean) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => EMPTY
  );
  const set = useCallback(
    (on: boolean) => store(key, [on ? "on" : "off"]),
    [key]
  );
  if (raw.includes("on")) return [true, set];
  if (raw.includes("off")) return [false, set];
  return [fallback, set];
}

const VIEW_KEY = "hidden-views";

/** The tools somebody keeps out of the sidebar. A project card is never one. */
export type HideableView = "timeline" | "tracker" | "wiki" | "reports";

const ALL_VIEWS: HideableView[] = ["timeline", "tracker", "wiki", "reports"];

export function useHiddenViews(): [
  HideableView[],
  { hide: (v: HideableView) => void; show: (v: HideableView) => void },
] {
  const [hidden, set] = useStoredSet<HideableView>(VIEW_KEY, ALL_VIEWS);
  const hide = useCallback(
    (view: HideableView) => {
      if (!hidden.includes(view)) set([...hidden, view]);
    },
    [hidden, set]
  );
  const show = useCallback(
    (view: HideableView) => set(hidden.filter((v) => v !== view)),
    [hidden, set]
  );
  return [hidden, { hide, show }];
}

/**
 * The projects whose tools somebody has folded away in the sidebar.
 *
 * Stored the other way up from how it reads: every project shows its tools to
 * begin with — a sidebar that hides what a project is made of until you click
 * it is a sidebar you have to explore — so what is remembered is the folding,
 * and a project nobody has touched is open.
 *
 * Ids rather than names, and unknown ones are simply carried: a project deleted
 * in another tab leaves a line in storage that answers to nothing, which costs
 * nothing, and rejoining it to a real project id is what makes it mean anything
 * again.
 */
export function useFoldedProjects(): [
  Set<string>,
  (projectId: string, folded: boolean) => void,
] {
  const raw = useSyncExternalStore(
    subscribe,
    () => snapshot(FOLDED_PROJECTS_KEY),
    () => EMPTY
  );
  const folded = useMemo(() => new Set(raw), [raw]);
  const set = useCallback(
    (projectId: string, next: boolean) => {
      const without = raw.filter((id) => id !== projectId);
      store(FOLDED_PROJECTS_KEY, next ? [...without, projectId] : without);
    },
    [raw]
  );
  return [folded, set];
}

const FOLDED_PROJECTS_KEY = "folded-projects";

/**
 * Whether the timeline is folded down to whole tasks, with their steps put
 * away. A long plan reads as its shape when the parts are folded in, and this
 * is the reader's own choice, so it is remembered like the rest of them.
 */
export function useFoldedSteps() {
  return useStoredFlag("folded-steps");
}

/**
 * Whether the timeline draws the links between tasks that wait on each other.
 * On to begin with: a plan that has dependencies at all is a plan whose shape
 * is mostly in them, and a board without any draws nothing either way.
 */
export function useShowDependencies() {
  return useStoredFlag("show-dependencies", true);
}

/**
 * And whether it picks out the longest chain through those links — the run of
 * work where a day lost is a day off the end of everything.
 */
export function useShowCriticalPath() {
  return useStoredFlag("show-critical-path", true);
}

/**
 * Whether somebody keeps their notes in the sidebar.
 *
 * On to begin with, and their own choice either way: notes are private to
 * whoever is signed in, so whether they are on show is as personal as what is
 * written in them — and the answer belongs to this browser rather than to the
 * workspace, like the boards somebody puts away.
 */
export function useShowNotes() {
  return useStoredFlag("show-notes", true);
}

/**
 * And whether they keep the roster there. The same question as the one above,
 * and the same answer's to give: the sidebar is a view of the workspace rather
 * than the workspace itself, so what somebody keeps in their own is theirs.
 *
 * Putting Team away hides the screen, not the right to it — the chip that
 * brings it back is right there, and nothing about who may read the roster
 * changes either way.
 */
export function useShowTeam() {
  return useStoredFlag("show-team", true);
}

/**
 * How wide somebody has dragged the timeline's columns. Sizing a table is a
 * choice about a screen, not about the work, so it lives here with the rest of
 * them — and it survives a reload, which is the whole point of dragging it once.
 */
export function useColumnWidths(): [
  Record<string, number> | null,
  (widths: Record<string, number>) => void,
] {
  const raw = useSyncExternalStore(
    subscribe,
    () => snapshot(COLUMN_KEY),
    () => EMPTY
  );

  // Stored as "task:240,status:132" — a shape the same list store can hold, and
  // one that survives a key nobody uses any more.
  const widths = useMemo(() => {
    if (raw.length === 0) return null;
    const out: Record<string, number> = {};
    for (const pair of raw) {
      const [key, value] = pair.split(":");
      const width = Number(value);
      if (key && Number.isFinite(width)) out[key] = width;
    }
    return Object.keys(out).length > 0 ? out : null;
  }, [raw]);

  const set = useCallback(
    (next: Record<string, number>) =>
      store(
        COLUMN_KEY,
        Object.entries(next).map(([key, width]) => `${key}:${Math.round(width)}`)
      ),
    []
  );

  return [widths, set];
}

const COLUMN_KEY = "column-widths";

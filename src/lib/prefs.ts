"use client";

import { useCallback, useSyncExternalStore } from "react";
import { STATUS_OPTIONS, TaskStatus } from "@/lib/types";

/**
 * The small choices somebody makes about their own view of the workspace —
 * which tracker columns they have put away, which boards they keep in the
 * sidebar. They belong to the browser rather than the workspace: nobody else's
 * board should rearrange itself because of what one person hid.
 *
 * Stored as a comma-separated list under one key each, and read through
 * `useSyncExternalStore` so every component that cares — the tracker, the
 * timeline, a status pill in either — agrees within the same render.
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

/** A remembered yes or no, stored as the same kind of list as the sets above. */
function useStoredFlag(key: string): [boolean, (on: boolean) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => EMPTY
  );
  const set = useCallback((on: boolean) => store(key, on ? ["on"] : []), [key]);
  return [raw.includes("on"), set];
}

const STATUS_KEY = "hidden-statuses";
const VIEW_KEY = "hidden-views";

const ALL_STATUSES = STATUS_OPTIONS.map((s) => s.value);

/**
 * Statuses somebody has put away. Hiding a tracker column hides that state of
 * the work everywhere it is offered — the timeline's tally, and the pickers
 * that would otherwise let it back in through the side door — until it is
 * brought back.
 */
export function useHiddenStatuses(): [
  TaskStatus[],
  { hide: (s: TaskStatus) => void; show: (s: TaskStatus) => void; showAll: () => void },
] {
  const [hidden, set] = useStoredSet<TaskStatus>(STATUS_KEY, ALL_STATUSES);
  const hide = useCallback(
    (status: TaskStatus) => {
      if (!hidden.includes(status)) set([...hidden, status]);
    },
    [hidden, set]
  );
  const show = useCallback(
    (status: TaskStatus) => set(hidden.filter((s) => s !== status)),
    [hidden, set]
  );
  const showAll = useCallback(() => set([]), [set]);
  return [hidden, { hide, show, showAll }];
}

/** The tools somebody keeps out of the sidebar. A project card is never one. */
export type HideableView = "timeline" | "tracker" | "wiki";

const ALL_VIEWS: HideableView[] = ["timeline", "tracker", "wiki"];

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
 * Whether the timeline is folded down to whole tasks, with their steps put
 * away. A long plan reads as its shape when the parts are folded in, and this
 * is the reader's own choice, so it is remembered like the rest of them.
 */
export function useFoldedSteps() {
  return useStoredFlag("folded-steps");
}

/**
 * The statuses on offer, given what is hidden. The one already on a task is
 * always among them: a hidden column is somewhere nobody is looking, not
 * somewhere the work stops existing.
 */
export function offeredStatuses(hidden: TaskStatus[], current?: TaskStatus) {
  return STATUS_OPTIONS.filter(
    (s) => !hidden.includes(s.value) || s.value === current
  );
}

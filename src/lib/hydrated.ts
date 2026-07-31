"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: the answer changes once, at hydration. */
const never = () => () => {};

/**
 * Whether this render is the browser's rather than the server's.
 *
 * Some of what a form offers only the browser knows — which time zones this
 * engine can keep, which one the reader is sitting in. Rendering that on the
 * server and again in the browser is how a select ends up with two different
 * sets of options and React tears the tree down. Asking here instead means the
 * first paint matches the server exactly, and the browser's answer arrives on
 * the render after it.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    never,
    () => true,
    () => false
  );
}

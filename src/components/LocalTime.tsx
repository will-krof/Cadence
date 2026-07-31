"use client";

import { useSyncExternalStore } from "react";
import { offsetFromViewer, timeIn, zoneLabel } from "@/lib/timezones";

/**
 * The minute, as something to subscribe to.
 *
 * A roster can hold forty people, and forty timers all waking a second apart to
 * redraw the same digit is forty timers too many — so there is one, shared by
 * every clock on the page, and it fires on the minute rather than sixty seconds
 * after whenever its first reader mounted. Clocks then change together, which
 * is what a page of them ought to look like.
 */
const readers = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let minute = 0;

function currentMinute() {
  return Math.floor(Date.now() / 60_000) * 60_000;
}

function schedule() {
  const now = Date.now();
  timer = setTimeout(
    () => {
      minute = currentMinute();
      for (const wake of readers) wake();
      schedule();
    },
    // To the top of the next minute, plus a hair so a clock that fires early
    // doesn't read the minute it has just left.
    60_000 - (now % 60_000) + 50
  );
}

function subscribe(onChange: () => void) {
  if (readers.size === 0) {
    // Nothing has been ticking, so whatever was last stamped is stale.
    minute = currentMinute();
    schedule();
  }
  readers.add(onChange);
  return () => {
    readers.delete(onChange);
    if (readers.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  if (!minute) minute = currentMinute();
  return minute;
}

// The server has no reader and no now worth sending: a clock rendered there is
// the server's minute, replaced a moment later in the browser. Zero stands for
// "no clock yet", and the component draws nothing until hydration.
function getServerSnapshot() {
  return 0;
}

/**
 * What time it is where somebody is, kept ticking. The card stores a zone; this
 * is the clock read off it, which is the thing a colleague actually wanted to
 * know before they sent the message.
 */
export function LocalTime({
  timezone,
  showZone = false,
  showOffset = false,
  className = "",
}: {
  timezone: string;
  /** Add the zone's name after the clock, for a card with room for it. */
  showZone?: boolean;
  /** Add how far off the reader's own clock it is. */
  showOffset?: boolean;
  className?: string;
}) {
  const stamp = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!stamp) return null;

  const now = new Date(stamp);
  const clock = timeIn(timezone, now);
  // A zone this engine can't keep — one saved before a tzdata change, say.
  // Better to show the name that was written than an apology.
  if (!clock) return <span className={className}>{zoneLabel(timezone)}</span>;

  const offset = showOffset ? offsetFromViewer(timezone, now) : null;
  const tail = [showZone ? zoneLabel(timezone) : null, offset]
    .filter(Boolean)
    .join(" · ");

  return (
    <span className={className}>
      <time dateTime={now.toISOString()} className="tabular-nums">
        {clock}
      </time>
      {tail && <span className="ml-1.5 text-[var(--ink-muted)]">{tail}</span>}
    </span>
  );
}

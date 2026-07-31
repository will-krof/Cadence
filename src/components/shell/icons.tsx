import type { ReactNode } from "react";
import { HideableView } from "@/lib/prefs";

/**
 * The marks the sidebar is drawn with. Inline SVG rather than files: the app
 * fetches no images at all, and a handful of paths cost less than the requests
 * would have.
 */

export const TIMELINE_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="3" width="8" height="2.6" rx="1.3" fill="currentColor" />
    <rect x="4" y="6.7" width="10.5" height="2.6" rx="1.3" fill="currentColor" />
    <rect x="1.5" y="10.4" width="6.5" height="2.6" rx="1.3" fill="currentColor" />
  </svg>
);

export const TRACKER_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect
      x="1.6"
      y="2.4"
      width="4.3"
      height="11.2"
      rx="1.4"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <rect
      x="10.1"
      y="2.4"
      width="4.3"
      height="7"
      rx="1.4"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);


/** Notes: a page with a couple of lines on it, and a corner turned. */
export const NOTES_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M3 2.4h6.2L13 6.2v7.4H3V2.4z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M9 2.6v3.6h3.6M5.4 9h5.2M5.4 11.2h3.4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const TEAM_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="6" cy="5" r="2.6" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M1.6 13.2c0-2.4 2-4 4.4-4s4.4 1.6 4.4 4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M11 3.2a2.4 2.4 0 010 4.4M12.2 9.6c1.4.5 2.2 1.8 2.2 3.6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const WIKI_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path
      d="M2.5 3.2c1.9-.7 3.7-.7 5.5.4 1.8-1.1 3.6-1.1 5.5-.4v9.1c-1.9-.7-3.7-.7-5.5.4-1.8-1.1-3.6-1.1-5.5-.4V3.2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M8 3.6v9.1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

/** What a tool is called, put away or on show. */
export const VIEW_LABELS: Record<HideableView, string> = {
  timeline: "Timeline",
  tracker: "Tracker",
  wiki: "Wiki",
};

/** And how it is drawn, so a list of tools is one list rather than three. */
export const VIEW_ICONS: Record<HideableView, ReactNode> = {
  timeline: TIMELINE_ICON,
  tracker: TRACKER_ICON,
  wiki: WIKI_ICON,
};

/**
 * The order they are always listed in: when the work runs, where it stands,
 * what the project wrote down about it. Sidebar and project card agree on it.
 */
export const VIEW_ORDER: HideableView[] = ["timeline", "tracker", "wiki"];

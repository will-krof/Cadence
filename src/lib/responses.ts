import { NextResponse } from "next/server";

/**
 * The answers the routes give when a request doesn't get to happen, in one
 * place — they were spelled out a route at a time, and the wording of a refusal
 * is part of how the app behaves rather than a detail of one endpoint.
 *
 * Two rules hold across all of them. A thing the caller may not reach answers
 * 404 rather than 403, so a probe can't map what exists by the shape of the
 * refusal; and the one 403 that is left says what it is about — a role that
 * can't do something is a fact about the caller's own workspace, which they can
 * already see.
 */
export const notFound = (what: string) =>
  NextResponse.json({ error: `${what} not found` }, { status: 404 });

export const forbidden = (
  message = "Your role can't do that"
) => NextResponse.json({ error: message }, { status: 403 });

export const badRequest = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

export const conflict = (message: string) =>
  NextResponse.json({ error: message }, { status: 409 });

/** For the deletes, which have nothing to hand back but the fact it worked. */
export const done = () => NextResponse.json({ ok: true });

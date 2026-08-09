import { gzip as gzipCallback } from "node:zlib";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

const gzip = promisify(gzipCallback);

/** Below this, compressing costs more than it saves. */
const MIN_BYTES = 1024;

/** One workspace's data: never a shared cache's to keep, or to hand on. */
const PRIVATE = "no-store, private";

/**
 * JSON for the list endpoints, gzipped when it is worth it.
 *
 * Next compresses what it renders, but a route handler's response is streamed
 * and goes out untouched — which for a board's worth of tasks meant six figures
 * of bytes on the wire. Compressing here is a few milliseconds for roughly a
 * tenth of the transfer.
 *
 * Those milliseconds used to be spent on the event loop: `gzipSync` stops the
 * process, so one person opening a large board paused every other request in
 * flight — and the endpoints that call this are exactly the ones with enough
 * data to be worth compressing. The async form does the same work on libuv's
 * thread pool, off the one thread everything else is queued behind. It is the
 * same few milliseconds for the person who asked, and none at all for everybody
 * who happened to ask at the same moment.
 */
export async function jsonResponse(request: NextRequest, data: unknown) {
  const body = JSON.stringify(data);
  const accepted = request.headers.get("accept-encoding") ?? "";

  if (body.length < MIN_BYTES || !accepted.includes("gzip")) {
    // The body it was already given, rather than `NextResponse.json(data)` —
    // which would walk the whole answer and build the same string a second
    // time, on exactly the responses too small to be worth compressing but
    // numerous enough to be worth not doing twice.
    return new NextResponse(body, {
      headers: {
        "content-type": "application/json",
        "cache-control": PRIVATE,
      },
    });
  }

  const packed = await gzip(body);
  return new NextResponse(packed, {
    headers: {
      "content-type": "application/json",
      "content-encoding": "gzip",
      "content-length": String(packed.length),
      // Caches must not hand a gzipped body to a client that didn't ask.
      vary: "Accept-Encoding",
      "cache-control": PRIVATE,
    },
  });
}

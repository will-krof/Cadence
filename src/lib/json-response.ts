import { gzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";

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
 */
export function jsonResponse(request: NextRequest, data: unknown) {
  const body = JSON.stringify(data);
  const accepted = request.headers.get("accept-encoding") ?? "";

  if (body.length < MIN_BYTES || !accepted.includes("gzip")) {
    return NextResponse.json(data, { headers: { "cache-control": PRIVATE } });
  }

  const packed = gzipSync(body);
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

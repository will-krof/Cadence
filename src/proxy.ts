import { NextRequest, NextResponse } from "next/server";

/**
 * The two things worth doing to every request before it reaches a route.
 *
 * 1. A content security policy, so a stray bit of injected markup has nowhere
 *    to load a script from. Scripts are allowed by nonce only; the nonce is
 *    minted per request and Next hands it to its own bundles.
 * 2. A same-origin check on anything that changes data. Session cookies are
 *    already `SameSite=Lax`, which keeps them off cross-site form posts; this
 *    is the belt to that braces, and it refuses the request outright rather
 *    than letting it run without a session.
 */
const SECURITY_HEADERS: Record<string, string> = {
  // No sniffing a JSON response into something executable.
  "x-content-type-options": "nosniff",
  // Framing is refused by CSP as well; this covers browsers that predate it.
  "x-frame-options": "DENY",
  // Paths carry invite tokens, so never send one to another site.
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-dns-prefetch-control": "off",
  // Nothing here needs the camera, the microphone or where you are.
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  // A year of HSTS. Harmless over http, which browsers ignore it on.
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

const IS_DEV = process.env.NODE_ENV === "development";

/**
 * The policy, built once. Only the nonce changes per request, so the rest is
 * assembled at module load rather than on every page view.
 */
function policyTemplate(isDev: boolean) {
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets a trusted script load its own chunks; nothing else
    // gets in. React needs eval in development for its error overlay.
    `script-src 'self' 'nonce-NONCE' 'strict-dynamic'${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    // The app styles elements inline — a colour here, a grid there — which is
    // what 'unsafe-inline' is for. It is style, not script: nothing executes.
    "style-src 'self' 'unsafe-inline'",
    // The app uploads and stores no images at all: what it draws is its own
    // few inline marks, and a letter where a photo would have gone.
    "img-src 'self' data:",
    "font-src 'self' data:",
    // Talks to itself only; the dev server also wants its websocket.
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

const POLICY = policyTemplate(IS_DEV);

const contentSecurityPolicy = (nonce: string) =>
  POLICY.replace("NONCE", nonce);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True when a state-changing request came from somewhere else. A browser always
 * sends `Origin` on a cross-site write, so a mismatch is a forgery attempt; a
 * request with neither header is something that isn't a browser, and cannot be
 * carrying a victim's cookies against their will.
 */
function crossSiteWrite(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return false;

  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;

  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.headers.get("host");
  } catch {
    return true;
  }
}

export function proxy(request: NextRequest) {
  if (crossSiteWrite(request)) {
    return NextResponse.json(
      { error: "Cross-site requests are not allowed" },
      { status: 403 }
    );
  }

  const nonce = crypto.randomUUID();
  const csp = contentSecurityPolicy(nonce);

  // Next reads the policy off the request to nonce its own script tags.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  // Everything but the static assets, which need no policy of their own.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

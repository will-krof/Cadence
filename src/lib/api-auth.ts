import { NextResponse } from "next/server";
import { getSessionUser, SessionUser } from "@/lib/auth";

/**
 * Resolves the caller, or the 401 response to return. Every data route starts
 * with this so nothing is reachable without a session.
 */
export async function requireUser(): Promise<
  { user: SessionUser; response?: never } | { user?: never; response: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  return { user };
}

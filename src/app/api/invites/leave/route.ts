import { cookies } from "next/headers";
import { INVITE_COOKIE } from "@/lib/invite";
import { NextResponse } from "next/server";

/** A guest stepping out. The link still works; this browser just forgets it. */
export async function POST() {
  const store = await cookies();
  store.delete(INVITE_COOKIE);
  return NextResponse.json({ ok: true });
}

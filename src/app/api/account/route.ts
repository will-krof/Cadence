import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/viewer";
import { badRequest, conflict, done, notFound } from "@/lib/responses";
import {
  destroySession,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  passwordProblem,
  verifyPassword,
} from "@/lib/auth";
import { boundedText, LIMITS } from "@/lib/sanitize";
import { jsonResponse } from "@/lib/json-response";
import { NextRequest, NextResponse } from "next/server";

/**
 * Whoever is signed in, about themselves. Two kinds of account read this — the
 * one that owns a workspace, and a team member who came in through an invite —
 * so it answers in one shape with what each of them has: a name, a way in, when
 * they joined, and what they are.
 *
 * Nobody else's account is reachable here, which is what makes it safe to let
 * somebody change their own.
 */
export async function GET(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  if (viewer.kind === "owner") {
    const user = await prisma.user.findUnique({
      where: { id: viewer.user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    if (!user) return notFound("Account");
    return jsonResponse(request, {
      kind: "owner" as const,
      id: user.id,
      name: user.name,
      email: user.email,
      /** ADMIN of their own workspace; SUPERADMIN also reads the install's size. */
      role: user.role,
      createdAt: user.createdAt,
      username: null,
      places: [],
    });
  }

  const developer = await prisma.developer.findUnique({
    where: { id: viewer.developerId },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      createdAt: true,
      memberships: {
        select: {
          project: { select: { id: true, name: true } },
          roles: { select: { role: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!developer) return notFound("Account");

  return jsonResponse(request, {
    kind: "member" as const,
    id: developer.id,
    name: developer.name,
    email: developer.email,
    username: developer.username,
    /** A member's role isn't one word — it is what they hold, project by project. */
    role: null,
    createdAt: developer.createdAt,
    places: developer.memberships.map((m) => ({
      projectId: m.project.id,
      project: m.project.name,
      roles: m.roles.map((r) => r.role.name),
    })),
  });
}

/**
 * Changing your own name, your own way in, or your own password. A password
 * change asks for the current one first: a session left open on a shared
 * machine shouldn't be enough to lock its owner out of their workspace.
 */
export async function PATCH(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const body = await request.json().catch(() => ({}));

  const named = boundedText(body.name, LIMITS.name);
  if ("tooLong" in named) return badRequest("That name is too long");

  let passwordHash: string | undefined;
  if (body.newPassword !== undefined) {
    const weak = passwordProblem(body.newPassword);
    if (weak) return badRequest(weak);
    if (typeof body.newPassword === "string" && body.newPassword.length > LIMITS.password) {
      return badRequest(`Password must be ${LIMITS.password} characters or fewer`);
    }

    const current =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const stored =
      viewer.kind === "owner"
        ? (
            await prisma.user.findUnique({
              where: { id: viewer.user.id },
              select: { passwordHash: true },
            })
          )?.passwordHash
        : (
            await prisma.developer.findUnique({
              where: { id: viewer.developerId },
              select: { passwordHash: true },
            })
          )?.passwordHash;

    if (!stored || !(await verifyPassword(current, stored))) {
      return badRequest("That isn’t your current password");
    }
    passwordHash = await hashPassword(body.newPassword);
  }

  if (viewer.kind === "owner") {
    let email: string | undefined;
    if (body.email !== undefined) {
      const next = normalizeEmail(body.email);
      if (next.length > LIMITS.email || !isValidEmail(next)) {
        return badRequest("Enter a valid email");
      }
      if (next !== viewer.user.email) {
        const taken = await prisma.user.findUnique({
          where: { email: next },
          select: { id: true },
        });
        if (taken) return conflict("That email is already in use");
      }
      email = next;
    }

    const user = await prisma.user.update({
      where: { id: viewer.user.id },
      data: {
        name: body.name === undefined ? undefined : named.value,
        email,
        passwordHash,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    return NextResponse.json({ ...user, kind: "owner", username: null, places: [] });
  }

  // A member's name is their own to write; their username is what the invite
  // link set up, and their email belongs to the profile the workspace keeps.
  const developer = await prisma.developer.update({
    where: { id: viewer.developerId },
    data: {
      name: body.name === undefined ? undefined : named.value ?? undefined,
      passwordHash,
    },
    select: { id: true, name: true, email: true, username: true, createdAt: true },
  });
  return NextResponse.json({
    ...developer,
    kind: "member",
    role: null,
    places: [],
  });
}

/**
 * Closing your own account, which means two different things.
 *
 * For the account that owns a workspace it is the whole workspace: its
 * projects, its tasks, its roster and every invite in it, because all of that
 * hangs off the one row and nothing of it outlives its owner. For a team
 * member it is their way in — their username, their password, their open
 * sessions — and not their profile, which belongs to the workspace that wrote
 * it. Somebody leaving a company doesn't get to erase the record of their work
 * on the way out, and the admin can delete the person properly from the roster.
 *
 * Both are asked for the current password. A session left open on a shared
 * machine is not permission to end somebody's workspace.
 */
export async function DELETE(request: NextRequest) {
  const { viewer, response } = await requireViewer();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  const stored =
    viewer.kind === "owner"
      ? (
          await prisma.user.findUnique({
            where: { id: viewer.user.id },
            select: { passwordHash: true },
          })
        )?.passwordHash
      : (
          await prisma.developer.findUnique({
            where: { id: viewer.developerId },
            select: { passwordHash: true },
          })
        )?.passwordHash;

  if (!stored || !(await verifyPassword(password, stored))) {
    return badRequest("That isn’t your password");
  }

  if (viewer.kind === "owner") {
    // Everything in the workspace hangs off this row by a cascade, so deleting
    // it is the whole thing going at once rather than a sweep that could stop
    // halfway and leave a half-erased workspace behind.
    await prisma.user.delete({ where: { id: viewer.user.id } });
  } else {
    await prisma.$transaction([
      prisma.developerSession.deleteMany({
        where: { developerId: viewer.developerId },
      }),
      prisma.developer.update({
        where: { id: viewer.developerId },
        data: { username: null, passwordHash: null },
      }),
    ]);
  }

  await destroySession();
  return done();
}

#!/usr/bin/env node
/**
 * Grants or takes back the superadmin badge. Deliberately a command rather than
 * a screen: nothing in the app can hand this out, so no bug in the app can.
 *
 *   npm run make-superadmin -- you@example.com
 *   npm run make-superadmin -- you@example.com --revoke
 *
 * The badge buys install-wide counts and nothing else — no reach into anybody's
 * workspace, projects or people.
 */
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(
    "Usage: npm run make-superadmin -- you@example.com [--revoke]"
  );
  process.exit(1);
}

const role = revoke ? "ADMIN" : "SUPERADMIN";
const quoted = `'${email.replace(/'/g, "''")}'`;

try {
  const out = execFileSync(
    "npx",
    ["prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"],
    {
      input: `UPDATE "User" SET "role" = '${role}' WHERE "email" = ${quoted};`,
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
  void out;
  console.log(
    revoke
      ? `${email} is a plain admin again (if the account exists).`
      : `${email} is a superadmin now (if the account exists).`
  );
  // The role is read from the row on every request, so a session already open
  // picks this up on its next page load.
  console.log("Reload the app to see it.");
} catch (error) {
  console.error(`${error.stdout ?? ""}${error.stderr ?? ""}`.trim() || error.message);
  process.exit(1);
}

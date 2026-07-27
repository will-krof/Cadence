#!/usr/bin/env node
/**
 * Creates a workspace account, since the app has no sign-up: people join a
 * project through an invite link, and the account that owns the workspace is
 * made here.
 *
 *   npm run create-account -- you@example.com --name "Your Name"
 *
 * The password is asked for without echoing it, so it stays out of shell
 * history; `--password` is there for scripts that need it.
 *
 * The row goes in through `prisma db execute`, which means this needs no
 * dependency the project doesn't already have.
 */
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";

const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 8;

function parseArgs(argv) {
  const args = { email: "", name: "", password: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--name") args.name = argv[++i] ?? "";
    else if (arg === "--password") args.password = argv[++i] ?? "";
    else if (!args.email) args.email = arg;
  }
  return args;
}

/** The format `src/lib/auth.ts` reads: scrypt$<salt-hex>$<key-hex>. */
function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

function askHidden(question) {
  return new Promise((resolve) => {
    // No `output` means readline echoes nothing, which is the whole point; the
    // prompt goes out on stderr so it still appears when stdout is redirected.
    const rl = createInterface({ input: process.stdin });
    process.stderr.write(question);
    rl.question("", (answer) => {
      process.stderr.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** SQLite string literal: the only thing to escape is the quote itself. */
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

const args = parseArgs(process.argv.slice(2));
const email = args.email.trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(
    "Usage: npm run create-account -- you@example.com --name \"Your Name\""
  );
  process.exit(1);
}

const password =
  args.password || (await askHidden(`Password for ${email}: `));

if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}

const sql = `INSERT INTO "User" ("id", "email", "name", "passwordHash", "createdAt")
VALUES (${quote(randomUUID())}, ${quote(email)}, ${
  args.name.trim() ? quote(args.name.trim()) : "NULL"
}, ${quote(hashPassword(password))}, CURRENT_TIMESTAMP);`;

try {
  execFileSync(
    "npx",
    ["prisma", "db", "execute", "--schema", "prisma/schema.prisma", "--stdin"],
    { input: sql, stdio: ["pipe", "pipe", "pipe"] }
  );
  console.log(`Account created: ${email}`);
  console.log("Log in at /login with that email and password.");
} catch (error) {
  const message = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  if (/UNIQUE constraint failed: User.email/i.test(message)) {
    console.error(`An account already exists for ${email}.`);
  } else {
    console.error(message.trim() || error.message);
  }
  process.exit(1);
}

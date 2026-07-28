import path from "node:path";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Where a relative SQLite file actually is.
 *
 * `DATABASE_URL="file:./dev.db"` — what the README hands you — means two
 * different files. The Prisma CLI reads a relative path as relative to the
 * schema, so `prisma migrate` writes `prisma/dev.db`; the app reads it as
 * relative to the working directory, so it opened `./dev.db`, found nothing,
 * and failed with "Unable to open the database file" on the first query. The
 * database the CLI made was never the database the app looked for.
 *
 * So the app is brought into line with the CLI rather than the other way
 * round: whatever `prisma migrate` created is what gets opened, and a database
 * with work in it doesn't move. Absolute URLs and every other provider are
 * passed through untouched.
 */
function resolveDatabaseUrl(url: string | undefined) {
  if (!url?.startsWith("file:")) return undefined;
  const file = url.slice("file:".length);
  // `file:/tmp/x.db` and in-memory URLs are already unambiguous.
  if (!file || path.isAbsolute(file) || file.startsWith(":")) return undefined;
  return `file:${path.resolve(process.cwd(), "prisma", file)}`;
}

const datasourceUrl = resolveDatabaseUrl(process.env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

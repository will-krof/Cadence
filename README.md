# Cadence

Sprint planning with a Gantt timeline, a kanban tracker and a team roster over
the same tasks. Built with Next.js, Prisma and SQLite.

## Getting started

```bash
npm install
echo 'DATABASE_URL="file:./dev.db"' > .env
npx prisma migrate dev
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Accounts

There is no sign-up. A workspace account is created out of band, and everyone
else comes in through an invite link, so the only self-serve door into the app
is a link an admin handed out.

To create the first account, hash a password and insert the row:

```bash
HASH=$(node -e "const {randomBytes,scryptSync}=require('node:crypto');const s=randomBytes(16);process.stdout.write('scrypt\$'+s.toString('hex')+'\$'+scryptSync(process.argv[1],s,64).toString('hex'))" 'your-password')

npx prisma db execute --schema prisma/schema.prisma --stdin <<SQL
INSERT INTO "User" ("id", "email", "name", "passwordHash", "createdAt")
VALUES (lower(hex(randomblob(16))), 'you@example.com', 'Your Name', '$HASH', CURRENT_TIMESTAMP);
SQL
```

The hash format is the one `src/lib/auth.ts` reads: `scrypt$<salt-hex>$<key-hex>`.

## Roles and invite links

Every project has its own roles, and a role is a list of what it can open:
timeline, tracker, team. One role per project is the admin, which always sees
everything and is the only one that edits the project. Someone can hold several
roles on the same project, and different roles on different projects.

Putting somebody on a project mints their invite link. Opening it lets them in
as themselves, with the roles they hold, and without an account:

- **Copy** hands the link over.
- **Regenerate** issues a new token, which kills the link they had.
- **Switch off** revokes the link, and whoever was using it is out on their next
  request.

Guests reach one project. Their roles decide which of its tools they can open;
they can move the work on the boards they can see, and everything else — the
project's settings, its roles, the roster, the links themselves — stays with the
workspace's owner.

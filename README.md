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
else picks their login through an invite link, so the only self-serve door into
the app is a link an admin handed out. Both kinds sign in on the same form: an
account by email, a team member by username.

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

Putting somebody on a project mints their invite link. Opening it shows them the
project and the roles it carries, then asks for a username and a password — that
login is how they get in from then on, and it is the only thing the link is spent
on. From the project card, or their profile in the Team view:

- **Copy** hands the link over.
- **Regenerate** issues a new token, which kills the link they had.
- **Switch off** revokes the link, so nobody can use it to set a login up.

**Links last three days.** Past that the link is dead, and a fresh one takes its
place — the next time an admin looks at the memberships, what they see is a live
link rather than an expired one. Once somebody has set their login up, their link
is spent and the row says so; taking them off the project is what ends their
access after that.

A signed-in member reaches the projects they are on, through the roles they hold
on each. They can move the work on the boards those roles open; everything else —
the project's settings, its roles, the roster, the links themselves — stays with
the workspace's owner.

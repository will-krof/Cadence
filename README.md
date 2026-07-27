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

To create one:

```bash
npm run create-account -- you@example.com --name "Your Name"
```

It asks for the password without echoing it. `--password` is there for scripts
that need it, at the cost of putting the password in your shell history.

Then log in at [/login](http://localhost:3000/login) with that email.

## Roles and invite links

Every project has its own roles, and a role is a list of what it can open:
timeline, tracker, team. One role per project is the admin, which always sees
everything and is the only one that edits the project. Someone can hold several
roles on the same project, and different roles on different projects.

People are added to the team first, which gives them a profile and nothing more.
Inviting them is a project's business: put them on a project, tick the roles they
should hold, and their invite link appears on the project card — a link with no
role behind it would open nothing, so there isn't one until there is a role. Take
every role away again and the link goes with them.

Opening the link shows them the project and the roles it carries, then asks for a
username and a password — that login is how they get in from then on, and it is
the only thing the link is spent on. From the project card:

- **Copy** hands the link over.
- **Regenerate** issues a new token, which kills the link they had.
- **Switch off** revokes the link, so nobody can use it to set a login up.

**Links last three days.** Past that the link is dead, and a fresh one takes its
place — the next time an admin looks at the memberships, what they see is a live
link rather than an expired one. Once somebody has set their login up, their link
is spent and the row says so; taking them off the project is what ends their
access after that.

## Sprints

A project runs as a series of sprints, and each one is its own board. When a
sprint is done with, **Archive** puts it away: nothing moves, and its tasks stay
where they are. It drops out of the run of sprints on the project card into an
"Archived" group, and a board never lands on it — though it can still be opened
from the sprint picker, under "Archived", so the work in it stays reachable.
**Restore** brings it back.

## Sharing a profile

Every profile has an address of its own — `/people/<id>` — and a **Share** button
in the corner of the card that copies it. The link is an address, not a key:
opening it takes a session, and a project shared with that person. Any role will
do, so a colleague who can't open the Team view can still read a teammate's
profile. Anybody else is told the page doesn't exist, which is also the answer to
somebody trying ids.

Colleagues see the working half of a profile: name, job title, the projects they
have in common and the roles held there, and the work on those projects. Pay,
contact details and notes are the workspace's own, and only its owner sees them —
on the shared page as well as in the roster.

## Who reaches what

A signed-in member reaches the projects they are on, through the roles they hold
on each. They can move the work on the boards those roles open; everything else —
the project's settings, its roles, the roster, the links themselves — stays with
the workspace's owner.

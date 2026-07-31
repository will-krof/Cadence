<div align="center">

# Cadence

### Sprint planning that doesn't make you choose between a Gantt chart and a board.

One set of tasks. A timeline for the plan, a kanban tracker for the day,
a roster for the people — and a project card that decides which of them
this project even needs.

[![Next.js](https://img.shields.io/badge/Next.js-16.2-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-087EA4?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io)
[![SQLite](https://img.shields.io/badge/SQLite-file--based-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org)
[![Self-hosted](https://img.shields.io/badge/Self--hosted-one%20command-16a34a?style=flat-square)](#quick-start)

<br />

<img src="docs/screenshots/timeline.png" alt="The Cadence timeline: a sprint's tasks as Gantt bars, with status and assignees on every row" width="100%" />

</div>

<br />

## Why Cadence

Most tools give you one shape of the truth and sell you the other one as an
upgrade. Cadence draws the same tasks four ways and lets each project decide
which of them it wants.

|  | |
|---|---|
| **📅 Timeline** | A Gantt chart of the sprint. Drag a bar to move the work, drag its edge to change how long it takes. Weekends fold away. |
| **🗂 Tracker** | The same tasks as cards in five columns. Drag between them, hide the columns nobody is watching, filter to one person. |
| **👥 Team** | A roster with a profile per person — what they do, what they're on, what they're carrying, and what time it is where they are. Pay and contact details stay with the workspace owner. |
| **📖 Wiki** | A per-project tree of pages for the things that aren't tasks. |
| **🗒 Notes** | A private pile per person, in whatever order they drag it into. Nobody else in the workspace can read them. |
| **🔑 Roles & invite links** | Every project has its own roles, and a role is a list of what it opens. Invite somebody with a link that expires in three days and is spent on one login. |
| **🎚 Nothing you didn't ask for** | A project starts with everything switched off. Tick the tools it needs — and the fields a task should ask for — and the rest never appears. |

<br />

## Quick start

```bash
git clone https://github.com/will-krof/gantt-chart.git
cd gantt-chart

npm install                                # also generates the Prisma client
echo 'DATABASE_URL="file:./dev.db"' > .env
npx prisma migrate deploy                  # or: npx prisma migrate dev
npm run dev
```

Open **[localhost:3000](http://localhost:3000)** and sign up — the first account
owns the workspace. Or make one from the command line, which is handy on a
fresh database:

```bash
npm run create-account -- you@example.com --name "Your Name"
```

That's the whole install. The database is a file, so there is no server to run
beside the app and nothing to provision before it starts.

<br />

## A look around

<table>
<tr>
<td width="50%"><img src="docs/screenshots/tracker.png" alt="The tracker: tasks as cards in five status columns" /></td>
<td width="50%"><img src="docs/screenshots/project.png" alt="The project card: statistics, sprints, and the people on the project with their roles and invite links" /></td>
</tr>
<tr>
<td><b>The tracker.</b> Five columns, drag between them. Any column can be put away with the × in its header — a board of five is wider than a laptop — and comes back in one click with its count intact.</td>
<td><b>The project card.</b> Everything about one project in one place: how the work is going, the sprints, and who is on it — with their roles and their invite links right there.</td>
</tr>
<tr>
<td><img src="docs/screenshots/team.png" alt="The team roster with a profile open beside it" /></td>
<td><img src="docs/screenshots/timeline-dark.png" alt="The timeline in the dark theme" /></td>
</tr>
<tr>
<td><b>The roster.</b> Everyone in the workspace, searchable by name, job title or email, with the projects and the work each one carries.</td>
<td><b>Dark, too.</b> One toggle in the corner, remembered per browser.</td>
</tr>
</table>

<br />

## How it fits together

```
Workspace (one account)
├── Team roster ──────────── people, with a profile each
└── Projects
    ├── Roles ───────────── what a role opens: timeline · tracker · team · wiki
    ├── People ──────────── roster ∩ project, holding roles + an invite link
    ├── Sprints ─────────── each one its own board
    ├── Tasks ───────────── shared by up to four people, with steps,
    │                       dependencies, tags, comments and history
    └── Wiki ────────────── a tree of pages
```

A person is added to the **team** once and put on **projects** many times, with
different roles on each. A task belongs to a project and, if the project runs on
sprints, to a sprint. Everything else is a switch on the project card.

<br />

## The parts, in more detail

<details>
<summary><b>Accounts, invite links and how people get in</b></summary>

<br />

Signing up at `/signup` makes a workspace and makes you its admin: your
projects, your roster, your invite links, and nothing of anybody else's. Team
members don't sign up — they get a login through an invite link — and both kinds
sign in on the same form, an account by email and a member by username.

People are added to the team first, which gives them a profile and nothing more.
Inviting them is a project's business: put them on a project, tick the roles they
should hold, and their invite link appears on the project card. A link with no
role behind it would open nothing, so there isn't one until there is a role, and
taking every role away takes the link with it.

Opening the link shows them the project and the roles it carries, then asks for a
username and a password — that login is how they get in from then on, and it is
the only thing the link is spent on. From the project card:

- **Copy** hands the link over.
- **Regenerate** issues a new token, which kills the link they had.
- **Switch off** revokes the link, so nobody can use it to set a login up.

**Links last three days.** Past that the link is dead and a fresh one takes its
place — the next time an admin looks at the memberships, what they see is a live
link rather than an expired one. Once somebody has set their login up, their link
is spent and the row says so; taking them off the project is what ends their
access after that.

Somebody can be listed on a project without being on it: being handed a task puts
them there. Their row says which of the two it is, so taking a member off who
still carries work reads as what it is rather than as a button that did nothing.

</details>

<details>
<summary><b>What a project is made of</b></summary>

<br />

**A project starts with nothing switched on.** Creating one asks for a name and a
description, and then drops you on its card with the settings open — because what
a project is made of is a shorter question than what to take away from a project
that arrived with everything.

The Gantt chart, the tracker, sprints, the wiki and roles are each a checkbox,
and the team roster is not, because every project has people. Tick what this
project needs; come back under **Project settings** whenever that changes.
Switching a tool off later hides it — the sprints and roles already made are
kept, waiting where they were if it comes back.

With **sprints** off, the boards stop being one round's worth of work and show
the project's whole plan at once. With **roles** off, the permissions table and
the "viewing as" picker go — for a project one person runs, they are a screen of
questions nobody has.

A project can also say **when it runs**, rather than leaving it to be worked out
from the earliest and latest task. Set a start date, an end date, or just one of
them.

The same card says **what a task asks for**: its dates, its priority, its link,
its tags, its steps, its dependencies, its history, its comments. Each one can be
put away, and then the form stops offering it, the card stops drawing it, and the
boards stop marking it. Nothing already written is lost — turn a field back on and
it is all still there.

</details>

<details>
<summary><b>Tasks, sprints and the boards</b></summary>

<br />

A task is shared by **up to four people**: the boards draw a stack of faces of a
fixed width, so a row is the same size for a task shared by four as for one
nobody has picked up. Tasks carry steps, dependencies on other tasks, tags,
comments and a history of what changed and when.

**Dates are optional.** Work gets written down before anybody knows when it runs,
so a task with no dates is a task nobody has placed in time yet — it sits in the
timeline's list like any other, and the chart draws no bar for it. Give it dates
and the bar appears where they put it.

A project runs as a series of **sprints**, and each one is its own board. When a
sprint is done with, **Archive** puts it away: nothing moves, and its tasks stay
where they are. It drops out of the run of sprints on the project card into an
"Archived" group, and a board never lands on it — though it can still be opened
from the sprint picker, so the work in it stays reachable. **Restore** brings it
back.

On the **tracker**, columns are the five statuses, and any of them can be hidden
with the × in its header. Hidden columns collect above the board with their
counts, one click each to bring back, and their tasks were never filtered out of
anything.

In the **sidebar**, every project lists the tools it carries, open to begin with:
what the workspace is made of should be readable without clicking into it. Fold a
project away with the arrow beside it and it stays folded, per project and per
browser. Pressing a tool under a project opens that project *and* that tool,
which is what pressing it meant.

</details>

<details>
<summary><b>Who reaches what</b></summary>

<br />

Every project has its own roles, and a role is a list of what it can open:
timeline, tracker, team, wiki. One role per project is the admin, which always
sees everything and is the only one that edits the project. Someone can hold
several roles on the same project, and different roles on different projects.

A signed-in member reaches the projects they are on, through the roles they hold
on each. They can move the work on the boards those roles open; everything else —
the project's settings, its roles, the roster, the links themselves — stays with
the workspace's owner.

Commenting is the one thing a view-only role can still do. Opening a task shows
its history and, under it, what people have said about it: anybody who can open
the board can add to that, whether or not their role lets them change the work. A
comment can be taken back by whoever wrote it, and by the workspace's owner.

Every profile has an address of its own — `/people/<id>` — and a **Share** button
that copies it. The link is an address, not a key: opening it takes a session and
a project shared with that person. Colleagues see the working half of a profile;
pay, contact details and notes are the workspace's own.

A profile also says where in the world somebody is: a time zone, a country, the
languages they speak, and whether they work remotely, from an office, or both.
The zone is stored — `Europe/Kyiv`, not `+03:00`, so it stays right when the
clocks change — and the card reads the time off it, ticking on the minute. It
sits beside the name on the roster as well, so scrolling the list tells you who
is still at their desk. All four are the working half of a card: a colleague
plans around them, so a colleague can see them.

</details>

<details>
<summary><b>Superadmin</b></summary>

<br />

One badge above admin, and it buys exactly one thing: a panel at the foot of the
sidebar with counts of how the install is being used — how many admins there are,
how many projects and people they have between them, and the per-workspace
numbers. No names, no emails, no project titles, and no reach whatsoever into
anybody's workspace.

It is granted from the command line, never from the app, so nothing in the app
can hand it out:

```bash
npm run make-superadmin -- you@example.com
npm run make-superadmin -- you@example.com --revoke
```

</details>

<br />

## Built with

| | |
|---|---|
| **Next.js 16** (App Router) | Server components, route handlers under `src/app/api`, Turbopack in dev |
| **React 19** | One board provider over the whole app; boards, roster and wiki fetched when first opened |
| **Prisma 6 + SQLite** | The schema in `prisma/schema.prisma`, the client generated into `src/generated/prisma` |
| **Tailwind CSS 4** | One type scale, one card, one chip, one red — themed light and dark from CSS variables |
| **Sessions in httpOnly cookies** | scrypt password hashes, hashed session tokens, rate-limited login, `no-store` on every API answer |

```
src/
├── app/            routes and route handlers (the API lives under app/api)
├── components/     the boards, the shell, the project card, the roster, the wiki
├── lib/            what the routes share: auth, scopes, input parsing, selects
└── generated/      the Prisma client (not checked in)
prisma/             schema and migrations
scripts/            create-account, make-superadmin, preflight
```

<br />

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 (runs the preflight check first) |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run create-account -- <email> --name "Name"` | Makes a workspace account. Asks for the password without echoing it; `--password` exists for scripts, at the cost of your shell history |
| `npm run make-superadmin -- <email> [--revoke]` | Grants or takes back the superadmin badge |

<br />

## Troubleshooting

<details>
<summary><b>Turbopack can't resolve <code>@prisma/client/runtime/library</code></b></summary>

<br />

The generated client and the runtime it imports are one thing shipped as two
packages, and they have to be the same build. `npm run dev` checks this before
the dev server gets a chance to say it badly. The fix it prints:

```bash
rm -rf node_modules .next src/generated
npm ci
```

The Prisma client is generated into `src/generated/prisma`, which isn't checked
in — `npm install` generates it, so a fresh checkout needs nothing else. After
pulling a change that touches `prisma/schema.prisma`, run `npm install` (or
`npx prisma generate`) again to bring it back in step.

</details>

<details>
<summary><b>A migration says a column is already there</b></summary>

<br />

```
Error: P3018 … duplicate column name: taskHasSubtasks
Migration name: 20260730110000_task_steps_and_links_are_fields
```

That migration was released under a later timestamp and then moved earlier, so
that a database built from nothing applies it before the migration that rebuilds
the same table. A database that had already run it under the old name sees the
moved one as new and tries to add the columns a second time.

The columns are already there and the schema is right, so the migration only has
to be written down as done:

```bash
npx prisma migrate resolve --applied 20260730110000_task_steps_and_links_are_fields
npx prisma migrate deploy
```

A database created after this was written never meets it.

</details>

<br />

<div align="center">
<sub>Screenshots are of a seeded demo workspace. Sprint planning, without the ceremony.</sub>
</div>

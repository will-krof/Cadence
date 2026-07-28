"use client";

import { useCallback, useMemo, useState } from "react";
import { useBoard } from "@/components/BoardProvider";
import { Avatar, CloseIcon } from "@/components/ui";
import { useFeedback } from "@/components/Feedback";
import { ProfileCard } from "@/components/team/ProfileCard";
import { ProfileForm } from "@/components/team/ProfileForm";
import { Developer } from "@/lib/types";

/**
 * The workspace roster: everybody on the team, whatever they work on. It sits
 * beside the projects rather than inside one, because being on a project isn't
 * what makes somebody part of the company — an HR person on no project at all
 * still belongs here. Which people a *project* has is the project card's list.
 *
 * Adding somebody here gives them a profile and nothing else — putting them on
 * a project, and inviting them once they hold a role there, is the project's
 * business.
 *
 * Only the workspace's owner reads the whole of it. Anyone else arrives here
 * through a project whose role opens the roster, and sees that project's
 * people: `scope` is the projects they were let in by.
 */
export function TeamView({
  canEdit = true,
  canEditPeople = false,
  scope = null,
}: {
  canEdit?: boolean;
  /**
   * A role with the roster in an editing hand keeps the working half of a card
   * — a name, a title, a birthday, where somebody is this week — without the
   * rest of what the owner sees.
   */
  canEditPeople?: boolean;
  /** Project ids to read the team through, or null for the whole workspace. */
  scope?: string[] | null;
}) {
  const {
    developers,
    projects,
    memberships,
    setMemberRoles,
    removeMember,
    createDeveloper,
    updateDeveloper,
    setDeveloperActive,
    deleteDeveloper,
  } = useBoard();
  const { confirm } = useFeedback();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");

  // The projects this roster is read through: every project for the owner, and
  // for anyone else only the ones they were let in by.
  const teamProjects = useMemo(
    () =>
      projects.filter((p) => scope === null || scope.includes(p.id)),
    [projects, scope]
  );

  /**
   * Whose profiles the viewer may read. The owner's workspace is whole — people
   * on no project at all, an HR hire among them, are still on the team. Anyone
   * else sees the people of the projects that let them in, and nobody else.
   */
  const roster = useMemo(() => {
    if (scope === null) return developers;
    const shown = new Set<string>();
    for (const m of memberships) {
      if (scope.includes(m.projectId)) shown.add(m.developerId);
    }
    return developers.filter((d) => shown.has(d.id));
  }, [developers, memberships, scope]);

  /**
   * Writes what the form staged: only the projects whose answer changed, so
   * saving a profile doesn't churn every membership the person has.
   */
  const applyPlaces = useCallback(
    async (developerId: string, places: Map<string, string[]>) => {
      const before = new Map<string, string[]>();
      for (const m of memberships) {
        if (m.developerId === developerId) before.set(m.projectId, m.roleIds);
      }

      const same = (a: string[] = [], b: string[] = []) =>
        a.length === b.length && a.every((id) => b.includes(id));

      const work: Promise<void>[] = [];
      for (const project of teamProjects) {
        const was = before.has(project.id);
        const now = places.has(project.id);
        if (!was && !now) continue;
        if (was && !now) {
          work.push(removeMember(project.id, developerId));
        } else if (!same(before.get(project.id), places.get(project.id))) {
          work.push(
            setMemberRoles(project.id, developerId, places.get(project.id) ?? [])
          );
        }
      }
      await Promise.all(work);
    },
    [memberships, teamProjects, removeMember, setMemberRoles]
  );

  const selected = useMemo(
    () => roster.find((d) => d.id === selectedId) ?? null,
    [roster, selectedId]
  );

  // Counted once instead of scanning every membership for every row drawn, and
  // counting only the projects the viewer is allowed to know about.
  const projectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of memberships) {
      if (scope !== null && !scope.includes(m.projectId)) continue;
      counts.set(m.developerId, (counts.get(m.developerId) ?? 0) + 1);
    }
    return counts;
  }, [memberships, scope]);

  /**
   * What somebody typed, against the three things they would type it for: a
   * name, what that person does, and how to reach them. A roster is a list of
   * people you already know — you search it for the one you have in mind, not
   * to discover anybody — so it matches anywhere in the words rather than only
   * at their start.
   */
  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter((d) =>
      [d.name, d.role, d.email].some((field) =>
        field?.toLowerCase().includes(needle)
      )
    );
  }, [roster, query]);

  const active = useMemo(() => found.filter((d) => d.active), [found]);
  const archived = useMemo(() => found.filter((d) => !d.active), [found]);
  const searching = query.trim().length > 0;

  // Two ways to write a profile: the owner's, which is all of it, and a role's,
  // which is the half a colleague can be trusted with.
  const mayWrite = canEdit || canEditPeople;
  const showingDetail = creating || selected != null;
  const editing = creating || (selected != null && editingId === selected.id);

  async function removePerson(person: Developer) {
    const ok = await confirm({
      title: `Delete ${person.name}?`,
      body: "This erases their profile for good. Archive them instead if you only want them out of the way.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    await deleteDeveloper(person.id);
    setSelectedId(null);
    setEditingId(null);
  }

  function openPerson(id: string) {
    setCreating(false);
    setEditingId(null);
    setSelectedId(id);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <div
        className={`thin-scroll flex flex-col gap-4 overflow-y-auto border-b border-[var(--hairline)] p-4 lg:w-80 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-5 ${
          showingDetail ? "hidden lg:flex" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="t-heading">
            Team
            <span className="ml-2 font-normal text-[var(--ink-muted)]">
              {roster.filter((d) => d.active).length}
            </span>
          </h2>
          {canEdit && (
            <button
              onClick={() => {
                setSelectedId(null);
                setEditingId(null);
                setCreating(true);
              }}
              className="btn-primary"
            >
              Add person
            </button>
          )}
        </div>

        {/* Offered as soon as there is more than one person to tell apart. A
            control that appears at some size and not another is a rule the
            reader has to learn before they can rely on it. */}
        {roster.length > 1 && (
          <div className="relative flex items-center">
            <span
              className="pointer-events-none absolute left-2.5 text-[var(--ink-muted)]"
              aria-hidden="true"
            >
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
              type="search"
              className="input pl-8"
              placeholder="Search by name, role or email"
              aria-label="Search the team"
            />
            {searching && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 rounded p-1 text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
                aria-label="Clear the search"
                title="Clear"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        )}

        {roster.length === 0 && (
          <p className="t-body text-[var(--ink-muted)]">
            {scope === null
              ? "No one on the team yet."
              : "No one on your projects yet."}
          </p>
        )}

        {roster.length > 0 && found.length === 0 && (
          <p className="t-body text-[var(--ink-muted)]">
            Nobody matches “{query.trim()}”.
          </p>
        )}

        <section className="flex flex-col gap-1.5">
          {active.map((d) => (
            <PersonRow
              key={d.id}
              person={d}
              projectCount={projectCounts.get(d.id) ?? 0}
              selected={d.id === selectedId}
              onClick={() => openPerson(d.id)}
            />
          ))}
        </section>

        {archived.length > 0 && (
          <FoldedPeople
            label="Archived"
            people={archived}
            // A search that found somebody archived has to show them, or the
            // list would answer "nothing" while holding a match.
            open={showArchived || searching}
            onToggle={() => setShowArchived((v) => !v)}
            projectCounts={projectCounts}
            selectedId={selectedId}
            onOpenPerson={openPerson}
          />
        )}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {editing && mayWrite ? (
          <ProfileForm
            key={selected?.id ?? "new"}
            person={selected ?? undefined}
            existingCount={developers.length}
            projects={teamProjects}
            memberships={memberships}
            onCancel={() => {
              setCreating(false);
              setEditingId(null);
              if (creating) setSelectedId(null);
            }}
            onSave={async (values, places) => {
              if (selected) {
                await updateDeveloper(selected.id, values);
                await applyPlaces(selected.id, places);
                setEditingId(null);
              } else {
                const created = await createDeveloper(values);
                if (created) {
                  await applyPlaces(created.id, places);
                  setCreating(false);
                  setSelectedId(created.id);
                }
              }
            }}
            limited={!canEdit}
            onDelete={
              selected && canEdit ? () => removePerson(selected) : undefined
            }
          />
        ) : selected ? (
          <ProfileCard
            key={selected.id}
            person={selected}
            projects={teamProjects}
            memberships={memberships}
            onEdit={() => setEditingId(selected.id)}
            onBack={() => setSelectedId(null)}
            onDelete={() => removePerson(selected)}
            onToggleArchive={() =>
              setDeveloperActive(selected.id, !selected.active)
            }
            canEdit={canEdit}
            canEditProfile={mayWrite}
          />
        ) : (
          <p className="t-body text-[var(--ink-muted)]">
            {canEdit
              ? "Select someone to see their profile, or add a new person."
              : "Select someone to see their profile."}
          </p>
        )}
      </div>
    </div>
  );
}

/** A list of people kept out of the way behind its own heading. */
function FoldedPeople({
  label,
  people,
  open,
  onToggle,
  projectCounts,
  selectedId,
  onOpenPerson,
}: {
  label: string;
  people: Developer[];
  open: boolean;
  onToggle: () => void;
  projectCounts: Map<string, number>;
  selectedId: string | null;
  onOpenPerson: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-1.5 border-t border-[var(--hairline)] pt-3">
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-left"
        aria-expanded={open}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`shrink-0 text-[var(--ink-muted)] transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          <path
            d="M3.5 1.5L7 5l-3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="field-label">{label}</span>
        <span className="t-micro">{people.length}</span>
      </button>
      {open &&
        people.map((d) => (
          <PersonRow
            key={d.id}
            person={d}
            projectCount={projectCounts.get(d.id) ?? 0}
            selected={d.id === selectedId}
            onClick={() => onOpenPerson(d.id)}
          />
        ))}
    </section>
  );
}

function PersonRow({
  person,
  projectCount,
  selected,
  onClick,
}: {
  person: Developer;
  projectCount: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-[var(--radius)] border p-2.5 text-left transition ${
        selected
          ? "border-[var(--accent)] bg-[var(--accent-wash)]"
          : "border-[var(--hairline)] hover:bg-[var(--plane)]"
      } ${person.active ? "" : "opacity-60"}`}
    >
      <Avatar person={person} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="t-body truncate font-medium">{person.name}</span>
          {!person.active && <span className="chip shrink-0">Archived</span>}
        </span>
        {/* What they do and how many projects they are on, on one line: two
            stacked whispers under every name was most of the noise here. */}
        <span className="t-small block truncate text-[var(--ink-muted)]">
          {[
            person.role || person.email,
            projectCount > 0
              ? `${projectCount} project${projectCount === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "—"}
        </span>
      </span>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <circle cx="6.2" cy="6.2" r="4.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9.4 9.4L12 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

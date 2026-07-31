"use client";

import { useMemo, useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { InviteRow } from "@/components/InviteRow";
import {
  Avatar,
  CloseIcon,
  Disclosure,
  LazySelect,
  RoleChips,
} from "@/components/ui";
import { Developer, Membership, Project } from "@/lib/types";

/**
 * The people on this project. Anyone already in the workspace can be put on it
 * and given one of its roles; being handed a task puts them here too, which is
 * why someone can appear without a role.
 */
export function PeopleSection({
  project,
  people,
  developers,
  memberships,
  tasks,
  loading,
  canEdit,
  onAdd,
  onRemove,
  onRolesChange,
  onRotateInvite,
  onRevokeInvite,
  onOpenTeam,
}: {
  project: Project;
  people: Developer[];
  developers: Developer[];
  memberships: Membership[];
  tasks: { assigneeIds: string[]; status: string }[];
  loading: boolean;
  canEdit: boolean;
  onAdd: (projectId: string, developerId: string) => Promise<void>;
  onRemove: (projectId: string, developerId: string) => Promise<void>;
  onRolesChange: (
    projectId: string,
    developerId: string,
    roleIds: string[]
  ) => Promise<void>;
  onRotateInvite: (projectId: string, developerId: string) => Promise<void>;
  onRevokeInvite: (projectId: string, developerId: string) => Promise<void>;
  onOpenTeam?: () => void;
}) {
  const { confirm } = useFeedback();
  const [adding, setAdding] = useState("");

  // One pass each rather than a scan per row: with a busy project this ran the
  // whole membership list and the whole task list once for every person on it.
  const membershipOf = useMemo(() => {
    const byDeveloper = new Map<string, Membership>();
    for (const m of memberships) {
      if (m.projectId === project.id) byDeveloper.set(m.developerId, m);
    }
    return byDeveloper;
  }, [memberships, project.id]);

  const openCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.status === "DONE") continue;
      // A shared task counts once for everybody on it: what the number means
      // is "how much is on their plate", and it is on all of theirs.
      for (const id of task.assigneeIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  // Who can be added is a question about the membership list, not about who is
  // drawn below it: somebody carrying a task is listed here without being on
  // the project, and asking the roster instead left them in neither list — off
  // the project, and unofferable because they were already on screen.
  const available = developers.filter(
    (d) => d.active && !membershipOf.has(d.id)
  );

  async function remove(person: Developer) {
    const open = openCounts.get(person.id) ?? 0;
    const ok = await confirm({
      title: `Take ${person.name} off ${project.name}?`,
      body: open
        ? `Their ${open} open task${open === 1 ? "" : "s"} stay with them, so they keep a row here for the work they carry — reassign it first if they shouldn't.`
        : "They keep their profile and their work elsewhere.",
      confirmLabel: "Take off project",
      destructive: true,
    });
    if (ok) await onRemove(project.id, person.id);
  }

  return (
    <section className="flex flex-col gap-2.5">
      {/* A busy project can hold dozens of people, and each row carries roles
          and an invite link — folded away, the rest of the card stays reachable
          without scrolling past all of them. */}
      <Disclosure
        label="People"
        count={loading ? undefined : people.length}
        hint="Who works on this project, and in which of its roles."
        // Folded to begin with: a busy project's roster is longer than the rest
        // of the card put together, and it is not what the card is for.
        defaultOpen={false}
        summary={
          people.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {people.slice(0, 12).map((person) => (
                <span key={person.id} title={person.name}>
                  <Avatar person={person} size={22} />
                </span>
              ))}
              {people.length > 12 && (
                <span className="text-[0.75rem] text-[var(--ink-muted)]">
                  +{people.length - 12}
                </span>
              )}
            </div>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-2.5">
      {loading ? (
        <p className="text-[0.8125rem] text-[var(--ink-muted)]">Loading…</p>
      ) : people.length === 0 ? (
        <p className="text-[0.8125rem] text-[var(--ink-muted)]">
          Nobody on this project yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {people.map((person) => {
            const open = openCounts.get(person.id) ?? 0;
            const membership = membershipOf.get(person.id);
            const held = membership?.roleIds ?? [];
            return (
              <li
                key={person.id}
                className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--hairline)] px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Avatar person={person} size={24} />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem]">
                    {person.name}
                    {person.role && (
                      <span className="ml-2 text-[0.6875rem] text-[var(--ink-muted)]">
                        {person.role}
                      </span>
                    )}
                  </span>
                  <span className="text-[0.6875rem] tabular-nums text-[var(--ink-muted)]">
                    {open} open
                  </span>

                  <RoleChips
                    roles={project.roles}
                    held={held}
                    editable={canEdit}
                    label={`${person.name} on ${project.name}`}
                    onToggle={(roleId, on) =>
                      onRolesChange(
                        project.id,
                        person.id,
                        on ? [...held, roleId] : held.filter((r) => r !== roleId)
                      )
                    }
                  />

                  {canEdit && membership && (
                    <button
                      onClick={() => remove(person)}
                      className="rounded p-1 text-[var(--ink-muted)] transition hover:text-[var(--danger)]"
                      aria-label={`Take ${person.name} off this project`}
                      title="Take off project"
                    >
                      <CloseIcon />
                    </button>
                  )}
                </div>

                {/* Inviting somebody is this card's business, and it waits for
                    a role: the link is only worth sending once it opens
                    something. Carrying a task isn't being put on the project,
                    so those rows say why they are here instead — silence read
                    as the invite having gone missing. */}
                {canEdit &&
                  (!membership ? (
                    <p className="border-t border-[var(--hairline)] pt-2 text-[0.75rem] text-[var(--ink-muted)]">
                      Not on the project — listed for the work they carry on it.
                      Give them a role to put them on it and invite them.
                    </p>
                  ) : held.length > 0 || membership.hasLogin ? (
                    <InviteRow
                      person={person}
                      invite={membership.invite}
                      hasLogin={membership.hasLogin}
                      onRotate={() => onRotateInvite(project.id, person.id)}
                      onRevoke={() => onRevokeInvite(project.id, person.id)}
                    />
                  ) : (
                    <p className="border-t border-[var(--hairline)] pt-2 text-[0.75rem] text-[var(--ink-muted)]">
                      Give them a role to invite them to this project.
                    </p>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <LazySelect
            value={adding}
            onChange={async (developerId) => {
              if (!developerId) return;
              setAdding("");
              await onAdd(project.id, developerId);
            }}
            options={[
              {
                value: "",
                label: available.length
                  ? "Add someone from the team…"
                  : "Everyone is already on this project",
              },
              ...available.map((d) => ({ value: d.id, label: d.name })),
            ]}
            className="select w-60"
            ariaLabel="Add someone to this project"
          />
          {onOpenTeam && (
            <button onClick={onOpenTeam} className="btn-secondary">
              Open Team
            </button>
          )}
        </div>
      )}

      {!canEdit && onOpenTeam && (
        <button onClick={onOpenTeam} className="btn-secondary self-start">
          Open Team
        </button>
      )}
        </div>
      </Disclosure>
    </section>
  );
}

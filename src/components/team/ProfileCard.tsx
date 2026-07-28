"use client";

import { useEffect, useMemo, useState } from "react";
import { ProfileResume, ResumeProject } from "@/components/ProfileResume";
import { ShareProfile } from "@/components/ShareProfile";
import { Developer, DeveloperTask, Membership, Project } from "@/lib/types";

export function ProfileCard({
  person,
  projects,
  memberships,
  onEdit,
  onBack,
  onDelete,
  onToggleArchive,
  canEdit,
  canEditProfile,
}: {
  person: Developer;
  projects: Project[];
  memberships: Membership[];
  onEdit: () => void;
  onBack: () => void;
  onDelete: () => void;
  onToggleArchive: () => void;
  /** The owner's reach: the private half, archiving, deleting. */
  canEdit: boolean;
  /** Whether the Edit button is there at all — a role can keep the card tidy. */
  canEditProfile: boolean;
}) {
  const [tasks, setTasks] = useState<DeveloperTask[] | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * Where this person works: the projects they were put on, plus any they
   * carry tasks for. Holding no role is still being on a project, so
   * membership decides the first list, not whether a role happens to be set.
   */
  const onProjects = useMemo<ResumeProject[]>(() => {
    const rows: ResumeProject[] = [];
    const seen = new Set<string>();

    for (const project of projects) {
      const membership = memberships.find(
        (m) => m.projectId === project.id && m.developerId === person.id
      );
      if (!membership) continue;
      seen.add(project.id);
      rows.push({
        id: project.id,
        name: project.name,
        roles: project.roles.filter((r) => membership.roleIds.includes(r.id)),
        viaTasks: false,
        hasLogin: membership.hasLogin,
      });
    }

    for (const task of tasks ?? []) {
      if (seen.has(task.project.id)) continue;
      seen.add(task.project.id);
      rows.push({
        id: task.project.id,
        name: task.project.name,
        roles: [],
        viaTasks: true,
        hasLogin: false,
      });
    }

    return rows;
  }, [projects, memberships, person.id, tasks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/developers/${person.id}/tasks`);
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (!cancelled) setTasks(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [person.id]);

  return (
    <ProfileResume
      person={person}
      projects={onProjects}
      tasks={tasks}
      tasksFailed={failed}
      // A member is served the working half of a profile and nothing else, so
      // there is no private half here to show.
      showPrivate={canEdit}
      actions={
        <>
          <ShareProfile developerId={person.id} />
          <button onClick={onBack} className="btn-secondary lg:hidden">
            Back
          </button>
          {canEditProfile && (
            <button onClick={onEdit} className="btn-primary">
              Edit profile
            </button>
          )}
        </>
      }
      footer={
        canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button onClick={onToggleArchive} className="btn-secondary">
              {person.active ? "Archive" : "Restore to team"}
            </button>
            <button onClick={onDelete} className="btn-secondary !text-[#d03b3b]">
              Delete permanently
            </button>
          </div>
        ) : undefined
      }
    />
  );
}




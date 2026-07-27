"use client";

import { useState } from "react";
import { useFeedback } from "@/components/Feedback";
import { CloseIcon } from "@/components/ui";
import { Project, ProjectRole, ROLE_VIEWS } from "@/lib/types";

/**
 * Who sees what. The checkboxes are the whole point of a role, so they sit in
 * a grid: one row per role, one column per tool.
 */
export function RolesSection({
  project,
  onAdd,
  onToggle,
  onRename,
  onRemove,
}: {
  project: Project;
  onAdd: (name: string) => Promise<ProjectRole | null>;
  onToggle: (roleId: string, patch: Record<string, boolean>) => Promise<void>;
  onRename: (roleId: string, name: string) => Promise<void>;
  onRemove: (roleId: string) => Promise<void>;
}) {
  const { confirm } = useFeedback();
  const [adding, setAdding] = useState("");
  const [pending, setPending] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = adding.trim();
    if (!name) return;
    setPending(true);
    const created = await onAdd(name);
    setPending(false);
    if (created) setAdding("");
  }

  async function remove(role: ProjectRole) {
    const ok = await confirm({
      title: `Remove the “${role.name}” role?`,
      body: "People on this project stop being described by it. Nothing else is deleted.",
      confirmLabel: "Remove role",
      destructive: true,
    });
    if (ok) await onRemove(role.id);
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h3 className="text-[0.8125rem] font-semibold tracking-tight">Roles</h3>
        <p className="text-[0.75rem] text-[var(--ink-muted)]">
          Admins choose which of this project’s tools each role can open.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-[0.8125rem]">
          <thead>
            <tr>
              <th className="w-full pb-1.5 text-left">
                <span className="field-label">Role</span>
              </th>
              {ROLE_VIEWS.map((view) => (
                <th key={view.key} className="px-3 pb-1.5">
                  <span className="field-label">{view.label}</span>
                </th>
              ))}
              <th className="pb-1.5" />
            </tr>
          </thead>
          <tbody>
            {project.roles.map((role) => (
              <tr
                key={role.id}
                className="border-t border-[var(--hairline)] align-middle"
              >
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <RoleName
                      role={role}
                      onRename={(name) => onRename(role.id, name)}
                    />
                    {role.isAdmin && (
                      <span className="rounded-full bg-[var(--accent-wash)] px-2 py-0.5 text-[0.5625rem] uppercase tracking-wide text-[var(--accent)]">
                        Admin
                      </span>
                    )}
                  </span>
                </td>
                {ROLE_VIEWS.map((view) => {
                  // The roster has no project toggle to depend on.
                  const enabled = view.tool == null || project[view.tool];
                  return (
                    <td key={view.key} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={role.isAdmin ? true : role[view.key]}
                        disabled={role.isAdmin || !enabled}
                        onChange={(e) =>
                          onToggle(role.id, { [view.key]: e.target.checked })
                        }
                        className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`${role.name} can see ${view.label}`}
                        title={
                          role.isAdmin
                            ? "Admins always see everything"
                            : enabled
                              ? undefined
                              : `${view.label} is turned off for this project`
                        }
                      />
                    </td>
                  );
                })}
                <td className="py-2 pl-2 text-right">
                  {!role.isAdmin && (
                    <button
                      onClick={() => remove(role)}
                      className="rounded p-1 text-[var(--ink-muted)] transition hover:text-[#d03b3b]"
                      aria-label={`Remove the ${role.name} role`}
                      title="Remove role"
                    >
                      <CloseIcon />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="flex items-center gap-2" onSubmit={add}>
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          className="input w-48"
          placeholder="e.g. designer"
          aria-label="New role name"
        />
        <button
          type="submit"
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          disabled={pending || !adding.trim()}
        >
          {pending ? "Adding…" : "Add role"}
        </button>
      </form>
      <p className="text-[0.6875rem] text-[var(--ink-muted)]">
        A new role starts with nothing visible — tick what it should see. A name
        can be changed at any time: it says what the role is called, not what it
        opens.
      </p>
    </section>
  );
}

/**
 * A role's name, editable in place. Renaming is safe in a way that the
 * checkboxes beside it are not — nobody gains or loses a view by it — so it
 * saves on the way out of the field rather than behind a button, and puts the
 * old name back if the save is refused or the field is left empty.
 */
function RoleName({
  role,
  onRename,
}: {
  role: ProjectRole;
  onRename: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(role.name);

  // A rename by somebody else, or one the server refused, wins over what is in
  // the field — as long as the field isn't being typed in.
  const [focused, setFocused] = useState(false);
  if (!focused && draft !== role.name) setDraft(role.name);

  async function commit() {
    setFocused(false);
    const name = draft.trim();
    if (!name || name === role.name) {
      setDraft(role.name);
      return;
    }
    await onRename(name);
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(role.name);
          setFocused(false);
          e.currentTarget.blur();
        }
      }}
      className="w-full min-w-24 rounded-[var(--radius)] border border-transparent bg-transparent px-1.5 py-1 font-medium transition hover:border-[var(--hairline)] focus:border-[var(--accent)] focus:bg-[var(--surface-raised)] focus:outline-none"
      aria-label={`Name of the ${role.name} role`}
      title="Rename this role"
    />
  );
}

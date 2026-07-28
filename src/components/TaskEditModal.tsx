"use client";

import { useMemo, useState } from "react";
import { TaskModal } from "@/components/TaskModal";
import { TaskView } from "@/components/TaskView";
import { useBoard } from "@/components/BoardProvider";
import { Task } from "@/lib/types";

/**
 * One open task, read or edited. Both boards open the same thing from the same
 * state, so the wiring — what a step is created with, what changing one writes —
 * lives here rather than twice.
 *
 * Which of the two it opens as is the caller's to say: clicking a task is
 * asking to read it, and clicking the pencil is asking to change it. A role
 * without the right to change the work never gets the second, and the card
 * doesn't offer it — but the comments on the card are open to both.
 */
export function TaskEditModal({
  task,
  canEdit,
  editing: startEditing = false,
  onClose,
}: {
  task: Task;
  /** Whether this viewer's role lets them change the work at all. */
  canEdit: boolean;
  /** Open straight into the form, rather than the card. */
  editing?: boolean;
  onClose: () => void;
}) {
  const {
    projectTasks,
    assignable,
    createTask,
    updateTask,
    deleteTask,
  } = useBoard();

  // Whatever it was opened as, the card can hand over to the form. It can't
  // hand back: leaving the form is what Cancel and Save are for, and dropping
  // half-typed changes to return to a card would lose them without saying so.
  const [editing, setEditing] = useState(startEditing && canEdit);

  // Every step of this task, wherever its board is: a step planned into another
  // sprint is still a step of this task.
  const subtasks = useMemo(
    () => projectTasks.filter((t) => t.parentId === task.id),
    [projectTasks, task.id]
  );

  if (!editing) {
    return (
      <TaskView
        task={task}
        subtasks={subtasks}
        projectTasks={projectTasks}
        canEdit={canEdit}
        onEdit={() => setEditing(true)}
        onClose={onClose}
      />
    );
  }

  return (
    <TaskModal
      task={task}
      subtasks={subtasks}
      // The whole project, so the form can walk the links for itself: what may
      // be waited on is a question about the shape of the plan, not about this
      // one row.
      projectTasks={projectTasks}
      developers={assignable}
      onClose={onClose}
      onSubmit={async (values) => {
        await updateTask(task.id, values);
        onClose();
      }}
      onDelete={async () => {
        await deleteTask(task.id);
        onClose();
      }}
      // A step starts where its task does, and with whoever was picked beside
      // it — which is nobody when the picker says nobody.
      onAddSubtask={(step) =>
        createTask({
          title: step.title,
          description: "",
          link: "",
          startDate: task.startDate,
          endDate: task.endDate,
          developerId: step.developerId,
          parentId: task.id,
        })
      }
      onUpdateSubtask={(id, patch) => updateTask(id, patch)}
      onDeleteSubtask={(id) => deleteTask(id)}
    />
  );
}

"use client";

import { useMemo } from "react";
import { TaskModal } from "@/components/TaskModal";
import { useBoard } from "@/components/BoardProvider";
import { Task } from "@/lib/types";

/**
 * Editing one task, with its steps. Both boards open the same thing from the
 * same state, so the wiring — what a step is created with, what changing one
 * writes — lives here rather than twice.
 */
export function TaskEditModal({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const {
    projectTasks,
    assignable,
    createTask,
    updateTask,
    deleteTask,
  } = useBoard();

  // Every step of this task, wherever its board is: a step planned into another
  // sprint is still a step of this task.
  const subtasks = useMemo(
    () => projectTasks.filter((t) => t.parentId === task.id),
    [projectTasks, task.id]
  );

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

"use client";

import { useMemo } from "react";
import { TaskModal } from "@/components/TaskModal";
import { useBoard } from "@/components/BoardProvider";
import { Task, TaskStatus } from "@/lib/types";

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
    developers,
    createTask,
    updateTask,
    deleteTask,
    clearPause,
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
      developers={developers}
      onClose={onClose}
      onSubmit={async (values) => {
        await updateTask(task.id, values);
        onClose();
      }}
      onDelete={async () => {
        await deleteTask(task.id);
        onClose();
      }}
      // A step starts where its task does, and with the same person on it.
      onAddSubtask={(title) =>
        createTask({
          title,
          description: "",
          link: "",
          startDate: task.startDate,
          endDate: task.endDate,
          developerId: task.developerId,
          parentId: task.id,
        })
      }
      onUpdateSubtask={(id, patch: { status?: TaskStatus; title?: string }) =>
        updateTask(id, patch)
      }
      onDeleteSubtask={(id) => deleteTask(id)}
      onClearPause={(breakId) => clearPause(task.id, breakId)}
    />
  );
}

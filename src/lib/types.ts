export type TaskStatus = "TODO" | "IN_PROGRESS" | "IN_TEST" | "ON_HOLD" | "DONE";

export const STATUS_OPTIONS: {
  value: TaskStatus;
  label: string;
  color: string;
  text: string;
}[] = [
  { value: "TODO", label: "To Do", color: "#d4d4d8", text: "#27272a" },
  { value: "IN_PROGRESS", label: "In progress", color: "#f59e0b", text: "#451a03" },
  { value: "IN_TEST", label: "In test", color: "#3b82f6", text: "#eff6ff" },
  { value: "ON_HOLD", label: "On hold", color: "#ef4444", text: "#fef2f2" },
  { value: "DONE", label: "Done", color: "#22c55e", text: "#052e16" },
];

export function statusMeta(status: TaskStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
}

export interface Developer {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  startDate: string;
  endDate: string;
  order: number;
  developerId: string | null;
  developer: Developer | null;
}

export interface Sprint {
  id: string;
  startDate: string;
  endDate: string;
  updatedAt: string;
}

import { describe, expect, it } from "vitest";
import { projectView } from "../src/views/projectView.js";

const project = { id: "project-a", name: "Proyecto", description: "", color: "#7c5cff", icon: "folder" };
const tasks = [
  { id: "pending", projectId: project.id, title: "Tarea pendiente", description: "", status: "pending", dueDate: null, accumulatedSeconds: 0 },
  { id: "progress", projectId: project.id, title: "Tarea en curso", description: "", status: "in_progress", dueDate: null, accumulatedSeconds: 20 },
  { id: "done-a", projectId: project.id, title: "Primera completada", description: "", status: "completed", dueDate: null, accumulatedSeconds: 30 },
  { id: "done-b", projectId: project.id, title: "Segunda completada", description: "", status: "completed", dueDate: null, accumulatedSeconds: 40 },
];
const state = { projects: [project], tasks, focusSessions: [], learningEntries: [] };

function ui(overrides = {}) {
  const now = new Date();
  return {
    animatePage: false,
    calendar: { year: now.getFullYear(), month: now.getMonth() },
    selectedDate: null,
    menu: null,
    projectTaskTab: "open",
    completedTaskFilterByProject: {},
    ...overrides,
  };
}

describe("project task tabs", () => {
  it("shows pending and in-progress tasks in the first tab without the status filter", () => {
    const html = projectView(state, project, ui());
    expect(html).toContain("Tarea pendiente");
    expect(html).toContain("Tarea en curso");
    expect(html).not.toContain("Primera completada");
    expect(html).not.toContain('data-action="toggle-filter"');
  });

  it("shows only completed tasks and can retain one selected task", () => {
    const html = projectView(state, project, ui({
      projectTaskTab: "completed",
      completedTaskFilterByProject: { [project.id]: "done-b" },
    }));
    expect(html).toContain("Segunda completada");
    expect(html).not.toContain("Primera completada");
    expect(html).not.toContain("Tarea pendiente");
    expect(html).toContain('data-action="toggle-completed-filter"');
  });
});

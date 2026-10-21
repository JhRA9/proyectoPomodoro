import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { createEmptyState, normalizeState } from "../src/data/schema.js";
import { createStore } from "../src/state/store.js";
import { dueNotice, globalTasksPanel, taskFormDialog, taskRow } from "../src/ui/components.js";

async function setup() {
  const now = new Date("2026-10-21T12:00:00.000Z");
  const repository = new StudyHubRepository({ adapter: new MemoryAdapter(createEmptyState(now)), store: createStore(null), clock: () => now });
  await repository.initialize();
  const project = await repository.createProject({ name: "Universidad", description: "", icon: "graduation", color: "#f34fa5" });
  return { repository, project, now };
}

describe("task categories", () => {
  it("creates and updates an optional category", async () => {
    const test = await setup();
    const task = await test.repository.createTask(test.project.id, {
      title: "Preparar parcial",
      description: "",
      category: "  Matemáticas  ",
      dueDate: "2026-10-22",
      status: "pending",
    });
    expect(task.category).toBe("Matemáticas");

    await test.repository.updateTask(task.id, {
      title: task.title,
      description: "",
      category: "Física",
      dueDate: task.dueDate,
      dueTime: "",
      repeatDaily: false,
    });
    expect(test.repository.getState().tasks[0].category).toBe("Física");
  });

  it("shows the category in task, due and global agenda views", async () => {
    const test = await setup();
    const task = await test.repository.createTask(test.project.id, {
      title: "Tarea de documentación con un nombre muy largo",
      description: "",
      category: "Proyecto de grado",
      dueDate: "2026-10-22",
      status: "pending",
    });
    expect(taskRow(task)).toContain("Proyecto de grado");
    expect(dueNotice([task])).toContain("Proyecto de grado");
    expect(globalTasksPanel(test.repository.getState(), test.now)).toContain("Proyecto de grado");
  });

  it("keeps old data compatible and exposes the optional form field", () => {
    const state = createEmptyState(new Date("2026-10-21T12:00:00.000Z"));
    state.projects.push({ id: "project-a", name: "Proyecto", description: "", icon: "folder", color: "#7657ff", createdAt: state.updatedAt, status: "active", completedAt: null });
    state.tasks.push({ id: "task-a", projectId: "project-a", title: "Anterior", description: "", status: "pending", dueDate: null, accumulatedSeconds: 0, createdAt: state.updatedAt, completedAt: null });
    expect(normalizeState(state).tasks[0].category).toBe("");
    expect(taskFormDialog("project-a")).toContain('name="category"');
    expect(taskFormDialog("project-a")).toContain("Categoría");
    const suggested = taskFormDialog("project-a", { availableCategories: ["Matemáticas", "Física"] });
    expect(suggested).toContain("<datalist");
    expect(suggested).toContain('value="Matemáticas"');
  });
});

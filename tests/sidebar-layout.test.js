import { describe, expect, it, vi } from "vitest";
import { StudyHubApp } from "../src/ui/app.js";
import { globalTasksPanel } from "../src/ui/components.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function createApp(storage, state) {
  const repository = { adapter: null, getState: () => state };
  const router = { current: () => ({ name: "projects" }), navigate: vi.fn() };
  const app = new StudyHubApp({}, repository, {}, router, { layoutStorage: storage });
  app.render = vi.fn();
  return { app, router };
}

describe("collapsible application sidebars", () => {
  it("persists the open state and navigates from the global task panel", async () => {
    const storage = memoryStorage();
    const state = {
      tasks: [{ id: "task-a", projectId: "project-a", title: "Estudiar", status: "pending" }],
    };
    const { app, router } = createApp(storage, state);

    await app.runAction("toggle-left-sidebar", { dataset: {} });
    await app.runAction("toggle-right-sidebar", { dataset: {} });

    const { app: restored } = createApp(storage, state);
    expect(restored.ui.leftSidebarOpen).toBe(false);
    expect(restored.ui.rightSidebarOpen).toBe(false);

    await app.runAction("open-global-task", { dataset: { projectId: "project-a", taskId: "task-a" } });
    expect(router.navigate).toHaveBeenCalledWith("projects/project-a/tasks/task-a");
  });

  it("groups incomplete tasks by date and leaves completed tasks out", () => {
    const html = globalTasksPanel({
      projects: [{ id: "project-a", name: "Grado", color: "#2f8cff", icon: "folder" }],
      tasks: [
        { id: "later", projectId: "project-a", title: "Entrega posterior", status: "pending", dueDate: "2026-10-10", createdAt: "2026-09-01" },
        { id: "first", projectId: "project-a", title: "Entrega próxima", status: "in_progress", dueDate: "2026-09-24", createdAt: "2026-09-01" },
        { id: "anytime", projectId: "project-a", title: "Revisar bibliografía", status: "pending", dueDate: null, createdAt: "2026-09-01" },
        { id: "done", projectId: "project-a", title: "Ya terminada", status: "completed", dueDate: "2026-09-23", createdAt: "2026-09-01" },
      ],
    });

    expect(html.indexOf("Entrega próxima")).toBeLessThan(html.indexOf("Entrega posterior"));
    expect(html).toContain("Revisar bibliografía");
    expect(html).not.toContain("Ya terminada");
    expect(html).toContain("Próximas a vencer");
    expect(html).toContain("Sin fecha");
  });
});

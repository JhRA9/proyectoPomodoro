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
      tasks: [{ id: "task-a", projectId: "project-a", title: "Estudiar", status: "completed" }],
    };
    const { app, router } = createApp(storage, state);

    await app.runAction("toggle-left-sidebar", { dataset: {} });
    await app.runAction("toggle-right-sidebar", { dataset: {} });
    await app.runAction("set-project-task-tab", { dataset: { taskTab: "completed" } });
    await app.runAction("set-completed-filter", { dataset: { projectId: "project-a", taskId: "task-a" } });

    const { app: restored } = createApp(storage, state);
    expect(restored.ui.leftSidebarOpen).toBe(false);
    expect(restored.ui.rightSidebarOpen).toBe(false);
    expect(restored.ui.projectTaskTab).toBe("completed");
    expect(restored.ui.completedTaskFilterByProject["project-a"]).toBe("task-a");

    await app.runAction("open-global-task", { dataset: { projectId: "project-a", taskId: "task-a" } });
    expect(router.navigate).toHaveBeenCalledWith("projects/project-a/tasks/task-a");
  });

  it("moves incomplete tasks through the dynamic due-date groups", () => {
    const state = {
      projects: [{ id: "project-a", name: "Grado", color: "#2f8cff", icon: "folder" }],
      tasks: [
        { id: "overdue", projectId: "project-a", title: "Entrega vencida", status: "pending", dueDate: "2026-09-22", createdAt: "2026-09-01" },
        { id: "today", projectId: "project-a", title: "Entrega de hoy", status: "pending", dueDate: "2026-09-23", dueTime: "14:30", createdAt: "2026-09-01" },
        { id: "tomorrow", projectId: "project-a", title: "Entrega mañana", status: "in_progress", dueDate: "2026-09-24", dueTime: "18:45", createdAt: "2026-09-01" },
        { id: "three", projectId: "project-a", title: "Entrega en tres días", status: "pending", dueDate: "2026-09-26", createdAt: "2026-09-01" },
        { id: "week", projectId: "project-a", title: "Entrega próxima semana", status: "pending", dueDate: "2026-09-29", createdAt: "2026-09-01" },
        { id: "later", projectId: "project-a", title: "Entrega posterior", status: "pending", dueDate: "2026-10-10", createdAt: "2026-09-01" },
        { id: "anytime", projectId: "project-a", title: "Revisar bibliografía", status: "pending", dueDate: null, createdAt: "2026-09-01" },
        { id: "done", projectId: "project-a", title: "Ya terminada", status: "completed", dueDate: "2026-09-23", createdAt: "2026-09-01" },
      ],
    };
    const html = globalTasksPanel(state, new Date(2026, 8, 23, 12));

    expect(html).toContain("Vencidas");
    expect(html).toContain("Se entregan hoy");
    expect(html).toContain("Vence mañana");
    expect(html).toContain("Próximos 3 días");
    expect(html).toContain("Próxima semana");
    expect(html).toContain("Próximas a vencer");
    expect(html).toContain("Revisar bibliografía");
    expect(html).not.toContain("Ya terminada");
    expect(html).toContain("Sin fecha");
    expect(html).toContain("Vence hoy · 2:30 PM");
    expect(html).toContain("Vence mañana · 6:45 PM");

    const overdueSection = html.slice(html.indexOf('id="due-overdue-title"'), html.indexOf('id="due-today-title"'));
    const todaySection = html.slice(html.indexOf('id="due-today-title"'), html.indexOf('id="due-tomorrow-title"'));
    expect(overdueSection).toContain("Entrega vencida");
    expect(overdueSection).not.toContain("Entrega de hoy");
    expect(todaySection).toContain("Entrega de hoy");
    expect(todaySection).not.toContain("Entrega vencida");

    const nextDayHtml = globalTasksPanel(state, new Date(2026, 8, 24, 12));
    const nextTodaySection = nextDayHtml.slice(nextDayHtml.indexOf('id="due-today-title"'), nextDayHtml.indexOf('id="due-tomorrow-title"'));
    expect(nextTodaySection).toContain("Entrega mañana");
  });
});

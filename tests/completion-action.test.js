import { describe, expect, it, vi } from "vitest";
import { StudyHubApp } from "../src/ui/app.js";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function setup() {
  const state = {
    tasks: [{ id: "task-overdue", projectId: "project-a", status: "in_progress" }],
    activeTimer: null,
    pendingCompletion: null,
  };
  const repository = {
    adapter: null,
    getState: () => state,
    completeTaskWithReflection: vi.fn(async (taskId) => {
      state.tasks.find((task) => task.id === taskId).status = "completed";
      return { pausedTaskTitle: null };
    }),
  };
  const root = { querySelector: () => null };
  const router = { current: () => ({ name: "focus", projectId: "project-a", taskId: "task-overdue" }) };
  const app = new StudyHubApp(root, repository, {}, router, { draftStorage: storage(), layoutStorage: storage() });
  app.render = vi.fn();
  app.addToast = vi.fn();
  app.focusLearningTextarea = vi.fn();
  return { app, repository, state };
}

describe("green completion action", () => {
  it("saves the visible learning draft and completes the task in one action", async () => {
    const { app, repository, state } = setup();
    app.setLearningDraft("task-overdue", {
      learned: "Repasé el cuaderno del parcial.",
      unresolved: "",
      nextSession: "",
      learnedImages: [],
    });

    await app.runAction("complete-task", { dataset: { taskId: "task-overdue" } });

    expect(repository.completeTaskWithReflection).toHaveBeenCalledWith("task-overdue", expect.objectContaining({
      learned: "Repasé el cuaderno del parcial.",
    }));
    expect(state.tasks[0].status).toBe("completed");
    expect(app.getLearningDraft("task-overdue").learned).toBe("");
    expect(app.addToast).toHaveBeenCalledWith("Tarea completada y reflexión guardada.");
  });

  it("focuses the required note instead of leaving a hidden pending completion", async () => {
    const { app, repository, state } = setup();

    await app.runAction("complete-task", { dataset: { taskId: "task-overdue" } });

    expect(repository.completeTaskWithReflection).not.toHaveBeenCalled();
    expect(state.tasks[0].status).toBe("in_progress");
    expect(state.pendingCompletion).toBeNull();
    expect(app.ui.focusLearningTab).toBe("draft");
    expect(app.focusLearningTextarea).toHaveBeenCalledWith("task-overdue");
    expect(app.addToast).toHaveBeenCalledWith("Escribe qué aprendiste para poder completar la tarea.", "error");
  });
});

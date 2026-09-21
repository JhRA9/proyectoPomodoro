import { describe, expect, it, vi } from "vitest";
import { StudyHubApp } from "../src/ui/app.js";

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

function setup() {
  let state = { projects: [{ id: "project-a" }], tasks: [{ id: "task-a", projectId: "project-a" }], activeTimer: null };
  const adapter = { getStatus: () => ({ state: "offline", pending: true }) };
  const repository = {
    adapter,
    getState: () => state,
    deleteTask: vi.fn(async (id) => { state = { ...state, tasks: state.tasks.filter((task) => task.id !== id) }; }),
    importEnvelope: vi.fn(async (envelope) => { state = { ...state, tasks: envelope.data.tasks }; }),
  };
  const fileStore = { queueCleanup: vi.fn(), flushCleanup: vi.fn(async () => ({ removed: 0, pending: 0, failed: [] })) };
  const router = { current: () => ({ name: "focus", taskId: "task-a" }), navigate: vi.fn() };
  const app = new StudyHubApp({}, repository, {}, router, { adapter, fileStore, draftStorage: storage() });
  app.addToast = vi.fn();
  app.clearLearningDraft = vi.fn();
  app.clearAllLearningDrafts = vi.fn();
  return { app, repository, fileStore, router };
}

describe("limpieza de adjuntos", () => {
  it("permite eliminar tareas sin conexión y encola archivos solo tras cambiar el estado", async () => {
    const { app, repository, fileStore } = setup();
    app.ui.confirm = { type: "delete-task", id: "task-a" };
    await app.confirmAction();
    expect(repository.deleteTask).toHaveBeenCalledWith("task-a");
    expect(fileStore.queueCleanup).toHaveBeenCalledWith(["task-a"]);
    expect(fileStore.flushCleanup).not.toHaveBeenCalled();
  });

  it("no borra archivos si falla la eliminación del estado", async () => {
    const { app, repository, fileStore } = setup();
    repository.deleteTask.mockRejectedValueOnce(new Error("No se pudo guardar"));
    app.ui.confirm = { type: "delete-task", id: "task-a" };
    await app.confirmAction();
    expect(fileStore.queueCleanup).not.toHaveBeenCalled();
    expect(app.addToast).toHaveBeenCalledWith("No se pudo guardar", "error");
  });

  it("al importar solo encola los adjuntos de tareas que desaparecen", async () => {
    const { app, fileStore } = setup();
    app.ui.pendingImport = { data: { tasks: [{ id: "task-b", projectId: "project-a" }] } };
    app.ui.confirm = { type: "import" };
    await app.confirmAction();
    expect(fileStore.queueCleanup).toHaveBeenCalledWith(["task-a"]);
  });
});

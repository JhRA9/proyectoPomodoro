import { afterEach, describe, expect, it, vi } from "vitest";
import { StudyHubApp } from "../src/ui/app.js";
import { taskFormDialog } from "../src/ui/components.js";

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

function setup({ upload = vi.fn(async () => ({ kind: "created" })) } = {}) {
  const repository = {
    adapter: null,
    getState: () => ({}),
    createTask: vi.fn(async () => ({ id: "task-new" })),
  };
  const fileStore = { upload };
  const router = { current: () => ({ name: "project", projectId: "project-a" }) };
  const app = new StudyHubApp({}, repository, {}, router, { fileStore, draftStorage: storage() });
  app.render = vi.fn();
  app.addToast = vi.fn();
  app.ui.dialog = { type: "task", projectId: "project-a" };
  return { app, repository, fileStore };
}

function form() {
  return { dataset: { form: "task", projectId: "project-a", taskId: "" } };
}

afterEach(() => vi.unstubAllGlobals());

describe("adjuntos al crear tarea", () => {
  it("muestra un selector múltiple opcional solo para tareas nuevas con cuenta cloud", () => {
    const cloud = taskFormDialog("project-a", null, { filesEnabled: true, selectedFiles: [{ name: "Guía <final>.docx" }] });
    expect(cloud).toContain('data-input="new-task-files"');
    expect(cloud).toContain('name="dueTime"');
    expect(cloud).toContain('type="time"');
    expect(cloud).toContain("multiple");
    expect(cloud).toContain("Guía &lt;final&gt;.docx");
    expect(cloud).not.toMatch(/data-input="new-task-files"[^>]*required/);
    expect(taskFormDialog("project-a", null, { filesEnabled: false })).not.toContain('data-input="new-task-files"');
    expect(taskFormDialog("project-a", { id: "task-a" }, { filesEnabled: true })).not.toContain('data-input="new-task-files"');
  });

  it("crea una sola tarea y después sube los archivos elegidos", async () => {
    const { app, repository, fileStore } = setup();
    const files = [new File(["uno"], "uno.docx"), new File(["dos"], "dos.pdf")];
    const selected = { innerHTML: "" };
    await app.handleChange({ target: { dataset: { input: "new-task-files" }, files, closest: () => ({ querySelector: () => selected }) } });
    expect(app.ui.dialog.files).toEqual(files);
    expect(selected.innerHTML).toContain("uno.docx");
    vi.stubGlobal("FormData", class { entries() { return [["title", "Nueva tarea"], ["status", "pending"]][Symbol.iterator](); } });

    await app.handleSubmit({ preventDefault() {}, target: form() });

    expect(repository.createTask).toHaveBeenCalledTimes(1);
    expect(fileStore.upload).toHaveBeenCalledTimes(2);
    expect(fileStore.upload).toHaveBeenNthCalledWith(1, "task-new", files[0]);
    expect(fileStore.upload).toHaveBeenNthCalledWith(2, "task-new", files[1]);
    expect(app.ui.dialog).toBeNull();
    expect(app.addToast).toHaveBeenCalledWith("2 archivos adjuntados a la tarea.");
  });

  it("si falla la carga conserva la tarea creada y ofrece reintentar desde ella", async () => {
    const upload = vi.fn(async () => { throw new Error("sin conexión"); });
    const { app, repository } = setup({ upload });
    app.ui.dialog.files = [new File(["uno"], "uno.docx")];
    vi.stubGlobal("FormData", class { entries() { return [["title", "Nueva tarea"]][Symbol.iterator](); } });

    await app.handleSubmit({ preventDefault() {}, target: form() });

    expect(repository.createTask).toHaveBeenCalledTimes(1);
    expect(app.ui.dialog).toBeNull();
    expect(app.addToast).toHaveBeenCalledWith(expect.stringContaining("Ábrela para reintentar"), "error");
  });
});

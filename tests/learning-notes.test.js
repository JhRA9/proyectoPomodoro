import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { createEmptyState, normalizeState } from "../src/data/schema.js";
import { createStore } from "../src/state/store.js";
import { learningDraftForm, learningTable, reflectionDialog } from "../src/ui/components.js";
import { LearningDraftStore, learningDraftStorageKey } from "../src/ui/learningDrafts.js";
import { focusView } from "../src/views/focusView.js";
import { MemoryStorage } from "./helpers/cloudHarness.js";

const IMAGE = {
  id: "note-image-test",
  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
  alt: "Jerarquía de operaciones",
  width: 640,
  height: 360,
};

async function setup() {
  let nowMs = new Date("2026-09-17T12:00:00.000Z").getTime();
  const clock = () => new Date(nowMs);
  const adapter = new MemoryAdapter(createEmptyState(clock()));
  const repository = new StudyHubRepository({ adapter, store: createStore(null), clock });
  await repository.initialize();
  const project = await repository.createProject({ name: "Matemáticas", description: "", icon: "calculator", color: "#31d98b" });
  const task = await repository.createTask(project.id, { title: "Jerarquía", description: "", dueDate: null, status: "pending" });
  return { repository, project, task, advance(seconds) { nowMs += seconds * 1000; } };
}

describe("learning notes and optional reflection fields", () => {
  it("requires only what was learned and preserves multiline text, images, and blank optional answers", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    test.advance(90);
    await test.repository.stopTimer();
    await test.repository.saveReflection({
      learned: "Primero, paréntesis.\nDespués, potencias.",
      unresolved: "",
      nextSession: "",
      learnedImages: [IMAGE],
    });

    const [entry] = test.repository.getState().learningEntries;
    expect(entry.learned).toBe("Primero, paréntesis.\nDespués, potencias.");
    expect(entry.unresolved).toBe("");
    expect(entry.nextSession).toBe("");
    expect(entry.learnedImages).toEqual([IMAGE]);

    const table = learningTable([entry], test.repository.getState(), "task");
    expect(table).toContain(IMAGE.dataUrl);
    expect(table.indexOf(IMAGE.dataUrl)).toBeLessThan(table.indexOf("Primero, paréntesis"));
    expect(table).toContain("learned-entry-content");
  });

  it("rejects an empty learned answer without consuming the pending reflection", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    test.advance(30);
    await test.repository.stopTimer();

    await expect(test.repository.saveReflection({ learned: "   ", unresolved: "Duda", nextSession: "Seguir" })).rejects.toThrow(/qué aprendiste/i);
    expect(test.repository.getState().pendingCompletion).not.toBeNull();
    expect(test.repository.getState().learningEntries).toHaveLength(0);
  });

  it("marks only the learned textarea as required in the closing dialog", () => {
    const html = reflectionDialog({ id: "task-one", title: "Tarea" }, {}, { kind: "completion" });
    const learned = html.match(/<textarea[^>]*name="learned"[^>]*>/)?.[0] ?? "";
    const unresolved = html.match(/<textarea[^>]*name="unresolved"[^>]*>/)?.[0] ?? "";
    const nextSession = html.match(/<textarea[^>]*name="nextSession"[^>]*>/)?.[0] ?? "";
    expect(learned).toMatch(/\brequired\b/);
    expect(unresolved).not.toMatch(/\brequired\b/);
    expect(nextSession).not.toMatch(/\brequired\b/);
    expect(html).toContain("opcional");
  });

  it("identifies a different paused session in the completion dialog", () => {
    const html = reflectionDialog({ id: "task-one", title: "Otra tarea" }, {}, {
      kind: "completion",
      activeTaskTitle: "Tesis <final>",
    });
    expect(html).toContain("Tesis &lt;final&gt;");
    expect(html).toContain("quedó pausada");
    expect(html).not.toContain("Tesis <final>");
  });

  it("renders an editable notes tab first and the history as the second tab", async () => {
    const test = await setup();
    const state = test.repository.getState();
    const draft = { learned: "Apunte en progreso", unresolved: "", nextSession: "", learnedImages: [IMAGE] };
    const draftHtml = focusView(state, test.project, test.task, {
      animatePage: false,
      taskFilter: "all",
      menu: null,
      focusLearningTab: "draft",
      learningDrafts: { [test.task.id]: draft },
    });
    expect(draftHtml).toContain("Notas de la sesión");
    expect(draftHtml).toContain("Historial");
    expect(draftHtml).toContain('data-form="learning-draft"');
    expect(draftHtml).toContain("Apunte en progreso");
    expect(draftHtml).toContain(IMAGE.dataUrl);

    const historyHtml = focusView(state, test.project, test.task, {
      animatePage: false,
      taskFilter: "all",
      menu: null,
      focusLearningTab: "history",
      learningDrafts: { [test.task.id]: draft },
    });
    expect(historyHtml).toContain("Aún no hay reflexiones");
    expect(historyHtml).not.toContain('data-form="learning-draft"');
  });

  it("keeps drafts isolated by account and restores their images", () => {
    const storage = new MemoryStorage();
    const userA = new LearningDraftStore(storage, "user-a");
    const userB = new LearningDraftStore(storage, "user-b");
    userA.save({ "task-one": { learned: "Borrador A", learnedImages: [IMAGE] } });

    expect(userA.load()["task-one"]).toMatchObject({ learned: "Borrador A", learnedImages: [IMAGE] });
    expect(userB.load()).toEqual({});
    expect(storage.getItem(learningDraftStorageKey("user-a"))).toContain("Borrador A");
  });

  it("normalizes old entries without images and filters unsafe image sources", () => {
    const state = createEmptyState(new Date("2026-09-17T12:00:00.000Z"));
    state.projects.push({ id: "project-one", name: "Proyecto", description: "", icon: "book", color: "#2587ff", createdAt: "2026-09-17T12:00:00.000Z" });
    state.tasks.push({ id: "task-one", projectId: "project-one", title: "Tarea", description: "", status: "pending", dueDate: null, accumulatedSeconds: 0, createdAt: "2026-09-17T12:00:00.000Z", completedAt: null });
    state.learningEntries.push({ id: "learning-one", projectId: "project-one", taskId: "task-one", focusSessionId: null, date: "2026-09-17", createdAt: "2026-09-17T12:00:00.000Z", learned: "Texto", unresolved: "", nextSession: "" });
    state.learningEntries.push({ id: "learning-two", projectId: "project-one", taskId: "task-one", focusSessionId: null, date: "2026-09-17", createdAt: "2026-09-17T13:00:00.000Z", learned: "Texto 2", unresolved: "", nextSession: "", learnedImages: [{ id: "bad-image", dataUrl: "javascript:alert(1)" }] });

    const normalized = normalizeState(state);
    expect(normalized.learningEntries[0].learnedImages).toEqual([]);
    expect(normalized.learningEntries[1].learnedImages).toEqual([]);
  });

  it("renders the standalone draft editor with image controls and optional labels", () => {
    const html = learningDraftForm({ id: "task-one" }, { learned: "Texto", learnedImages: [IMAGE] });
    expect(html).toContain("Ctrl+V");
    expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(html).toContain("necesario al guardar");
    expect(html.match(/opcional/g)).toHaveLength(2);
  });
});

import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { StudyHubRepository, activeElapsedSeconds } from "../src/data/repository.js";
import { createEmptyState } from "../src/data/schema.js";
import { createStore } from "../src/state/store.js";

async function setup() {
  let nowMs = new Date("2026-09-15T12:00:00.000Z").getTime();
  const clock = () => new Date(nowMs);
  const adapter = new MemoryAdapter(createEmptyState(clock()));
  const store = createStore(null);
  const repository = new StudyHubRepository({ adapter, store, clock });
  await repository.initialize();
  const project = await repository.createProject({ name: "Proyecto de prueba", description: "", icon: "code", color: "#7657ff" });
  const task = await repository.createTask(project.id, { title: "Tarea de prueba", description: "", dueDate: null, status: "pending" });
  return { repository, adapter, store, project, task, advance(seconds) { nowMs += seconds * 1000; }, clock };
}

describe("StudyHubRepository timer", () => {
  it("excludes paused time and finalizes a session exactly once", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    test.advance(600);
    await test.repository.pauseTimer();
    test.advance(300);
    await test.repository.startTimer(test.task.id);
    test.advance(300);
    const saved = await test.repository.stopTimer();

    expect(saved).toBe(900);
    expect(test.repository.getState().tasks.find((task) => task.id === test.task.id).accumulatedSeconds).toBe(900);
    expect(test.repository.getState().focusSessions).toHaveLength(1);

    const writesBefore = test.adapter.writeCount;
    expect(await test.repository.stopTimer()).toBe(0);
    expect(test.adapter.writeCount).toBe(writesBefore);
    expect(test.repository.getState().focusSessions).toHaveLength(1);
  });

  it("reconstructs a running timer from timestamps after reinitialization", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    test.advance(420);

    const reloadedStore = createStore(null);
    const reloaded = new StudyHubRepository({ adapter: test.adapter, store: reloadedStore, clock: test.clock });
    await reloaded.initialize();
    expect(activeElapsedSeconds(reloaded.getState().activeTimer, test.clock().getTime())).toBe(420);
    expect(reloaded.getState().tasks.find((task) => task.id === test.task.id).accumulatedSeconds).toBe(0);

    const saved = await reloaded.stopTimer();
    expect(saved).toBe(420);
    expect(reloaded.getState().tasks.find((task) => task.id === test.task.id).accumulatedSeconds).toBe(420);
  });

  it("saves pending time before reflection and never completes before reflection", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    test.advance(300);
    await test.repository.requestCompletion(test.task.id);

    let state = test.repository.getState();
    expect(state.activeTimer).toBeNull();
    expect(state.tasks.find((task) => task.id === test.task.id).accumulatedSeconds).toBe(300);
    expect(state.tasks.find((task) => task.id === test.task.id).status).toBe("in_progress");
    expect(state.pendingCompletion.taskId).toBe(test.task.id);

    await test.repository.saveReflection({ learned: "Una idea", unresolved: "Una duda", nextSession: "Un siguiente paso" });
    state = test.repository.getState();
    expect(state.tasks.find((task) => task.id === test.task.id).status).toBe("completed");
    expect(state.focusSessions).toHaveLength(1);
    expect(state.learningEntries).toHaveLength(1);
    expect(state.pendingCompletion).toBeNull();
  });

  it("can request completion immediately without creating a dangling session", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    await test.repository.requestCompletion(test.task.id);
    const state = test.repository.getState();
    expect(state.focusSessions).toHaveLength(0);
    expect(state.pendingCompletion.focusSessionId).toBeNull();
  });
});

describe("StudyHubRepository data operations", () => {
  it("stores an optional due time and clears it when the date is removed", async () => {
    const test = await setup();
    await test.repository.updateTask(test.task.id, { title: test.task.title, description: "", dueDate: "2026-09-30", dueTime: "18:45" });
    let task = test.repository.getState().tasks.find((item) => item.id === test.task.id);
    expect(task.dueTime).toBe("18:45");

    await test.repository.updateTask(test.task.id, { title: test.task.title, description: "", dueDate: null, dueTime: "18:45" });
    task = test.repository.getState().tasks.find((item) => item.id === test.task.id);
    expect(task.dueDate).toBeNull();
    expect(task.dueTime).toBeNull();
  });

  it("deletes a project even when one of its tasks owns the active timer", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);

    await test.repository.deleteProject(test.project.id);

    const state = test.repository.getState();
    expect(state.projects).toHaveLength(0);
    expect(state.tasks).toHaveLength(0);
    expect(state.activeTimer).toBeNull();
  });

  it("cascades project deletion to tasks, sessions and learning entries", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    test.advance(60);
    await test.repository.requestCompletion(test.task.id);
    await test.repository.saveReflection({ learned: "Aprendí", unresolved: "Duda", nextSession: "Seguir" });
    await test.repository.deleteProject(test.project.id);
    const state = test.repository.getState();
    expect(state.projects).toHaveLength(0);
    expect(state.tasks).toHaveLength(0);
    expect(state.focusSessions).toHaveLength(0);
    expect(state.learningEntries).toHaveLength(0);
  });

  it("round-trips a versioned backup and pauses a running timer", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    test.advance(75);
    const envelope = test.repository.exportEnvelope();

    expect(envelope.app).toBe("StudyHub");
    expect(envelope.data.activeTimer.phase).toBe("paused");
    expect(envelope.data.activeTimer.elapsedSeconds).toBe(75);

    await test.repository.resetAll();
    await test.repository.importEnvelope(envelope);
    const restored = test.repository.getState();
    expect(restored.projects).toHaveLength(1);
    expect(restored.tasks).toHaveLength(1);
    expect(restored.activeTimer.phase).toBe("paused");
    expect(restored.activeTimer.elapsedSeconds).toBe(75);
  });

  it("rejects an invalid import without replacing current state", async () => {
    const test = await setup();
    const before = structuredClone(test.repository.getState());
    await expect(test.repository.importEnvelope({ app: "Otra app", schemaVersion: 1, data: {} })).rejects.toThrow();
    expect(test.repository.getState()).toEqual(before);
  });
});

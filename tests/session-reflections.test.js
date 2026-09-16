import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { createEmptyState, validateState } from "../src/data/schema.js";
import { projectEntries, taskEntries } from "../src/state/selectors.js";
import { createStore } from "../src/state/store.js";
import { learningTable } from "../src/ui/components.js";

async function setup() {
  let nowMs = new Date("2026-09-15T12:00:00.000Z").getTime();
  const clock = () => new Date(nowMs);
  const adapter = new MemoryAdapter(createEmptyState(clock()));
  const store = createStore(null);
  const repository = new StudyHubRepository({ adapter, store, clock });
  await repository.initialize();
  const project = await repository.createProject({ name: "Programación", description: "", icon: "code", color: "#7657ff" });
  const task = await repository.createTask(project.id, { title: "Practicar arrays", description: "", dueDate: null, status: "pending" });
  return { repository, adapter, project, task, clock, advance(seconds) { nowMs += seconds * 1000; } };
}

async function saveReflection(repository, number) {
  await repository.saveReflection({
    learned: `Aprendizaje ${number}`,
    unresolved: `Duda ${number}`,
    nextSession: `Paso ${number + 1}`,
  });
}

describe("reflections for every focus session", () => {
  it("keeps multiple session reflections, sums time once, and completes only on the final reflection", async () => {
    const test = await setup();

    await test.repository.startTimer(test.task.id);
    test.advance(600);
    expect(await test.repository.stopTimer()).toBe(600);

    let state = test.repository.getState();
    expect(state.tasks.find((task) => task.id === test.task.id).status).toBe("in_progress");
    expect(state.pendingCompletion).toMatchObject({ taskId: test.task.id, kind: "session" });
    expect(state.focusSessions).toHaveLength(1);
    expect(state.focusSessions[0].durationSeconds).toBe(600);
    expect(state.pendingCompletion.focusSessionId).toBe(state.focusSessions[0].id);

    const writesAfterStop = test.adapter.writeCount;
    expect(await test.repository.stopTimer()).toBe(0);
    expect(test.adapter.writeCount).toBe(writesAfterStop);
    expect(test.repository.getState().focusSessions).toHaveLength(1);

    await saveReflection(test.repository, 1);
    state = test.repository.getState();
    expect(state.tasks.find((task) => task.id === test.task.id).status).toBe("in_progress");
    expect(state.learningEntries).toHaveLength(1);
    expect(state.learningEntries[0].focusSessionId).toBe(state.focusSessions[0].id);

    await test.repository.startTimer(test.task.id);
    test.advance(300);
    expect(await test.repository.stopTimer()).toBe(300);
    await saveReflection(test.repository, 2);

    state = test.repository.getState();
    expect(state.focusSessions.map((session) => session.durationSeconds)).toEqual([600, 300]);
    expect(state.tasks.find((task) => task.id === test.task.id).accumulatedSeconds).toBe(900);
    expect(taskEntries(state, test.task.id).map((entry) => entry.learned)).toEqual(["Aprendizaje 1", "Aprendizaje 2"]);

    await test.repository.startTimer(test.task.id);
    test.advance(120);
    await test.repository.requestCompletion(test.task.id);
    state = test.repository.getState();
    expect(state.pendingCompletion).toMatchObject({ taskId: test.task.id, kind: "completion" });
    expect(state.focusSessions).toHaveLength(3);
    expect(state.tasks.find((task) => task.id === test.task.id).status).toBe("in_progress");
    expect(state.tasks.find((task) => task.id === test.task.id).accumulatedSeconds).toBe(1020);

    const beforeRepeatedCompletion = structuredClone(state);
    await expect(test.repository.requestCompletion(test.task.id)).rejects.toThrow(/reflexión pendiente/i);
    expect(test.repository.getState()).toEqual(beforeRepeatedCompletion);

    await saveReflection(test.repository, 3);
    state = test.repository.getState();
    const storedTask = state.tasks.find((task) => task.id === test.task.id);
    expect(storedTask.status).toBe("completed");
    expect(state.focusSessions).toHaveLength(3);
    expect(state.learningEntries).toHaveLength(3);
    expect(new Set(state.learningEntries.map((entry) => entry.focusSessionId)).size).toBe(3);
    expect(state.focusSessions.reduce((sum, session) => sum + session.durationSeconds, 0)).toBe(storedTask.accumulatedSeconds);
    expect(storedTask.accumulatedSeconds).toBe(1020);

    const afterCompletion = structuredClone(state);
    await expect(saveReflection(test.repository, 4)).rejects.toThrow(/guardada o cancelada/i);
    expect(test.repository.getState()).toEqual(afterCompletion);

    const taskTable = learningTable(taskEntries(state, test.task.id), state, "task");
    expect(taskTable).toContain("Sesión 1");
    expect(taskTable).toContain("Sesión 2");
    expect(taskTable).toContain("Sesión 3");

    const generalEntries = projectEntries(state, test.project.id);
    const projectTable = learningTable(generalEntries, state, "project");
    expect(generalEntries).toHaveLength(3);
    expect(projectTable).toContain("Clase 1");
    expect(projectTable).toContain("Clase 2");
    expect(projectTable).toContain("Clase 3");
    expect(projectTable).toContain("Practicar arrays");

    const reloadedStore = createStore(null);
    const reloaded = new StudyHubRepository({ adapter: test.adapter, store: reloadedStore, clock: test.clock });
    await reloaded.initialize();
    expect(reloaded.getState().focusSessions).toEqual(state.focusSessions);
    expect(reloaded.getState().learningEntries).toEqual(state.learningEntries);
    expect(reloaded.getState().tasks.find((task) => task.id === test.task.id)).toEqual(storedTask);
  });

  it("can omit a session reflection without losing time or blocking the next session", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    test.advance(45);
    await test.repository.stopTimer();

    const reloadedStore = createStore(null);
    const reloaded = new StudyHubRepository({ adapter: test.adapter, store: reloadedStore, clock: test.clock });
    await reloaded.initialize();
    expect(reloaded.getState().pendingCompletion).toMatchObject({ taskId: test.task.id, kind: "session" });
    await reloaded.cancelCompletion();

    let state = reloaded.getState();
    expect(state.pendingCompletion).toBeNull();
    expect(state.learningEntries).toHaveLength(0);
    expect(state.focusSessions).toHaveLength(1);
    expect(state.tasks.find((task) => task.id === test.task.id).accumulatedSeconds).toBe(45);
    expect(state.tasks.find((task) => task.id === test.task.id).status).toBe("in_progress");

    await reloaded.startTimer(test.task.id);
    expect(reloaded.getState().activeTimer?.taskId).toBe(test.task.id);
  });

  it("rejects duplicate reflections for the same focus session", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    test.advance(60);
    await test.repository.stopTimer();
    await saveReflection(test.repository, 1);
    const invalid = structuredClone(test.repository.getState());
    invalid.learningEntries.push({ ...invalid.learningEntries[0], id: "learning-duplicate" });
    expect(() => validateState(invalid)).toThrow(/más de una reflexión/i);
  });
});

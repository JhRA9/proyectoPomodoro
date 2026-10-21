import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { createEmptyState } from "../src/data/schema.js";
import { createStore } from "../src/state/store.js";
import { globalTasksPanel, taskFormDialog } from "../src/ui/components.js";

async function setup() {
  let now = new Date(2026, 9, 21, 9, 0, 0);
  const clock = () => new Date(now);
  const repository = new StudyHubRepository({ adapter: new MemoryAdapter(createEmptyState(clock())), store: createStore(null), clock });
  await repository.initialize();
  const project = await repository.createProject({ name: "Hábitos", description: "", icon: "activity", color: "#2587ff" });
  const task = await repository.createTask(project.id, {
    title: "Estudiar todos los días",
    description: "Práctica diaria",
    status: "pending",
    repeatDaily: "daily",
    recurrenceStartDate: "2026-10-21",
    recurrenceEndDate: "2026-10-23",
  });
  return {
    repository,
    project,
    task,
    clock,
    advanceSeconds(seconds) { now = new Date(now.getTime() + seconds * 1000); },
    nextDay() { now = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0); },
  };
}

describe("daily recurring tasks", () => {
  it("completes only today's occurrence and accumulates sessions across days", async () => {
    const test = await setup();
    await test.repository.setTimerMode("infinite");
    await test.repository.startTimer(test.task.id);
    test.advanceSeconds(600);
    const first = await test.repository.completeTaskWithReflection(test.task.id, {
      learned: "Primer día", unresolved: "", nextSession: "", learnedImages: [],
    });

    let state = test.repository.getState();
    let task = state.tasks.find((item) => item.id === test.task.id);
    expect(first.occurrenceCompleted).toBe(true);
    expect(task.status).toBe("in_progress");
    expect(task.recurrence.completedDates).toEqual(["2026-10-21"]);
    expect(task.accumulatedSeconds).toBe(600);
    expect(state.focusSessions).toHaveLength(1);
    expect(state.learningEntries).toHaveLength(1);

    const duplicate = await test.repository.completeTaskWithReflection(test.task.id, {
      learned: "No debe duplicarse", unresolved: "", nextSession: "", learnedImages: [],
    });
    expect(duplicate.alreadyCompleted).toBe(true);
    expect(test.repository.getState().learningEntries).toHaveLength(1);

    test.nextDay();
    await test.repository.setTimerMode("countdown");
    await test.repository.setFocusDurationParts(0, 30);
    await test.repository.startTimer(test.task.id);
    test.advanceSeconds(300);
    await test.repository.completeTaskWithReflection(test.task.id, {
      learned: "Segundo día", unresolved: "", nextSession: "", learnedImages: [],
    });

    state = test.repository.getState();
    task = state.tasks.find((item) => item.id === test.task.id);
    expect(task.status).toBe("in_progress");
    expect(task.recurrence.completedDates).toEqual(["2026-10-21", "2026-10-22"]);
    expect(task.accumulatedSeconds).toBe(900);
    expect(state.focusSessions.map((session) => session.durationSeconds)).toEqual([600, 300]);
    expect(state.learningEntries.map((entry) => entry.date)).toEqual(["2026-10-21", "2026-10-22"]);
  });

  it("finishes the series only after completing its final date", async () => {
    const test = await setup();
    test.nextDay();
    test.nextDay();
    await test.repository.completeTaskWithReflection(test.task.id, {
      learned: "Último día", unresolved: "", nextSession: "", learnedImages: [],
    });
    const task = test.repository.getState().tasks.find((item) => item.id === test.task.id);
    expect(task.recurrence.completedDates).toEqual(["2026-10-23"]);
    expect(task.status).toBe("completed");
    expect(task.completedAt).not.toBeNull();
  });

  it("uses the reflection dialog flow to complete only the current day", async () => {
    const test = await setup();
    const result = await test.repository.setTaskStatus(test.task.id, "completed");
    expect(result.occurrenceCompletion).toBe(true);
    expect(test.repository.getState().pendingCompletion).toMatchObject({
      taskId: test.task.id,
      kind: "completion",
      occurrenceDate: "2026-10-21",
    });

    await test.repository.saveReflection({ learned: "Reflexión diaria", unresolved: "", nextSession: "" });
    const task = test.repository.getState().tasks.find((item) => item.id === test.task.id);
    expect(task.status).toBe("in_progress");
    expect(task.recurrence.completedDates).toEqual(["2026-10-21"]);
    expect(test.repository.getState().pendingCompletion).toBeNull();
  });

  it("reappears in the global agenda the next day but not after today's completion", async () => {
    const test = await setup();
    expect(globalTasksPanel(test.repository.getState(), test.clock())).toContain("Hoy · diaria");
    await test.repository.completeTaskWithReflection(test.task.id, {
      learned: "Listo por hoy", unresolved: "", nextSession: "", learnedImages: [],
    });
    expect(globalTasksPanel(test.repository.getState(), test.clock())).not.toContain(test.task.title);
    test.nextDay();
    expect(globalTasksPanel(test.repository.getState(), test.clock())).toContain(test.task.title);
  });

  it("renders an optional end date in the task form", () => {
    const html = taskFormDialog("project-a");
    expect(html).toContain('name="repeatDaily"');
    expect(html).toContain('name="recurrenceStartDate"');
    expect(html).toContain('name="recurrenceEndDate"');
    expect(html).toContain("Sin fecha final");
  });

  it("persists daily progress in backups and supports an open-ended series", async () => {
    const test = await setup();
    const openEnded = await test.repository.createTask(test.project.id, {
      title: "Leer a diario",
      status: "pending",
      repeatDaily: "daily",
      recurrenceStartDate: "2026-10-21",
      recurrenceEndDate: "",
    });
    await test.repository.completeTaskWithReflection(openEnded.id, {
      learned: "Lectura del día", unresolved: "", nextSession: "", learnedImages: [],
    });
    const backup = test.repository.exportEnvelope();
    await test.repository.resetAll();
    await test.repository.importEnvelope(backup);
    const restored = test.repository.getState().tasks.find((task) => task.id === openEnded.id);
    expect(restored.recurrence).toEqual({
      frequency: "daily",
      startDate: "2026-10-21",
      endDate: null,
      completedDates: ["2026-10-21"],
    });
    expect(restored.status).toBe("in_progress");
  });

  it("rejects a recurrence whose end precedes its start", async () => {
    const test = await setup();
    await expect(test.repository.createTask(test.project.id, {
      title: "Inválida",
      status: "pending",
      repeatDaily: "daily",
      recurrenceStartDate: "2026-10-25",
      recurrenceEndDate: "2026-10-24",
    })).rejects.toThrow(/fecha final/i);
  });
});

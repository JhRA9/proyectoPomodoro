import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { StudyHubRepository, activeElapsedSeconds } from "../src/data/repository.js";
import { createEmptyState, normalizeState } from "../src/data/schema.js";
import { createStore } from "../src/state/store.js";

async function setup() {
  let nowMs = new Date("2026-09-15T12:00:00.000Z").getTime();
  const clock = () => new Date(nowMs);
  const adapter = new MemoryAdapter(createEmptyState(clock()));
  const repository = new StudyHubRepository({ adapter, store: createStore(null), clock });
  await repository.initialize();
  const project = await repository.createProject({ name: "Proyecto", description: "", icon: "code", color: "#7657ff" });
  const task = await repository.createTask(project.id, { title: "Estudiar", description: "", dueDate: null, status: "pending" });
  return { adapter, repository, task, clock, advance(seconds) { nowMs += seconds * 1000; } };
}

describe("timer modes", () => {
  it("runs an unlimited session upward and persists it without counting paused time", async () => {
    const test = await setup();
    await test.repository.setTimerMode("infinite");
    await test.repository.startTimer(test.task.id);

    expect(test.repository.getState().activeTimer.targetSeconds).toBeNull();
    test.advance(600);
    await test.repository.pauseTimer();
    test.advance(300);
    await test.repository.startTimer(test.task.id);
    test.advance(300);

    expect(await test.repository.stopTimer()).toBe(900);
    const state = test.repository.getState();
    expect(state.focusSessions).toHaveLength(1);
    expect(state.focusSessions[0].durationSeconds).toBe(900);
    expect(state.tasks.find((task) => task.id === test.task.id).accumulatedSeconds).toBe(900);
  });

  it("supports a custom duration beyond the former two-hour limit and snapshots it per session", async () => {
    const test = await setup();
    await test.repository.setFocusDurationParts("5", "37");
    expect(test.repository.getState().settings.focusDurationSeconds).toBe(20_220);

    await test.repository.startTimer(test.task.id);
    expect(test.repository.getState().activeTimer.targetSeconds).toBe(20_220);
    await expect(test.repository.setFocusDurationParts(1, 0)).rejects.toThrow(/Detén la sesión/i);
    await expect(test.repository.setTimerMode("infinite")).rejects.toThrow(/Detén la sesión/i);
    expect(test.repository.getState().activeTimer.targetSeconds).toBe(20_220);
  });

  it("validates custom hour and minute values", async () => {
    const test = await setup();
    await expect(test.repository.setFocusDurationParts(0, 0)).rejects.toThrow(/mínima/i);
    await expect(test.repository.setFocusDurationParts(-1, 30)).rejects.toThrow(/horas/i);
    await expect(test.repository.setFocusDurationParts(1.5, 0)).rejects.toThrow(/horas/i);
    await expect(test.repository.setFocusDurationParts(0, 60)).rejects.toThrow(/minutos/i);
    await expect(test.repository.setFocusDurationParts(0, 1.5)).rejects.toThrow(/minutos/i);
  });

  it("reconstructs and exports an unlimited running timer", async () => {
    const test = await setup();
    await test.repository.setTimerMode("infinite");
    await test.repository.startTimer(test.task.id);
    test.advance(420);

    const reloaded = new StudyHubRepository({ adapter: test.adapter, store: createStore(null), clock: test.clock });
    await reloaded.initialize();
    expect(reloaded.getState().activeTimer.targetSeconds).toBeNull();
    expect(activeElapsedSeconds(reloaded.getState().activeTimer, test.clock().getTime())).toBe(420);

    const envelope = reloaded.exportEnvelope();
    expect(envelope.data.activeTimer).toMatchObject({ phase: "paused", elapsedSeconds: 420, targetSeconds: null });
  });

  it("migrates existing local data to countdown mode", () => {
    const legacy = createEmptyState(new Date("2026-09-15T12:00:00.000Z"));
    delete legacy.settings.timerMode;
    const normalized = normalizeState(legacy);
    expect(normalized.settings.timerMode).toBe("countdown");
    expect(normalized.settings.focusDurationSeconds).toBe(1500);
  });
});

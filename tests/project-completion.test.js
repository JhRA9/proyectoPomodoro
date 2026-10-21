import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { createEmptyState, normalizeState } from "../src/data/schema.js";
import { createStore } from "../src/state/store.js";
import { globalTasksPanel, projectCard } from "../src/ui/components.js";
import { projectsView } from "../src/views/projectsView.js";

async function setup() {
  let nowMs = new Date("2026-10-21T14:00:00.000Z").getTime();
  const clock = () => new Date(nowMs);
  const repository = new StudyHubRepository({ adapter: new MemoryAdapter(createEmptyState(clock())), store: createStore(null), clock });
  await repository.initialize();
  const project = await repository.createProject({ name: "Proyecto de grado", description: "Correcciones", icon: "graduation", color: "#f34fa5" });
  const task = await repository.createTask(project.id, { title: "Corregir capítulo", description: "", dueDate: "2026-10-22", status: "pending" });
  return { repository, project, task, clock, advance(seconds) { nowMs += seconds * 1000; } };
}

describe("project completion", () => {
  it("archives and restores a project without losing its task or active timer time", async () => {
    const test = await setup();
    await test.repository.startTimer(test.task.id);
    test.advance(95);

    const result = await test.repository.setProjectStatus(test.project.id, "completed");
    let state = test.repository.getState();
    expect(result.pausedTaskTitle).toBe("Corregir capítulo");
    expect(state.projects[0]).toMatchObject({ status: "completed" });
    expect(state.projects[0].completedAt).toBeTruthy();
    expect(state.tasks).toHaveLength(1);
    expect(state.activeTimer).toMatchObject({ taskId: test.task.id, phase: "paused", elapsedSeconds: 95 });
    expect(state.focusSessions).toHaveLength(0);
    expect(globalTasksPanel(state, test.clock())).not.toContain("Corregir capítulo");
    await expect(test.repository.startTimer(test.task.id)).rejects.toThrow("Descompleta el proyecto");

    await test.repository.setProjectStatus(test.project.id, "active");
    state = test.repository.getState();
    expect(state.projects[0]).toMatchObject({ status: "active", completedAt: null });
    expect(globalTasksPanel(state, test.clock())).toContain("Corregir capítulo");
    await test.repository.startTimer(test.task.id);
    expect(test.repository.getState().activeTimer).toMatchObject({ phase: "running", elapsedSeconds: 95 });
  });

  it("normalizes old projects as active", () => {
    const legacy = createEmptyState(new Date("2026-10-21T14:00:00.000Z"));
    legacy.projects.push({ id: "legacy-project", name: "Anterior", description: "", icon: "folder", color: "#7657ff", createdAt: legacy.updatedAt });
    expect(normalizeState(legacy).projects[0]).toMatchObject({ status: "active", completedAt: null });
  });

  it("renders active and completed projects in separate dashboard sections", async () => {
    const test = await setup();
    await test.repository.setProjectStatus(test.project.id, "completed");
    const active = await test.repository.createProject({ name: "Proyecto activo", description: "", icon: "folder", color: "#7657ff" });
    const state = test.repository.getState();
    const html = projectsView(state, { search: "", animatePage: false, menu: null });
    expect(html).toContain("Mis proyectos");
    expect(html).toContain("Proyectos completados");
    expect(html.indexOf(active.name)).toBeLessThan(html.indexOf("Proyectos completados"));
    expect(html.indexOf(test.project.name)).toBeGreaterThan(html.indexOf("Proyectos completados"));
    expect(projectCard(state.projects.find((project) => project.id === test.project.id), state, { type: "project", projectId: test.project.id })).toContain("Descompletar proyecto");
  });
});

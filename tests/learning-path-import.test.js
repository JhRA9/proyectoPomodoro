import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { createEmptyState } from "../src/data/schema.js";
import { prepareLearningPathImport } from "../src/evaluation/learningPathImport.js";
import { competencyProgress } from "../src/evaluation/progress.js";
import { createStore } from "../src/state/store.js";
import { learningPathImportDialog } from "../src/ui/components.js";

const neutralRoute = {
  ruta: {
    nombre: "Frontend práctico 2026",
    descripcion: "Ruta neutral de formación",
    progreso: 92,
    certificado: "prestado.pdf",
    competencias: [
      { id: "js", nombre: "JavaScript", objetivos: ["Resolver problemas"] },
      { id: "dom", nombre: "DOM", dependencias: ["js"] },
    ],
    clases: [{ id: "class-1", titulo: "Variables", competencias: ["js"], enlace: "https://example.test/variables", completado: true }],
    tareas: [{ id: "task-1", titulo: "Tomar apuntes", fechaLimite: "2026-11-01", dependencias: ["class-1"] }],
    ejercicios: [{ id: "exercise-1", titulo: "Contador", dificultad: 2, competencias: ["js"] }],
    evaluacionesPrevistas: [{ id: "evaluation-1", titulo: "Diagnóstico DOM", dificultad: 3, competencias: ["dom"] }],
  },
};

async function repository() {
  const clock = () => new Date("2026-10-23T12:00:00.000Z");
  const instance = new StudyHubRepository({ adapter: new MemoryAdapter(createEmptyState(clock())), store: createStore(null), clock });
  await instance.initialize();
  return instance;
}

describe("educational route importer", () => {
  it("previews a neutral Spanish route and explicitly ignores borrowed progress", () => {
    const preview = prepareLearningPathImport(neutralRoute, "StudyHub_Ruta_Frontend_2026.json");
    expect(preview.counts).toEqual({ competencies: 2, classes: 1, tasks: 1, exercises: 1, plannedEvaluations: 1, links: 1 });
    expect(preview.warnings.join(" ")).toMatch(/Sin evaluar/i);
    expect(preview.warnings.join(" ")).toMatch(/certificado|progreso externo/i);
    expect(learningPathImportDialog(preview)).toContain("Vista previa");
  });

  it("creates a new Studies project with pending work and no fictitious evaluations", async () => {
    const repo = await repository();
    const preview = prepareLearningPathImport(neutralRoute, "StudyHub_Ruta_Frontend_2026.json");
    const project = await repo.importLearningPath(preview);
    const state = repo.getState();
    expect(project).toMatchObject({ projectType: "studies", name: "Frontend práctico 2026" });
    expect(state.tasks).toHaveLength(2);
    expect(state.tasks.every((item) => item.status === "pending")).toBe(true);
    expect(state.exercises).toHaveLength(2);
    expect(state.evaluations).toEqual([]);
    expect(state.competencies.every((item) => competencyProgress(state, item).validationState === "unassessed")).toBe(true);
    expect(state.competencies.find((item) => item.sourceExternalId === "dom").dependencies).toEqual([state.competencies.find((item) => item.sourceExternalId === "js").id]);
  });

  it("prevents importing the same route twice without overwriting the first project", async () => {
    const repo = await repository();
    const preview = prepareLearningPathImport(neutralRoute, "route.json");
    await repo.importLearningPath(preview);
    await expect(repo.importLearningPath(preview)).rejects.toThrow(/ya fue importada/i);
    expect(repo.getState().projects).toHaveLength(1);
  });

  it("does not confuse a StudyHub backup with an educational route", () => {
    expect(() => prepareLearningPathImport({ app: "StudyHub", schemaVersion: 2, data: {} }, "backup.json")).toThrow(/copias/i);
  });
});

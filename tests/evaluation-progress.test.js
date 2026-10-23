import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { createEmptyState, normalizeState } from "../src/data/schema.js";
import { createStore } from "../src/state/store.js";
import { competencyProgress, currentWeekSummary, deliverableProjectProgress, rubricPercentage, studyProjectProgress } from "../src/evaluation/progress.js";
import { createEvaluationReport, reportToMarkdown } from "../src/evaluation/report.js";
import { progressView } from "../src/views/progressView.js";

async function setup() {
  let nowMs = new Date("2026-10-20T12:00:00.000Z").getTime();
  const clock = () => new Date(nowMs);
  const repository = new StudyHubRepository({ adapter: new MemoryAdapter(createEmptyState(clock())), store: createStore(null), clock });
  await repository.initialize();
  const project = await repository.createProject({ name: "JavaScript", description: "Práctica", icon: "code", color: "#7657ff", projectType: "studies" });
  return { repository, project, advanceDays(days) { nowMs += days * 86_400_000; } };
}

describe("StudyHub 2.0 evaluation progress", () => {
  it("migrates schema v1 snapshots without losing existing study data", () => {
    const legacy = createEmptyState(new Date("2026-10-20T12:00:00.000Z"));
    legacy.schemaVersion = 1;
    delete legacy.competencies;
    delete legacy.exercises;
    delete legacy.evaluations;
    delete legacy.evidence;
    delete legacy.deliveryStages;
    delete legacy.deliverables;
    delete legacy.aiRequests;
    delete legacy.weeklyReviews;
    legacy.projects.push({ id: "project-old", name: "Anterior", description: "", icon: "book", color: "#2587ff", createdAt: "2026-10-20T12:00:00.000Z", status: "active", completedAt: null });
    const migrated = normalizeState(legacy);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.projects[0]).toMatchObject({ id: "project-old", projectType: "general" });
    expect(migrated.projects[0].evaluationConfig.rubric.criteria).toHaveLength(4);
    expect(migrated.competencies).toEqual([]);
  });

  it("calculates weighted rubric percentages only from evaluated criteria", () => {
    const criteria = [{ id: "a", weight: 40 }, { id: "b", weight: 60 }];
    expect(rubricPercentage(criteria, [{ criterionId: "a", score: 4 }, { criterionId: "b", score: 2 }])).toBe(70);
    expect(rubricPercentage(criteria, [{ criterionId: "a", score: 2 }])).toBe(50);
    expect(rubricPercentage(criteria, [])).toBeNull();
  });

  it("keeps a high result provisional until evidence is repeated at sufficient difficulty", async () => {
    const test = await setup();
    const competency = await test.repository.createCompetency(test.project.id, { name: "Funciones", description: "", objectives: "Componer funciones" });
    const exercise = await test.repository.createExercise(test.project.id, { title: "Buscador", difficulty: 4, competencyIds: [competency.id], helpLevel: "none", status: "completed", code: "const filter = () => [];" });
    const rubric = test.repository.getState().projects[0].evaluationConfig.rubric;
    const input = Object.fromEntries(rubric.criteria.flatMap((criterion) => [[`score_${criterion.id}`, "4"], [`justification_${criterion.id}`, "Evidencia observable"]]));

    await test.repository.recordManualEvaluation(exercise.id, { ...input, summary: "Primera prueba" });
    expect(competencyProgress(test.repository.getState(), competency).validationState).toBe("provisional");
    test.advanceDays(1);
    await test.repository.recordManualEvaluation(exercise.id, { ...input, summary: "Segunda prueba" });
    expect(competencyProgress(test.repository.getState(), competency).validationState).toBe("provisional");
    test.advanceDays(1);
    await test.repository.recordManualEvaluation(exercise.id, { ...input, summary: "Tercera prueba" });

    const result = competencyProgress(test.repository.getState(), competency);
    expect(result).toMatchObject({ percentage: 100, level: "Sólido", validationState: "validated", evaluations: 3 });
    expect(studyProjectProgress(test.repository.getState(), test.project.id).overall).toBeNull();
  });

  it("does not validate independence when the exercise used a generated solution", async () => {
    const test = await setup();
    const competency = await test.repository.createCompetency(test.project.id, { name: "Arrays" });
    const exercise = await test.repository.createExercise(test.project.id, { title: "Filtros", difficulty: 5, competencyIds: [competency.id], helpLevel: "generated_solution", status: "completed" });
    const rubric = test.repository.getState().projects[0].evaluationConfig.rubric;
    const input = Object.fromEntries(rubric.criteria.flatMap((criterion) => [[`score_${criterion.id}`, "4"], [`justification_${criterion.id}`, "Correcto"]]));
    for (let index = 0; index < 3; index += 1) { await test.repository.recordManualEvaluation(exercise.id, input); test.advanceDays(1); }
    expect(competencyProgress(test.repository.getState(), competency).validationState).toBe("provisional");
  });

  it("blocks deliverable verification until dependencies are verified", async () => {
    const test = await setup();
    await test.repository.updateEvaluationSettings(test.project.id, { projectType: "deliverables", privacy: "personal", provider: "gemini", profile: "complete" });
    const stage = await test.repository.createDeliveryStage(test.project.id, { title: "Montaje" });
    const first = await test.repository.createDeliverable(test.project.id, { stageId: stage.id, title: "Panel", status: "pending" });
    const second = await test.repository.createDeliverable(test.project.id, { stageId: stage.id, title: "Cableado", status: "pending", dependencyIds: [first.id] });
    await expect(test.repository.updateDeliverableStatus(second.id, "verified")).rejects.toThrow(/dependencias/i);
    await test.repository.updateDeliverableStatus(first.id, "verified");
    await test.repository.updateDeliverableStatus(second.id, "verified");
    expect(deliverableProjectProgress(test.repository.getState(), test.project.id).verified).toBe(2);
  });

  it("persists typed evidence and rejects evidence for targets outside the project", async () => {
    const test = await setup();
    const competency = await test.repository.createCompetency(test.project.id, { name: "Pruebas" });
    const exercise = await test.repository.createExercise(test.project.id, { title: "Caso límite", difficulty: 3, competencyIds: [competency.id], helpLevel: "none" });
    const evidence = await test.repository.createEvidence(test.project.id, { targetType: "exercise", targetId: exercise.id, title: "Prueba aprobada", description: "3 de 3 casos", kind: "test_passed", competencyIds: [competency.id] });
    expect(test.repository.getState().evidence[0]).toMatchObject({ id: evidence.id, kind: "test_passed", targetId: exercise.id });
    await expect(test.repository.createEvidence(test.project.id, { targetType: "exercise", targetId: "exercise-missing", title: "Inválida" })).rejects.toThrow(/no existe/i);
  });

  it("computes the current Monday-to-Sunday review locally", async () => {
    const test = await setup();
    const summary = currentWeekSummary(test.repository.getState(), test.project.id, new Date("2026-10-20T12:00:00.000Z"));
    expect(summary).toMatchObject({ start: "2026-10-19", end: "2026-10-25", seconds: 0, evaluations: 0 });
  });

  it("exports transparent Markdown and imports external evaluations without duplicates", async () => {
    const test = await setup();
    const competency = await test.repository.createCompetency(test.project.id, { name: "DOM" });
    const exercise = await test.repository.createExercise(test.project.id, { title: "Formulario", difficulty: 3, competencyIds: [competency.id], helpLevel: "partial_help", status: "completed", code: "private-code" });
    const rubric = test.repository.getState().projects[0].evaluationConfig.rubric;
    const input = Object.fromEntries(rubric.criteria.flatMap((criterion) => [[`score_${criterion.id}`, "3"], [`justification_${criterion.id}`, "Suficiente"]]));
    await test.repository.recordManualEvaluation(exercise.id, { ...input, summary: "Funciona con observaciones" });
    const report = createEvaluationReport(test.repository.getState(), test.project.id, { includeCode: false }, new Date("2026-10-21T00:00:00.000Z"));
    expect(report.exercises[0].code).toBe("");
    expect(reportToMarkdown(report)).toContain("No se registró consumo de IA");
    const existingCount = test.repository.getState().evaluations.length;
    expect((await test.repository.importExternalEvaluations(test.project.id, report)).imported).toBe(0);
    expect(test.repository.getState().evaluations).toHaveLength(existingCount);
  });

  it("renders the progress controls without claiming an unsupported overall level", async () => {
    const test = await setup();
    const html = progressView(test.repository.getState(), test.repository.getState().projects[0], { animatePage: false }, { aiEnabled: false });
    expect(html).toContain("Mi progreso");
    expect(html).toContain("No justificable");
    expect(html).toContain('data-form="competency"');
    expect(html).toContain('data-form="exercise"');
    expect(html).toContain("Exportar Markdown");
    expect(html).toContain("Copiar informe");
  });
});

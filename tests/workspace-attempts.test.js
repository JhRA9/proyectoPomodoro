import { describe, it, expect } from "vitest";
import { StudyHubRepository } from "../src/data/repository.js";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { createEmptyState, normalizeState, createExportEnvelope, validateState } from "../src/data/schema.js";
import { createStore } from "../src/state/store.js";
import { beginAttempt, reserveAttemptRequests, saveAttemptResponse, resolveAttempt, migrateAttempts, migrationBackup, restoreMigrationBackup, recordManualAttempt, reviseExercise, verifyEvidence } from "../src/evaluation/attempts.js";
import { studyProjectProgress, competencyProgress } from "../src/evaluation/progress.js";
import { createEvaluationReport, reportToMarkdown } from "../src/evaluation/report.js";
import { historyRows } from "../src/workspace/progressView.js";

async function setup() {
  let day = 0;
  const repo = new StudyHubRepository({ adapter: new MemoryAdapter(createEmptyState()), store: createStore(null), clock: () => new Date(Date.UTC(2026, 9, 20 + day, 15)) });
  await repo.initialize();
  const project = await repo.createProject({ name: "Estudios", projectType: "studies" });
  const area = await repo.createCompetency(project.id, { name: "JavaScript" });
  const exercise = await repo.createExercise(project.id, { title: "Consultar datos", code: "const privateSource = 42", competencyIds: [area.id], difficulty: 4, helpLevel: "none", independenceDeclared: true });
  const rubric = repo.getState().projects[0].evaluationConfig.rubric;
  const review = (provider = "gemini", score = 3) => ({ provider, model: `${provider}-test`, scores: rubric.criteria.map((c) => ({ criterionId: c.id, score, justification: "Resultado observado" })), summary: "Prueba", recommendations: ["Practicar filtros"] });
  return { repo, project, area, exercise, rubric, review, advance() { day++; } };
}

describe("workspace attempt contract", () => {
  it("stores one submission with two original reviews and no automatic average", async () => {
    const t = await setup(); const attempt = await beginAttempt(t.repo, t.exercise.id, "both");
    const first = t.review("gemini", 3), second = t.review("cloudflare", 2);
    await saveAttemptResponse(t.repo, attempt.id, { results: [first, second] });
    const state = t.repo.getState();
    expect(state.exercises).toHaveLength(1); expect(state.evaluations).toHaveLength(1);
    expect(state.evaluations[0].reviews.map((r) => r.percentage)).toEqual([75, 50]);
    expect(state.evaluations[0].reviews[0].original).toEqual(first);
    expect(state.evaluations[0].percentage).toBeNull(); expect(state.evaluations[0].canonicalResult).toBeNull();
    expect(studyProjectProgress(state, t.project.id).competenceRows[0].progress.pending).toBe(true);
  });
  it("deduplicates simultaneous pending submissions and repeated responses", async () => {
    const t = await setup(); const [a, b] = await Promise.all([beginAttempt(t.repo, t.exercise.id, "both"), beginAttempt(t.repo, t.exercise.id, "both")]);
    expect(a.id).toBe(b.id);
    await Promise.all([saveAttemptResponse(t.repo, a.id, { results: [t.review()] }), saveAttemptResponse(t.repo, a.id, { results: [t.review()] })]);
    expect(t.repo.getState().evaluations).toHaveLength(1); expect(t.repo.getState().evaluations[0].reviews).toHaveLength(1); expect(t.repo.getState().aiRequests).toHaveLength(1);
  });
  it("retries only the missing provider in the same attempt", async () => {
    const t = await setup(); const a = await beginAttempt(t.repo, t.exercise.id, "both");
    await saveAttemptResponse(t.repo, a.id, { results: [t.review()], errors: [{ provider: "cloudflare", message: "Temporal" }] });
    expect((await beginAttempt(t.repo, t.exercise.id, "cloudflare", a.id)).id).toBe(a.id);
    await saveAttemptResponse(t.repo, a.id, { results: [t.review("cloudflare")] });
    expect(t.repo.getState().evaluations).toHaveLength(1); expect(t.repo.getState().evaluations[0].errors).toEqual([]);
    await expect(beginAttempt(t.repo, t.exercise.id, "gemini", a.id)).rejects.toThrow(/ya tiene/);
  });
  it("adds the second provider to the same submission even when requested later", async () => {
    const t = await setup(); const a = await beginAttempt(t.repo, t.exercise.id, "gemini"); await saveAttemptResponse(t.repo, a.id, { results: [t.review()] });
    const b = await beginAttempt(t.repo, t.exercise.id, "cloudflare"); expect(b.id).toBe(a.id); expect(b.percentage).toBeNull();
    await saveAttemptResponse(t.repo, b.id, { results: [t.review("cloudflare")] }); expect(t.repo.getState().evaluations).toHaveLength(1);
    expect((await beginAttempt(t.repo, t.exercise.id, "gemini")).reviews).toHaveLength(2);
  });
  it("creates a new attempt only after a new exercise submission and keeps old evidence", async () => {
    const t = await setup(); const a = await beginAttempt(t.repo, t.exercise.id, "gemini"); await saveAttemptResponse(t.repo, a.id, { results: [t.review()] });
    await reviseExercise(t.repo, t.exercise.id, { title: t.exercise.title, code: "new version" });
    const b = await beginAttempt(t.repo, t.exercise.id, "gemini"); expect(b.id).not.toBe(a.id); expect(t.repo.getState().exercises).toHaveLength(1);
    expect(t.repo.getState().evaluations[0].evidenceSnapshot.code).toContain("privateSource");
  });
  it("does not duplicate manual attempts and combines a later provider review", async () => {
    const t = await setup(); const input = Object.fromEntries(t.rubric.criteria.map((c) => [`score_${c.id}`, 3]));
    const a = await recordManualAttempt(t.repo, t.exercise.id, input); await expect(recordManualAttempt(t.repo, t.exercise.id, input)).rejects.toThrow(/ya tiene/);
    const b = await beginAttempt(t.repo, t.exercise.id, "gemini"); expect(b.id).toBe(a.id); await saveAttemptResponse(t.repo,b.id,{results:[t.review()]}); expect(t.repo.getState().evaluations).toHaveLength(1);
  });
  it("counts failed requests toward the daily limit without counting a successful response twice", async () => {
    const t = await setup(); const a = await beginAttempt(t.repo,t.exercise.id,"both");
    await t.repo.updateEvaluationSettings(t.project.id,{...t.repo.getState().projects[0].evaluationConfig,maxRequestsPerDay:2});
    await reserveAttemptRequests(t.repo,a.id,["gemini","cloudflare"]); await saveAttemptResponse(t.repo,a.id,{results:[t.review()],errors:[{provider:"cloudflare",message:"failed"}]});
    expect(t.repo.getState().aiRequests.map((r)=>r.status)).toEqual(["completed","failed"]);
    await expect(reserveAttemptRequests(t.repo,a.id,["cloudflare"])).rejects.toThrow(/límite/);
  });
  it("rejects changed evidence on retry without losing original solution", async () => {
    const t = await setup(); const a = await beginAttempt(t.repo, t.exercise.id, "both");
    await t.repo.commit((s) => { s.exercises[0].code = "different"; });
    await expect(beginAttempt(t.repo, t.exercise.id, "gemini", a.id)).rejects.toThrow(/cambió/);
    expect(t.repo.getState().evaluations[0].evidenceSnapshot.code).toContain("privateSource");
  });
  it("requires a traceable resolution, preserving both scores and decisions", async () => {
    const t = await setup(); const a = await beginAttempt(t.repo, t.exercise.id, "both");
    await saveAttemptResponse(t.repo, a.id, { results: [t.review(), t.review("cloudflare", 2)] });
    const reviews = t.repo.getState().evaluations[0].reviews;
    await expect(resolveAttempt(t.repo, a.id, { reviewId: reviews[0].id, explanation: " " })).rejects.toThrow();
    await resolveAttempt(t.repo, a.id, { reviewId: reviews[0].id, explanation: "Pruebas independientes coinciden", actor: "Estudiante" });
    await resolveAttempt(t.repo, a.id, { reviewId: reviews[1].id, explanation: "Revisé un caso límite" });
    const result = t.repo.getState().evaluations[0];
    expect(result.percentage).toBe(50); expect(result.resolutionHistory).toHaveLength(2); expect(result.reviews.map((r) => r.percentage)).toEqual([75, 50]);
  });
  it("does not validate mastery from repeated AI reviews alone", async () => {
    const t = await setup();
    for (let i = 0; i < 4; i++) { const a = await beginAttempt(t.repo, t.exercise.id, "gemini"); await saveAttemptResponse(t.repo, a.id, { results: [t.review("gemini", 4)] }); t.advance(); }
    const p = competencyProgress(t.repo.getState(), t.area);
    expect(p.percentage).toBe(100); expect(p.validationState).toBe("provisional"); expect(studyProjectProgress(t.repo.getState(), t.project.id).overall).toBeNull();
  });
  it("records manual attempts atomically and does not infer verified autonomy", async () => {
    const t = await setup(); const before = t.repo.getState().revision;
    await recordManualAttempt(t.repo, t.exercise.id, Object.fromEntries(t.rubric.criteria.map((c) => [`score_${c.id}`, 3])));
    expect(t.repo.getState().revision).toBe(before + 1); expect(t.repo.getState().evaluations[0]).toMatchObject({ attemptVersion: 2, legacy: false, source: "manual", percentage: 75 });
  });
  it("does not use historical verification to validate a new unverified AI score", async () => {
    const t = await setup();
    const input = Object.fromEntries(t.rubric.criteria.map((c) => [`score_${c.id}`, 3]));
    for (let i = 0; i < 3; i++) { await t.repo.recordManualEvaluation(t.exercise.id, input); t.advance(); }
    expect(competencyProgress(t.repo.getState(), t.area).validationState).toBe("validated");
    const a = await beginAttempt(t.repo, t.exercise.id, "gemini");
    await saveAttemptResponse(t.repo, a.id, { results: [t.review("gemini", 4)] });
    expect(competencyProgress(t.repo.getState(), t.area).validationState).toBe("provisional");
    expect(t.repo.getState().evaluations).toHaveLength(4);
  });
  it("requires identified evidence and binds verification to the actual solution", async () => {
    const t = await setup(); const evidence = await t.repo.createEvidence(t.project.id, { title: "Prueba observada", targetType: "exercise", targetId: t.exercise.id });
    await expect(verifyEvidence(t.repo, evidence.id, { method: "ai", actor: "IA", description: "ok" })).rejects.toThrow();
    await verifyEvidence(t.repo, evidence.id, { method: "automated_test", actor: "vitest", description: "suite v1", independenceVerified: true });
    expect(t.repo.getState().evidence[0].verification.independenceVerified).toBe(false);
    await verifyEvidence(t.repo, evidence.id, { method: "identified_review", actor: "Revisor", description: "Sesión observada", independenceVerified: true });
    expect(t.repo.getState().evidence[0].verification).toMatchObject({ version: 2, independenceVerified: true });
    expect(t.repo.getState().evidence[0].verificationHistory).toHaveLength(2);
  });
  it("rejects malformed results without partially saving them", async () => {
    const t = await setup(); const a = await beginAttempt(t.repo, t.exercise.id, "both"); const before = structuredClone(t.repo.getState());
    await expect(saveAttemptResponse(t.repo, a.id, { results: [t.review(), { ...t.review("cloudflare"), scores: [] }] })).rejects.toThrow(/inválidos/);
    expect(t.repo.getState()).toEqual(before);
    await expect(saveAttemptResponse(t.repo, a.id, { results: [t.review("unknown")] })).rejects.toThrow(/inesperado/);
  });
  it("keeps legacy records separate even with identical exercise and timestamp", async () => {
    const t = await setup(); const input = Object.fromEntries(t.rubric.criteria.map((c) => [`score_${c.id}`, 3]));
    await t.repo.recordManualEvaluation(t.exercise.id, input); await t.repo.recordManualEvaluation(t.exercise.id, input);
    const old = t.repo.getState(); const migrated = migrateAttempts(old);
    expect(migrated.evaluations).toHaveLength(2); expect(migrated.evaluations.map((r) => r.reviews[0].original)).toEqual(old.evaluations);
    expect(migrateAttempts(migrated)).toEqual(migrated); expect(normalizeState(migrated)).toMatchObject({ evaluationModelVersion: 2 });
  });
  it("verifies the migration copy and restores the exact snapshot", async () => {
    const t = await setup(); const state = t.repo.getState(), backup = migrationBackup(state);
    expect(restoreMigrationBackup(JSON.parse(JSON.stringify(backup)))).toEqual(state);
    backup.data.projects[0].name = "modified";
    expect(() => restoreMigrationBackup(backup)).toThrow(/verificado/);
  });
  it("preserves new attempts in reload and ordinary backup restoration", async () => {
    const t = await setup(); const a = await beginAttempt(t.repo, t.exercise.id, "gemini"); await saveAttemptResponse(t.repo, a.id, { results: [t.review()] });
    const copy = createExportEnvelope(t.repo.getState());
    const repo = new StudyHubRepository({ adapter: new MemoryAdapter(normalizeState(copy.data)), store: createStore(null) }); await repo.initialize();
    expect(repo.getState().evaluations).toEqual(t.repo.getState().evaluations); expect(repo.getState().tasks).toEqual(t.repo.getState().tasks);
  });
  it("versions area coverage and leaves new areas unassessed", async () => {
    const t = await setup(); const version = t.repo.getState().projects[0].areaSetVersion;
    const area = await t.repo.createCompetency(t.project.id, { name: "CSS" });
    expect(t.repo.getState().projects[0].areaSetVersion).toBe(version + 1); expect(competencyProgress(t.repo.getState(), area).percentage).toBeNull();
  });
  it("paginates attempts, not reviews, and filters by area", async () => {
    const t = await setup();
    for (let i = 0; i < 9; i++) { const a = await beginAttempt(t.repo, t.exercise.id, "both"); await saveAttemptResponse(t.repo, a.id, { results: [t.review(), t.review("cloudflare")] }); await reviseExercise(t.repo,t.exercise.id,{title:t.exercise.title,code:`submission ${i+1}`}); }
    expect(historyRows(t.repo.getState(), t.project.id)).toMatchObject({ total: 9, pages: 2 });
    expect(historyRows(t.repo.getState(), t.project.id).items).toHaveLength(8); expect(historyRows(t.repo.getState(), t.project.id, t.area.id, 1).items).toHaveLength(1);
    expect(historyRows(t.repo.getState(), t.project.id, "missing").total).toBe(0);
  });
  it("exports provider provenance without leaking nested source when excluded", async () => {
    const t = await setup(); const a = await beginAttempt(t.repo, t.exercise.id, "both"); await saveAttemptResponse(t.repo, a.id, { results: [t.review(), t.review("cloudflare")] });
    const evidence = await t.repo.createEvidence(t.project.id, { title: "Comprobación", targetType: "exercise", targetId: t.exercise.id });
    await verifyEvidence(t.repo, evidence.id, { method: "identified_review", actor: "Revisor", description: "Solución observada", independenceVerified: true });
    const report = createEvaluationReport(t.repo.getState(), t.project.id, { includeCode: false });
    expect(JSON.stringify(report)).not.toContain("privateSource");
    expect(reportToMarkdown(report)).toContain("Pendiente"); expect(reportToMarkdown(report)).toContain("cloudflare"); expect(reportToMarkdown(report)).not.toContain("null%");
  });
  it("serializes concurrent commits and recovers after a rejected mutation", async () => {
    const t = await setup();
    await Promise.all([t.repo.createTask(t.project.id, { title: "A" }), t.repo.createTask(t.project.id, { title: "B" })]);
    expect(t.repo.getState().tasks).toHaveLength(2);
    await expect(t.repo.commit(() => { throw new Error("no"); })).rejects.toThrow();
    await t.repo.createTask(t.project.id, { title: "C" }); expect(validateState(t.repo.getState()).tasks).toHaveLength(3);
  });
});

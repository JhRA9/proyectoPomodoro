import { createId } from "../utils/id.js";
import { rubricPercentage } from "./progress.js";
import { toLocalDateKey } from "../utils/time.js";
import { HELP_LEVELS } from "./constants.js";

export const ATTEMPT_MODEL_VERSION = 2;
export const RULE_SET = "studyhub-conservative-2026-10";

// Exact source content, rather than time proximity, establishes attempt identity.
export function evidenceSignature(exercise, rubric) {
  const fields = ["id", "projectId", "submissionVersion", "title", "description", "objective", "difficulty", "competencyIds", "code", "expectedResult", "actualResult", "helpLevel", "independenceDeclared", "tests", "files"];
  return JSON.stringify({ exercise: Object.fromEntries(fields.map((key) => [key, exercise[key]])), rubric });
}

export function asAttempt(evaluation) {
  if (evaluation.attemptVersion === ATTEMPT_MODEL_VERSION) return evaluation;
  const original = structuredClone(evaluation);
  return { ...original, attemptVersion: ATTEMPT_MODEL_VERSION, legacy: true,
    ruleSetId: "legacy-v2", requestedProviders: [evaluation.provider || evaluation.source || "manual"],
    reviews: Number.isFinite(evaluation.percentage) ? [{ ...original, id: `review-${evaluation.id}`, original }] : [],
    canonicalResult: Number.isFinite(evaluation.percentage) ? { percentage: evaluation.percentage, scores: original.scores,
      source: "legacy", resolvedAt: evaluation.createdAt, actor: "Migración conservadora", explanation: "Resultado histórico conservado; identidad de envío no disponible." } : null,
    resolutionHistory: [], evidenceSnapshot: null,
  };
}

export function migrateAttempts(state) {
  const next = structuredClone(state);
  next.evaluationModelVersion = ATTEMPT_MODEL_VERSION;
  next.evaluations = next.evaluations.map(asAttempt);
  return next;
}

export function migrationBackup(state) {
  const data = structuredClone(state);
  return { kind: "studyhub-before-attempts-v2", modelVersion: state.evaluationModelVersion || 1,
    createdAt: new Date().toISOString(), data, serialized: JSON.stringify(data) };
}

export function restoreMigrationBackup(backup) {
  if (backup?.kind !== "studyhub-before-attempts-v2" || JSON.stringify(backup.data) !== backup.serialized) throw new Error("La copia de migración no coincide con su contenido verificado.");
  return structuredClone(backup.data);
}

export function validateAttempt(item) {
  if (!item.attemptVersion) return;
  if (item.attemptVersion !== ATTEMPT_MODEL_VERSION || !Array.isArray(item.reviews) || !Array.isArray(item.requestedProviders)) throw new Error("El intento no contiene revisiones compatibles.");
  const providers = new Set();
  for (const review of item.reviews) {
    const provider = review.provider || review.source;
    if (providers.has(provider)) throw new Error("Un intento contiene revisiones duplicadas del mismo proveedor.");
    providers.add(provider);
    if (!Array.isArray(review.scores) || !Number.isFinite(review.percentage) || review.percentage < 0 || review.percentage > 100) throw new Error("La revisión no contiene una puntuación válida.");
  }
  if (item.canonicalResult && (!Number.isFinite(item.canonicalResult.percentage) || !item.canonicalResult.explanation)) throw new Error("La resolución del intento no tiene trazabilidad.");
  if (item.percentage !== (item.canonicalResult?.percentage ?? null)) throw new Error("La puntuación del intento no coincide con su resolución.");
}

export async function beginAttempt(repository, exerciseId, provider, attemptId = null) {
  if (!["gemini", "cloudflare", "both"].includes(provider)) throw new Error("Elige un proveedor válido.");
  return repository.commit((state) => {
    const exercise = state.exercises.find((x) => x.id === exerciseId);
    const project = state.projects.find((x) => x.id === exercise?.projectId);
    if (!project || !exercise) throw new Error("El ejercicio ya no existe.");
    if(exercise.purpose==="technical")throw new Error("Esta entrega tiene uso técnico. Registra una versión académica o mixta antes de evaluarla.");
    const signature = evidenceSignature(exercise, project.evaluationConfig.rubric);
    if (attemptId) {
      const existing = state.evaluations.find((x) => x.id === attemptId && x.targetId === exerciseId);
      if (!existing || existing.evidenceSignature !== signature) throw new Error("La evidencia o rúbrica cambió. Inicia un intento nuevo.");
      if (!existing.requestedProviders.includes(provider) || existing.reviews.some((x) => x.provider === provider)) throw new Error("Este proveedor ya tiene una revisión guardada o no forma parte del intento.");
      existing.status = "pending";
      return existing;
    }
    const active = state.evaluations.findLast((x) => x.attemptVersion === 2 && !x.legacy && x.provenance !== "external-import" && x.evidenceSignature === signature);
    if (active) {
      active.requestedProviders = [...new Set([...active.requestedProviders, ...(provider === "both" ? ["gemini", "cloudflare"] : [provider])])];
      if (active.requestedProviders.length > 1 && active.canonicalResult?.source !== "explicit_resolution") { active.canonicalResult = null; active.percentage = null; active.scores = []; }
      return active;
    }
    const attempt = { id: createId("attempt"), projectId: project.id, targetType: "exercise", targetId: exercise.id,
      attemptVersion: 2, ruleSetId: RULE_SET, areaSetVersion: project.areaSetVersion || 1,
      source: "attempt", provider: null, model: null, profile: project.evaluationConfig.profile,
      status: "pending", validationState: "provisional", percentage: null, scores: [], strengths: [], weaknesses: [], recommendations: [], summary: "",
      competencyIds: [...exercise.competencyIds], difficulty: exercise.difficulty, helpLevel: exercise.helpLevel,
      rubric: structuredClone(project.evaluationConfig.rubric), rubricVersion: project.evaluationConfig.rubric.version,
      evidenceSnapshot: structuredClone(exercise), evidenceSignature: signature,
      requestedProviders: provider === "both" ? ["gemini", "cloudflare"] : [provider], reviews: [], errors: [], canonicalResult: null, resolutionHistory: [],
      createdAt: repository.clock().toISOString(), provenance: "user-submission" };
    state.evaluations.push(attempt);
    state.evaluationModelVersion = 2;
    return attempt;
  });
}

export async function recordManualAttempt(repository, exerciseId, input) {
  return repository.recordManualEvaluation(exerciseId, input, (evaluation, exercise, project, state) => {
    const signature = evidenceSignature(exercise, evaluation.rubric);
    const existing = state.evaluations.findLast((x) => x.attemptVersion === 2 && !x.legacy && x.provenance !== "external-import" && x.evidenceSignature === signature);
    const attempt = existing ? structuredClone(existing) : asAttempt(evaluation);
    if (existing) {
      if (existing.reviews.some((r) => r.source === "manual")) throw new Error("Esta entrega ya tiene una revisión manual. Edita la entrega para registrar un intento nuevo.");
      attempt.reviews.push(asAttempt(evaluation).reviews[0]);
      attempt.requestedProviders = [...new Set([...attempt.requestedProviders, "manual"])];
    }
    attempt.legacy = false;
    attempt.ruleSetId = RULE_SET;
    attempt.areaSetVersion = project.areaSetVersion || 1;
    attempt.evidenceSnapshot = structuredClone(exercise);
    attempt.evidenceSignature = evidenceSignature(attempt.evidenceSnapshot, attempt.rubric);
    attempt.status = "completed";
    attempt.validationState = "provisional";
    attempt.strengths = attempt.reviews.flatMap((review) => review.strengths || []);
    attempt.weaknesses = attempt.reviews.flatMap((review) => review.weaknesses || []);
    attempt.recommendations = [...new Set(attempt.reviews.flatMap((review) => review.recommendations || []))];
    if (attempt.requestedProviders.length === 1) {
      attempt.canonicalResult.source = "manual";
      attempt.canonicalResult.explanation = "Puntuación manual registrada por el usuario con la rúbrica indicada.";
    } else if (attempt.canonicalResult?.source !== "explicit_resolution") { attempt.canonicalResult = null; attempt.percentage = null; attempt.scores = []; }
    return attempt;
  });
}

export async function reviseExercise(repository, exerciseId, input) {
  if(repository.getState().exercises.find(x=>x.id===exerciseId)?.submissionVersions)throw new Error("Esta entrega conserva versiones compartidas. Usa Registrar otra versión en Plan para mantener evidencia y revisiones.");
  return repository.commit((state) => {
    const exercise = state.exercises.find((x) => x.id === exerciseId);
    if (!exercise) throw new Error("El ejercicio ya no existe.");
    if (state.evaluations.some((a) => a.targetId === exerciseId && a.status === "pending")) throw new Error("Cancela o recupera la evaluación pendiente antes de editar la entrega.");
    const title = String(input.title || "").trim().slice(0, 120);
    if (!title) throw new Error("Escribe un título para la entrega.");
    Object.assign(exercise, { title, code: String(input.code || "").slice(0, 30000), expectedResult: String(input.expectedResult || "").slice(0, 3000), actualResult: String(input.actualResult || "").slice(0, 3000),
      description: String(input.description || "").slice(0, 1200), objective: String(input.objective || "").slice(0, 600),
      difficulty: Math.max(1, Math.min(5, parseInt(input.difficulty, 10) || exercise.difficulty)), helpLevel: HELP_LEVELS.includes(input.helpLevel) ? input.helpLevel : exercise.helpLevel,
      independenceDeclared: input.independenceDeclared === true || input.independenceDeclared === "on",
      updatedAt: repository.clock().toISOString(), submissionVersion: (exercise.submissionVersion || 1) + 1 });
    return exercise;
  });
}

export async function verifyEvidence(repository, evidenceId, { method, actor, description, independenceVerified }) {
  if (!["identified_review", "automated_test"].includes(method) || !String(actor || "").trim() || !String(description || "").trim()) throw new Error("Indica método, responsable y resultado observable de la verificación.");
  return repository.commit((state) => {
    const evidence = state.evidence.find((x) => x.id === evidenceId);
    if (!evidence) throw new Error("La evidencia ya no existe.");
    const exercise = state.exercises.find((x) => x.id === evidence.targetId && x.projectId === evidence.projectId);
    const project = state.projects.find((x) => x.id === evidence.projectId);
    const verification = { status: "verified", method, actor: String(actor).trim().slice(0, 160), description: String(description).trim().slice(0, 3000),
      date: repository.clock().toISOString(), version: (evidence.verification?.version || 0) + 1,
      independenceVerified: method === "identified_review" && independenceVerified === true,
      evidenceSignature: exercise ? evidenceSignature(exercise, project.evaluationConfig.rubric) : null };
    evidence.verificationHistory = [...(evidence.verificationHistory || []), verification];
    evidence.verification = verification;
    return evidence;
  });
}

export async function reserveAttemptRequests(repository, attemptId, providers) {
  return repository.commit((state) => {
    const attempt = state.evaluations.find((x) => x.id === attemptId);
    const project = state.projects.find((x) => x.id === attempt?.projectId);
    if (!project || providers.some((p) => !attempt.requestedProviders.includes(p))) throw new Error("El intento no admite estos proveedores.");
    const today = toLocalDateKey(repository.clock());
    const used = state.aiRequests.filter((r) => r.projectId === project.id && toLocalDateKey(new Date(r.createdAt)) === today).length;
    if (used + providers.length > project.evaluationConfig.maxRequestsPerDay) throw new Error("Este envío superaría el límite diario del proyecto.");
    for (const provider of providers) state.aiRequests.push({ id: createId("ai-request"), projectId: attempt.projectId, evaluationId: attempt.id, provider,
      model: null, profile: attempt.profile, createdAt: repository.clock().toISOString(), latencyMs: null, inputTokens: null, outputTokens: null, status: "pending", error: null });
  });
}

export async function saveAttemptResponse(repository, attemptId, response) {
  return repository.commit((state) => {
    const attempt = state.evaluations.find((x) => x.id === attemptId && x.attemptVersion === 2);
    if (!attempt) throw new Error("El intento ya no existe.");
    for (const result of response.results || []) {
      if (!attempt.requestedProviders.includes(result.provider)) throw new Error("Proveedor inesperado en la respuesta.");
      if (attempt.reviews.some((x) => x.provider === result.provider)) continue;
      const scores = attempt.rubric.criteria.map((criterion) => {
        const score = result.scores?.find((x) => x.criterionId === criterion.id);
        if (!score || typeof score.score !== "number" || !Number.isFinite(score.score) || score.score < 0 || score.score > 4) throw new Error("El proveedor devolvió criterios incompletos o inválidos.");
        return { criterionId: criterion.id, score: score.score, justification: String(score.justification || "").slice(0, 1200) };
      });
      const review = { ...structuredClone(result), id: createId("review"), source: result.provider,
        original: structuredClone(result), scores, percentage: rubricPercentage(attempt.rubric.criteria, scores),
        rubric: structuredClone(attempt.rubric), rubricVersion: attempt.rubricVersion, promptVersion: response.promptVersion || "studyhub-evaluate-v1",
        receivedAt: repository.clock().toISOString(), evidenceSignature: attempt.evidenceSignature };
      attempt.reviews.push(review);
      const log = state.aiRequests.findLast((x) => x.evaluationId === attempt.id && x.provider === review.provider && x.status === "pending");
      const requestLog = { id: log?.id || createId("ai-request"), projectId: attempt.projectId, evaluationId: attempt.id, reviewId: review.id,
        provider: review.provider, model: review.model || null, profile: attempt.profile, createdAt: review.receivedAt,
        latencyMs: review.latencyMs ?? null, inputTokens: review.usage?.inputTokens ?? null, outputTokens: review.usage?.outputTokens ?? null,
        status: "completed", error: null };
      if (log) Object.assign(log, requestLog); else state.aiRequests.push(requestLog);
    }
    attempt.errors = [...new Map([...(attempt.errors || []), ...(response.errors || [])].map((error) => [error.provider, error])).values()].filter((x) => !attempt.reviews.some((r) => r.provider === x.provider));
    for (const error of attempt.errors) {
      const log = state.aiRequests.findLast((x) => x.evaluationId === attempt.id && x.provider === error.provider && x.status === "pending");
      if (log) { log.status = "failed"; log.error = String(error.message || "Solicitud fallida").slice(0, 1200); }
    }
    attempt.status = attempt.reviews.length ? "completed" : "failed";
    attempt.strengths = attempt.reviews.flatMap((x) => x.strengths || []);
    attempt.weaknesses = attempt.reviews.flatMap((x) => x.weaknesses || []);
    attempt.recommendations = [...new Set(attempt.reviews.flatMap((x) => x.recommendations || []))];
    if (attempt.requestedProviders.length === 1 && attempt.reviews.length === 1) {
      const review = attempt.reviews[0];
      attempt.canonicalResult = { percentage: review.percentage, scores: review.scores, source: "selected_provider", reviewId: review.id,
        actor: review.provider, resolvedAt: review.receivedAt, ruleSetId: RULE_SET, explanation: "Puntuación provisional del proveedor elegido; no valida dominio." };
      attempt.percentage = review.percentage; attempt.scores = review.scores; attempt.summary = review.summary || "";
    }
    return attempt;
  });
}

export async function resolveAttempt(repository, attemptId, { reviewId, explanation, actor = "Usuario" }) {
  if (!String(explanation || "").trim()) throw new Error("Explica por qué eliges este resultado.");
  return repository.commit((state) => {
    const attempt = state.evaluations.find((x) => x.id === attemptId);
    const review = attempt?.reviews?.find((x) => x.id === reviewId);
    if (!review) throw new Error("Selecciona una revisión disponible.");
    const resolution = { percentage: review.percentage, scores: structuredClone(review.scores), source: "explicit_resolution", reviewId,
      actor, explanation: String(explanation).trim().slice(0, 3000), resolvedAt: repository.clock().toISOString(), ruleSetId: RULE_SET };
    attempt.resolutionHistory.push(resolution); attempt.canonicalResult = resolution;
    attempt.percentage = resolution.percentage; attempt.scores = resolution.scores; attempt.summary = review.summary || "";
    attempt.validationState = "provisional";
    return attempt;
  });
}

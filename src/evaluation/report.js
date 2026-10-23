import { PROJECT_TYPE_LABELS, VALIDATION_LABELS } from "./constants.js";
import { deliverableProjectProgress, studyProjectProgress } from "./progress.js";

function periodContains(dateValue, range) {
  if (!range?.from && !range?.to) return true;
  const key = String(dateValue ?? "").slice(0, 10);
  return (!range.from || key >= range.from) && (!range.to || key <= range.to);
}

export function createEvaluationReport(state, projectId, options = {}, now = new Date()) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("El proyecto ya no existe.");
  const range = { from: options.from || null, to: options.to || null };
  const tasks = state.tasks.filter((item) => item.projectId === projectId);
  const sessions = state.focusSessions.filter((session) => tasks.some((task) => task.id === session.taskId) && periodContains(session.endedAt, range));
  const evaluations = (state.evaluations ?? []).filter((item) => item.projectId === projectId && periodContains(item.createdAt, range));
  const report = {
    schemaVersion: 1,
    kind: "studyhub-evaluation-report",
    exportedAt: now.toISOString(),
    period: range,
    partial: Boolean(range.to && range.to >= now.toISOString().slice(0, 10)),
    project: { id: project.id, name: project.name, description: project.description, type: project.projectType },
    settings: { privacy: project.evaluationConfig.privacy, rubric: project.evaluationConfig.rubric },
    dedication: { seconds: sessions.reduce((sum, item) => sum + item.durationSeconds, 0), sessions: sessions.length },
    tasks: tasks.map(({ id, title, status, category, dueDate, accumulatedSeconds }) => ({ id, title, status, category, dueDate, accumulatedSeconds })),
    competencies: (state.competencies ?? []).filter((item) => item.projectId === projectId),
    exercises: (state.exercises ?? []).filter((item) => item.projectId === projectId).map((item) => options.includeCode === false ? { ...item, code: "", files: [] } : item),
    evaluations,
    stages: (state.deliveryStages ?? []).filter((item) => item.projectId === projectId),
    deliverables: (state.deliverables ?? []).filter((item) => item.projectId === projectId),
    evidence: (state.evidence ?? []).filter((item) => item.projectId === projectId),
    aiUsage: (state.aiRequests ?? []).filter((item) => item.projectId === projectId && periodContains(item.createdAt, range)),
    progress: project.projectType === "deliverables" ? deliverableProjectProgress(state, projectId) : studyProjectProgress(state, projectId),
  };
  return report;
}

export function reportToMarkdown(report) {
  const p = report.project;
  const strengths = [...new Set(report.evaluations.flatMap((item) => item.strengths ?? []))];
  const weaknesses = [...new Set(report.evaluations.flatMap((item) => item.weaknesses ?? []))];
  const recommendations = [...new Set(report.evaluations.flatMap((item) => item.recommendations ?? []))];
  const lines = [
    `# Evaluación de ${p.name}`,
    "",
    `- Tipo: ${PROJECT_TYPE_LABELS[p.type] ?? p.type}`,
    `- Exportado: ${report.exportedAt}`,
    `- Periodo: ${report.period.from || "inicio"} a ${report.period.to || "actualidad"}${report.partial ? " (informe parcial)" : ""}`,
    `- Tiempo dedicado: ${Math.round(report.dedication.seconds / 60)} minutos en ${report.dedication.sessions} sesiones`,
    "",
    "## Competencias",
    "",
    ...(report.progress.competenceRows?.length ? report.progress.competenceRows.map((item) => `- ${item.name}: ${item.progress.percentage ?? "sin porcentaje"}${item.progress.level ? ` · ${item.progress.level}` : ""} · ${VALIDATION_LABELS[item.progress.validationState]}`) : ["Sin competencias registradas."]),
    "",
    "## Rúbrica y fórmula",
    "",
    `El porcentaje es la suma ponderada de (puntuación / 4) por criterio evaluado. No representa conocimiento absoluto. Rúbrica: ${report.settings.rubric.name}, versión ${report.settings.rubric.version}.`,
    ...report.settings.rubric.criteria.map((item) => `- ${item.name}: ${item.weight}%`),
    "",
    "## Ejercicios",
    "",
    ...(report.exercises.length ? report.exercises.map((item) => `- ${item.title} · dificultad ${item.difficulty}/5 · ${item.status}`) : ["Sin ejercicios registrados."]),
    "",
    "## Evaluaciones",
    "",
    ...(report.evaluations.length ? report.evaluations.map((item) => `### ${item.source} · ${item.createdAt}\n\n${item.percentage}% · ${item.validationState}\n\n${item.summary || "Sin resumen."}`) : ["Sin evaluaciones registradas."]),
    "",
    "## Entregables y bloqueos",
    "",
    ...(report.deliverables.length ? report.deliverables.map((item) => `- ${item.title}: ${item.status}${item.blockingReason ? ` · ${item.blockingReason}` : ""}`) : ["Sin entregables registrados."]),
    "",
    "## Evidencias",
    "",
    ...(report.evidence.length ? report.evidence.map((item) => `- ${item.title} · ${item.kind}${item.description ? ` · ${item.description}` : ""}`) : ["Sin evidencias registradas."]),
    "",
    "## Fortalezas, dificultades y próximos pasos",
    "",
    "### Fortalezas",
    ...(strengths.length ? strengths.map((item) => `- ${item}`) : ["- Sin fortalezas evaluadas."]),
    "",
    "### Debilidades o dificultades",
    ...(weaknesses.length ? weaknesses.map((item) => `- ${item}`) : ["- Sin debilidades evaluadas."]),
    "",
    "### Recomendaciones",
    ...(recommendations.length ? recommendations.map((item) => `- ${item}`) : ["- Sin recomendaciones evaluadas."]),
    "",
    "## Consumo de IA",
    "",
    ...(report.aiUsage.length ? report.aiUsage.map((item) => `- ${item.provider} / ${item.model}: ${item.status} · entrada ${item.inputTokens ?? "no reportada"} · salida ${item.outputTokens ?? "no reportada"} · ${item.latencyMs ?? "?"} ms`) : ["No se registró consumo de IA."]),
  ];
  return lines.join("\n");
}

export function validateExternalEvaluationReport(value) {
  if (!value || value.kind !== "studyhub-evaluation-report" || value.schemaVersion !== 1) throw new Error("El informe no usa un esquema compatible.");
  if (!value.project?.id || !Array.isArray(value.evaluations)) throw new Error("El informe no contiene un proyecto o evaluaciones válidas.");
  return value;
}

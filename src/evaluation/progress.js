import { LEVEL_LABELS } from "./constants.js";

export function rubricPercentage(criteria, scores) {
  const scoreMap = new Map((scores ?? []).map((score) => [score.criterionId, Number(score.score)]));
  const evaluated = (criteria ?? []).filter((criterion) => Number.isFinite(scoreMap.get(criterion.id)));
  if (!evaluated.length) return null;
  const totalWeight = evaluated.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0);
  if (totalWeight <= 0) return null;
  const weighted = evaluated.reduce((sum, criterion) => sum + (Math.max(0, Math.min(4, scoreMap.get(criterion.id))) / 4) * Number(criterion.weight || 0), 0);
  return Math.round((weighted / totalWeight) * 100);
}

export function levelFromPercentage(percentage, thresholds = [0, 20, 40, 60, 78, 90]) {
  if (!Number.isFinite(percentage)) return null;
  let index = 0;
  thresholds.forEach((threshold, candidate) => { if (percentage >= threshold) index = candidate; });
  return LEVEL_LABELS[Math.min(index, LEVEL_LABELS.length - 1)];
}

function hasIndependentEvidence(evaluations) {
  return evaluations.some((item) => item.difficulty >= 3 && ["none", "conceptual_hints"].includes(item.helpLevel) && item.percentage >= 60);
}

export function validationStateFor(evaluations, percentage) {
  if (!evaluations.length || percentage === null) return "unassessed";
  const independent = hasIndependentEvidence(evaluations);
  if (evaluations.length < 2 || !independent) return percentage >= 35 ? "provisional" : "insufficient";
  const distinctDates = new Set(evaluations.map((item) => String(item.createdAt).slice(0, 10))).size;
  const sufficientDifficulty = evaluations.some((item) => item.difficulty >= 4);
  if (evaluations.length >= 3 && distinctDates >= 2 && sufficientDifficulty && percentage >= 60) return "validated";
  return "provisional";
}

export function competencyProgress(state, competency) {
  const evaluations = (state.evaluations ?? [])
    .filter((item) => item.projectId === competency.projectId && item.status === "completed" && (item.competencyIds ?? []).includes(competency.id))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  if (!evaluations.length) return { percentage: null, level: null, validationState: "unassessed", evaluations: 0, lastEvaluatedAt: null, trend: null };
  const recent = evaluations.slice(-3);
  const percentage = Math.round(recent.reduce((sum, item) => sum + item.percentage, 0) / recent.length);
  const previous = evaluations.length > recent.length ? evaluations.slice(-6, -3) : [];
  const previousAverage = previous.length ? previous.reduce((sum, item) => sum + item.percentage, 0) / previous.length : null;
  const trend = previousAverage === null ? null : percentage - Math.round(previousAverage);
  return {
    percentage,
    level: levelFromPercentage(percentage, competency.thresholds),
    validationState: validationStateFor(evaluations, percentage),
    evaluations: evaluations.length,
    lastEvaluatedAt: evaluations.at(-1)?.createdAt ?? null,
    trend,
  };
}

export function studyProjectProgress(state, projectId) {
  const competencies = (state.competencies ?? []).filter((item) => item.projectId === projectId && !item.parentId);
  const allCompetencies = (state.competencies ?? []).filter((item) => item.projectId === projectId);
  const exercises = (state.exercises ?? []).filter((item) => item.projectId === projectId);
  const evaluations = (state.evaluations ?? []).filter((item) => item.projectId === projectId && item.status === "completed");
  const scored = evaluations.filter((item) => Number.isFinite(item.percentage));
  const competenceRows = allCompetencies.map((item) => ({ ...item, progress: competencyProgress(state, item) }));
  const covered = competenceRows.filter((item) => item.progress.evaluations > 0).length;
  const validated = competenceRows.filter((item) => item.progress.validationState === "validated");
  const independentExercises = exercises.filter((item) => ["none", "conceptual_hints"].includes(item.helpLevel) && item.status === "completed").length;
  const totalSeconds = state.tasks.filter((task) => task.projectId === projectId).reduce((sum, task) => sum + task.accumulatedSeconds, 0);
  const overall = validated.length >= 2
    ? Math.round(validated.reduce((sum, item) => sum + item.progress.percentage, 0) / validated.length)
    : null;
  return {
    competencies,
    competenceRows,
    exercises,
    evaluations,
    totalSeconds,
    independentExercises,
    coverage: allCompetencies.length ? Math.round((covered / allCompetencies.length) * 100) : null,
    averageEvaluated: scored.length ? Math.round(scored.reduce((sum, item) => sum + item.percentage, 0) / scored.length) : null,
    overall,
    overallLevel: overall === null ? null : levelFromPercentage(overall),
  };
}

export function deliverableProjectProgress(state, projectId) {
  const stages = (state.deliveryStages ?? []).filter((item) => item.projectId === projectId).sort((a, b) => a.order - b.order);
  const deliverables = (state.deliverables ?? []).filter((item) => item.projectId === projectId);
  const stageRows = stages.map((stage) => {
    const items = deliverables.filter((item) => item.stageId === stage.id);
    const weighted = items.length && items.every((item) => Number.isFinite(item.weight));
    const completedValue = (item) => item.status === "verified" ? 1 : item.status === "completed_unverified" ? 0.75 : item.status === "in_progress" ? 0.35 : 0;
    const progress = !items.length ? null : weighted
      ? Math.round((items.reduce((sum, item) => sum + completedValue(item) * item.weight, 0) / items.reduce((sum, item) => sum + item.weight, 0)) * 100)
      : null;
    return { ...stage, items, progress, weighted };
  });
  return {
    stages: stageRows,
    deliverables,
    verified: deliverables.filter((item) => item.status === "verified").length,
    completedUnverified: deliverables.filter((item) => item.status === "completed_unverified").length,
    blocked: deliverables.filter((item) => item.status === "blocked").length,
    pending: deliverables.filter((item) => ["pending", "in_progress"].includes(item.status)).length,
  };
}

export function projectProgress(state, projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  return project?.projectType === "deliverables" ? deliverableProjectProgress(state, projectId) : studyProjectProgress(state, projectId);
}

export function currentWeekSummary(state, projectId, now = new Date()) {
  const cursor = new Date(now);
  const mondayOffset = (cursor.getDay() + 6) % 7;
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - mondayOffset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const inWeek = (value) => {
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
  };
  const taskIds = new Set(state.tasks.filter((item) => item.projectId === projectId).map((item) => item.id));
  const sessions = state.focusSessions.filter((item) => taskIds.has(item.taskId) && inWeek(item.endedAt));
  const evaluations = (state.evaluations ?? []).filter((item) => item.projectId === projectId && item.status === "completed" && inWeek(item.createdAt));
  const deliverables = (state.deliverables ?? []).filter((item) => item.projectId === projectId && inWeek(item.updatedAt || item.createdAt));
  const dateKey = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  return {
    start: dateKey(start),
    end: dateKey(new Date(end.getTime() - 1)),
    seconds: sessions.reduce((sum, item) => sum + item.durationSeconds, 0),
    sessions: sessions.length,
    evaluations: evaluations.length,
    competencies: new Set(evaluations.flatMap((item) => item.competencyIds ?? [])).size,
    verifiedDeliverables: deliverables.filter((item) => item.status === "verified").length,
    blockedDeliverables: deliverables.filter((item) => item.status === "blocked").length,
  };
}

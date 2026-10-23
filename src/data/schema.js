import { addDaysKey, parseLocalDate, toLocalDateKey } from "../utils/time.js";
import { MAX_LEARNING_IMAGES, isLearningImageDataUrl, normalizeLearningImages } from "../utils/learningImages.js";
import { AI_PROFILES, AI_PROVIDERS, DEFAULT_RUBRIC, DELIVERABLE_STATUSES, HELP_LEVELS, PRIVACY_MODES, PROJECT_TYPES, VALIDATION_STATES, defaultEvaluationConfig } from "../evaluation/constants.js";

export const SCHEMA_VERSION = 2;
export const TASK_STATUSES = ["pending", "in_progress", "completed"];
export const PROJECT_STATUSES = ["active", "completed"];
export const TIMER_MODES = ["countdown", "infinite"];
export const PROJECT_ICONS = ["graduation", "code", "calculator", "book", "bulb", "activity", "folder", "brain"];
export const PROJECT_COLORS = ["#f34fa5", "#7657ff", "#31d98b", "#ff7b45", "#2587ff", "#ff5769", "#ffc13d", "#2bd5cf"];

export function createEmptyState(now = new Date()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    updatedAt: now.toISOString(),
    settings: {
      focusDurationSeconds: 1500,
      timerMode: "countdown",
      profileName: "Estudiante",
      seededDemo: false,
    },
    projects: [],
    tasks: [],
    focusSessions: [],
    learningEntries: [],
    competencies: [],
    exercises: [],
    evidence: [],
    evaluations: [],
    deliveryStages: [],
    deliverables: [],
    aiRequests: [],
    weeklyReviews: [],
    activeTimer: null,
    pendingCompletion: null,
  };
}

export function createDemoState(now = new Date()) {
  const state = createEmptyState(now);
  state.settings.seededDemo = true;
  state.projects = [
    { id: "project-programming", name: "Estudios de programación", description: "JavaScript, lógica, práctica y proyectos personales.", icon: "code", color: "#7657ff", createdAt: now.toISOString() },
    { id: "project-university", name: "Tareas de la universidad", description: "Trabajos y entregas del semestre.", icon: "graduation", color: "#f34fa5", createdAt: new Date(now.getTime() - 5 * 86_400_000).toISOString() },
    { id: "project-calculus", name: "Estudios de cálculo", description: "Límites, derivadas e integrales.", icon: "calculator", color: "#31d98b", createdAt: new Date(now.getTime() - 9 * 86_400_000).toISOString() },
    { id: "project-english", name: "Estudios de inglés", description: "Vocabulario y práctica semanal.", icon: "book", color: "#ff7b45", createdAt: new Date(now.getTime() - 14 * 86_400_000).toISOString() },
  ].map((project) => ({ ...project, status: "active", completedAt: null, projectType: "general", evaluationConfig: defaultEvaluationConfig() }));
  state.tasks = [
    { id: "task-workshop", projectId: "project-programming", title: "Resolver taller 2", description: "Ejercicios de funciones y arrays", status: "in_progress", dueDate: addDaysKey(1, now), accumulatedSeconds: 0, createdAt: now.toISOString(), completedAt: null },
    { id: "task-arrays", projectId: "project-programming", title: "Ver video de arrays", description: "Tomar apuntes sobre métodos principales", status: "pending", dueDate: null, accumulatedSeconds: 0, createdAt: now.toISOString(), completedAt: null },
    { id: "task-exercises", projectId: "project-programming", title: "Practicar ejercicios", description: "Resolver diez ejercicios sin consultar notas", status: "pending", dueDate: addDaysKey(4, now), accumulatedSeconds: 0, createdAt: now.toISOString(), completedAt: null },
    { id: "task-project", projectId: "project-programming", title: "Crear mini proyecto", description: "Aplicar lo aprendido en una herramienta pequeña", status: "pending", dueDate: addDaysKey(12, now), accumulatedSeconds: 0, createdAt: now.toISOString(), completedAt: null },
    { id: "task-functions", projectId: "project-programming", title: "Repasar funciones", description: "Declaraciones, expresiones y alcance", status: "completed", dueDate: addDaysKey(-2, now), accumulatedSeconds: 5400, createdAt: now.toISOString(), completedAt: now.toISOString() },
    { id: "task-essay", projectId: "project-university", title: "Preparar ensayo", description: "Organizar fuentes y primer borrador", status: "pending", dueDate: addDaysKey(7, now), accumulatedSeconds: 0, createdAt: now.toISOString(), completedAt: null },
    { id: "task-derivatives", projectId: "project-calculus", title: "Guía de derivadas", description: "Completar los ejercicios impares", status: "in_progress", dueDate: addDaysKey(3, now), accumulatedSeconds: 2100, createdAt: now.toISOString(), completedAt: null },
    { id: "task-speaking", projectId: "project-english", title: "Práctica de conversación", description: "Preparar cinco preguntas abiertas", status: "completed", dueDate: null, accumulatedSeconds: 1800, createdAt: now.toISOString(), completedAt: now.toISOString() },
  ];
  state.focusSessions = [
    { id: "session-functions", taskId: "task-functions", startedAt: new Date(now.getTime() - 2 * 86_400_000 - 5_400_000).toISOString(), endedAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(), durationSeconds: 5400, reason: "completed" },
  ];
  state.learningEntries = [
    { id: "learning-functions", projectId: "project-programming", taskId: "task-functions", focusSessionId: "session-functions", date: addDaysKey(-2, now), createdAt: new Date(now.getTime() - 2 * 86_400_000).toISOString(), learned: "Cómo declarar funciones y pasar parámetros.", unresolved: "Cuándo conviene usar una función flecha.", nextSession: "Comparar distintos tipos de funciones con ejercicios." },
  ];
  return state;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isTimeKey(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isSafeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}

export function validateState(candidate) {
  assert(candidate && typeof candidate === "object", "La copia no contiene datos válidos.");
  assert(candidate.schemaVersion === SCHEMA_VERSION, `Versión de datos no compatible (${candidate.schemaVersion ?? "desconocida"}).`);
  assert(Array.isArray(candidate.projects) && Array.isArray(candidate.tasks), "Faltan proyectos o tareas.");
  assert(Array.isArray(candidate.focusSessions) && Array.isArray(candidate.learningEntries), "Faltan sesiones o registros de aprendizaje.");
  for (const collection of ["competencies", "exercises", "evidence", "evaluations", "deliveryStages", "deliverables", "aiRequests", "weeklyReviews"]) {
    assert(Array.isArray(candidate[collection]), `Falta la colección ${collection}.`);
  }
  assert(candidate.settings && typeof candidate.settings === "object", "Falta la configuración.");
  assert(Number.isSafeInteger(candidate.settings.focusDurationSeconds) && candidate.settings.focusDurationSeconds >= 60, "La duración configurada no es válida.");
  assert(candidate.settings.timerMode === undefined || TIMER_MODES.includes(candidate.settings.timerMode), "El modo del temporizador no es válido.");

  const projectIds = new Set();
  for (const project of candidate.projects) {
    assert(project && isSafeId(project.id) && !projectIds.has(project.id), "Hay proyectos con identificadores inválidos o duplicados.");
    projectIds.add(project.id);
    assert(typeof project.name === "string" && project.name.trim().length > 0, "Hay un proyecto sin nombre.");
    assert(PROJECT_ICONS.includes(project.icon), "Hay un icono de proyecto no compatible.");
    assert(/^#[0-9a-f]{6}$/i.test(project.color), "Hay un color de proyecto inválido.");
    assert(isIsoTimestamp(project.createdAt), "Hay una fecha de proyecto inválida.");
    assert(PROJECT_STATUSES.includes(project.status), "Hay un estado de proyecto inválido.");
    assert(project.completedAt === null || isIsoTimestamp(project.completedAt), "Hay una fecha de finalización de proyecto inválida.");
    assert(project.status === "completed" ? project.completedAt !== null : project.completedAt === null, "El estado del proyecto no coincide con su fecha de finalización.");
    assert(PROJECT_TYPES.includes(project.projectType), "Hay un tipo de proyecto inválido.");
    assert(PRIVACY_MODES.includes(project.evaluationConfig?.privacy), "Hay una privacidad de evaluación inválida.");
    assert(AI_PROVIDERS.includes(project.evaluationConfig?.provider), "Hay un proveedor de evaluación inválido.");
    assert(AI_PROFILES.includes(project.evaluationConfig?.profile), "Hay un perfil de evaluación inválido.");
    const criteria = project.evaluationConfig?.rubric?.criteria;
    assert(Array.isArray(criteria) && criteria.length > 0, "Hay una rúbrica inválida.");
    assert(criteria.every((item) => isSafeId(item.id) && item.name && Number.isFinite(item.weight) && item.weight >= 0), "Hay criterios de rúbrica inválidos.");
    assert(Math.round(criteria.reduce((sum, item) => sum + item.weight, 0)) === 100, "Los pesos de la rúbrica deben sumar 100.");
  }

  const taskIds = new Set();
  for (const task of candidate.tasks) {
    assert(task && isSafeId(task.id) && !taskIds.has(task.id), "Hay tareas con identificadores inválidos o duplicados.");
    taskIds.add(task.id);
    assert(projectIds.has(task.projectId), "Hay una tarea sin proyecto válido.");
    assert(typeof task.title === "string" && task.title.trim().length > 0, "Hay una tarea sin nombre.");
    assert(task.category === undefined || (typeof task.category === "string" && task.category.length <= 60), "Hay una categoría de tarea inválida.");
    assert(TASK_STATUSES.includes(task.status), "Hay un estado de tarea inválido.");
    assert(task.dueDate === null || Boolean(parseLocalDate(task.dueDate)), "Hay una fecha límite inválida.");
    assert(task.dueTime === undefined || task.dueTime === null || isTimeKey(task.dueTime), "Hay una hora límite inválida.");
    assert(!task.dueTime || task.dueDate !== null, "La hora límite necesita una fecha.");
    assert(Number.isInteger(task.accumulatedSeconds) && task.accumulatedSeconds >= 0, "Hay tiempo acumulado inválido.");
    if (task.recurrence !== undefined && task.recurrence !== null) {
      assert(task.recurrence.frequency === "daily", "Hay una repetición de tarea no compatible.");
      assert(Boolean(parseLocalDate(task.recurrence.startDate)), "La tarea repetitiva necesita una fecha inicial válida.");
      assert(task.recurrence.endDate === null || Boolean(parseLocalDate(task.recurrence.endDate)), "La fecha final de repetición no es válida.");
      assert(!task.recurrence.endDate || task.recurrence.endDate >= task.recurrence.startDate, "La repetición termina antes de comenzar.");
      assert(Array.isArray(task.recurrence.completedDates), "Faltan los días completados de una tarea repetitiva.");
      const completedDates = new Set();
      for (const date of task.recurrence.completedDates) {
        assert(Boolean(parseLocalDate(date)) && !completedDates.has(date), "Hay días repetidos o inválidos en una tarea repetitiva.");
        assert(date >= task.recurrence.startDate && (!task.recurrence.endDate || date <= task.recurrence.endDate), "Hay un día completado fuera del periodo de repetición.");
        completedDates.add(date);
      }
    }
  }

  const sessionIds = new Set();
  const sessionsById = new Map();
  for (const session of candidate.focusSessions) {
    assert(session && isSafeId(session.id) && !sessionIds.has(session.id), "Hay sesiones con identificadores inválidos o duplicados.");
    sessionIds.add(session.id);
    sessionsById.set(session.id, session);
    assert(taskIds.has(session.taskId), "Hay una sesión sin tarea válida.");
    assert(Number.isInteger(session.durationSeconds) && session.durationSeconds > 0, "Hay una sesión con duración inválida.");
    assert(session.learningEntryDeleted === undefined || typeof session.learningEntryDeleted === "boolean", "Hay una marca de aprendizaje eliminado inválida.");
  }

  const learningIds = new Set();
  const reflectedSessionIds = new Set();
  for (const entry of candidate.learningEntries) {
    assert(entry && isSafeId(entry.id) && !learningIds.has(entry.id), "Hay registros de aprendizaje con identificadores inválidos o duplicados.");
    learningIds.add(entry.id);
    const task = candidate.tasks.find((item) => item.id === entry.taskId);
    assert(projectIds.has(entry.projectId) && task && task.projectId === entry.projectId, "Hay un registro sin proyecto o tarea válida.");
    if (entry.focusSessionId !== null) {
      const session = sessionsById.get(entry.focusSessionId);
      assert(session?.taskId === entry.taskId, "Hay un registro con una sesión inválida.");
      assert(!reflectedSessionIds.has(entry.focusSessionId), "Una sesión no puede tener más de una reflexión.");
      reflectedSessionIds.add(entry.focusSessionId);
    }
    assert(Boolean(parseLocalDate(entry.date)), "Hay un registro con fecha inválida.");
    assert(entry.createdAt === undefined || isIsoTimestamp(entry.createdAt), "Hay un registro con fecha de creación inválida.");
    if (entry.learnedImages !== undefined) {
      assert(Array.isArray(entry.learnedImages) && entry.learnedImages.length <= MAX_LEARNING_IMAGES, "Hay demasiadas imágenes en una reflexión.");
      const imageIds = new Set();
      for (const image of entry.learnedImages) {
        assert(image && isSafeId(image.id) && !imageIds.has(image.id), "Hay imágenes de reflexión inválidas o duplicadas.");
        imageIds.add(image.id);
        assert(isLearningImageDataUrl(image.dataUrl), "Hay una imagen de reflexión no compatible.");
      }
    }
  }

  if (candidate.activeTimer) {
    assert(isSafeId(candidate.activeTimer.sessionId), "El cronómetro contiene un identificador inválido.");
    assert(!sessionIds.has(candidate.activeTimer.sessionId), "El cronómetro duplica una sesión ya guardada.");
    assert(taskIds.has(candidate.activeTimer.taskId), "El cronómetro pertenece a una tarea inexistente.");
    assert(["running", "paused"].includes(candidate.activeTimer.phase), "El cronómetro tiene un estado inválido.");
    assert(Number.isInteger(candidate.activeTimer.elapsedSeconds) && candidate.activeTimer.elapsedSeconds >= 0, "El cronómetro tiene tiempo inválido.");
    assert(candidate.activeTimer.targetSeconds === null || (Number.isSafeInteger(candidate.activeTimer.targetSeconds) && candidate.activeTimer.targetSeconds >= 60), "El cronómetro tiene una duración inválida.");
    assert(isIsoTimestamp(candidate.activeTimer.sessionStartedAt), "El cronómetro tiene una fecha de inicio inválida.");
    if (candidate.activeTimer.phase === "running") assert(isIsoTimestamp(candidate.activeTimer.lastResumedAt), "El cronómetro activo no puede reconstruirse.");
    if (candidate.activeTimer.phase === "paused") assert(candidate.activeTimer.lastResumedAt === null, "El cronómetro pausado contiene una marca activa.");
  }
  if (candidate.pendingCompletion) {
    if (candidate.activeTimer) {
      assert(
        (candidate.pendingCompletion.kind ?? "completion") === "completion"
          && candidate.activeTimer.phase === "paused"
          && candidate.activeTimer.taskId !== candidate.pendingCompletion.taskId,
        "La reflexión pendiente no puede pertenecer a la sesión activa.",
      );
    }
    assert(taskIds.has(candidate.pendingCompletion.taskId), "La reflexión pendiente pertenece a una tarea inexistente.");
    const pendingSession = candidate.pendingCompletion.focusSessionId === null ? null : sessionsById.get(candidate.pendingCompletion.focusSessionId);
    assert(candidate.pendingCompletion.focusSessionId === null || pendingSession?.taskId === candidate.pendingCompletion.taskId, "La reflexión pendiente contiene una sesión inválida.");
    assert(!candidate.pendingCompletion.focusSessionId || !reflectedSessionIds.has(candidate.pendingCompletion.focusSessionId), "La sesión pendiente ya tiene una reflexión.");
    assert(candidate.pendingCompletion.kind === undefined || ["session", "completion"].includes(candidate.pendingCompletion.kind), "La reflexión pendiente contiene un tipo inválido.");
    assert(candidate.pendingCompletion.occurrenceDate === undefined || Boolean(parseLocalDate(candidate.pendingCompletion.occurrenceDate)), "La reflexión pendiente contiene un día de repetición inválido.");
    if (candidate.pendingCompletion.kind === "session") assert(candidate.pendingCompletion.focusSessionId !== null, "La reflexión de sesión necesita una sesión guardada.");
    assert(isIsoTimestamp(candidate.pendingCompletion.openedAt), "La reflexión pendiente contiene una fecha inválida.");
  }

  const competencyIds = new Set();
  for (const item of candidate.competencies) {
    assert(isSafeId(item.id) && !competencyIds.has(item.id) && projectIds.has(item.projectId), "Hay competencias inválidas o duplicadas.");
    competencyIds.add(item.id);
    assert(typeof item.name === "string" && item.name.trim(), "Hay una competencia sin nombre.");
  }
  for (const item of candidate.competencies) assert(item.parentId === null || competencyIds.has(item.parentId), "Hay una subcompetencia sin competencia principal.");

  const exerciseIds = new Set();
  for (const item of candidate.exercises) {
    assert(isSafeId(item.id) && !exerciseIds.has(item.id) && projectIds.has(item.projectId), "Hay ejercicios inválidos o duplicados.");
    exerciseIds.add(item.id);
    assert(item.title && Number.isInteger(item.difficulty) && item.difficulty >= 1 && item.difficulty <= 5, "Hay un ejercicio sin título o dificultad válida.");
    assert(HELP_LEVELS.includes(item.helpLevel), "Hay un nivel de ayuda inválido.");
    assert(item.competencyIds.every((id) => competencyIds.has(id)), "Hay un ejercicio con competencias inválidas.");
  }

  const evidenceIds = new Set();
  for (const item of candidate.evidence) {
    assert(isSafeId(item.id) && !evidenceIds.has(item.id) && projectIds.has(item.projectId), "Hay evidencias inválidas o duplicadas.");
    evidenceIds.add(item.id);
    assert(["project", "exercise", "deliverable"].includes(item.targetType) && item.title, "Hay una evidencia sin destino o título válido.");
    assert(["reported", "attached", "test_passed", "external_verified"].includes(item.kind), "Hay un tipo de evidencia inválido.");
    assert(item.competencyIds.every((id) => competencyIds.has(id)), "Hay una evidencia con competencias inválidas.");
    if (item.targetType === "exercise") assert(exerciseIds.has(item.targetId), "Hay una evidencia asociada a un ejercicio inexistente.");
  }

  const stageIds = new Set();
  for (const item of candidate.deliveryStages) {
    assert(isSafeId(item.id) && !stageIds.has(item.id) && projectIds.has(item.projectId) && item.title, "Hay etapas inválidas o duplicadas.");
    stageIds.add(item.id);
  }
  const deliverableIds = new Set();
  for (const item of candidate.deliverables) {
    assert(isSafeId(item.id) && !deliverableIds.has(item.id) && projectIds.has(item.projectId) && stageIds.has(item.stageId), "Hay entregables inválidos o duplicados.");
    deliverableIds.add(item.id);
    assert(DELIVERABLE_STATUSES.includes(item.status), "Hay un estado de entregable inválido.");
  }
  for (const item of candidate.deliverables) assert(item.dependencyIds.every((id) => deliverableIds.has(id) && id !== item.id), "Hay una dependencia de entregable inválida.");
  for (const item of candidate.evidence) {
    if (item.targetType === "deliverable") assert(deliverableIds.has(item.targetId), "Hay una evidencia asociada a un entregable inexistente.");
  }

  const evaluationIds = new Set();
  for (const item of candidate.evaluations) {
    assert(isSafeId(item.id) && !evaluationIds.has(item.id) && projectIds.has(item.projectId), "Hay evaluaciones inválidas o duplicadas.");
    evaluationIds.add(item.id);
    assert(["pending", "completed", "failed"].includes(item.status), "Hay una evaluación con estado inválido.");
    assert(VALIDATION_STATES.includes(item.validationState), "Hay una validación de nivel inválida.");
    assert(item.percentage === null || (Number.isFinite(item.percentage) && item.percentage >= 0 && item.percentage <= 100), "Hay un porcentaje de evaluación inválido.");
    assert(item.competencyIds.every((id) => competencyIds.has(id)), "Hay una evaluación con competencias inválidas.");
  }
  return candidate;
}

export function normalizeState(candidate) {
  const state = structuredClone(candidate);
  if (![1, SCHEMA_VERSION].includes(state.schemaVersion)) throw new Error(`Versión de datos no compatible (${state.schemaVersion ?? "desconocida"}).`);
  state.schemaVersion = SCHEMA_VERSION;
  state.revision = Number.isInteger(state.revision) ? state.revision : 0;
  state.updatedAt = isIsoTimestamp(state.updatedAt) ? state.updatedAt : new Date().toISOString();
  const configuredDuration = Number.parseInt(state.settings.focusDurationSeconds, 10);
  state.settings.focusDurationSeconds = Number.isSafeInteger(configuredDuration) && configuredDuration >= 60 ? configuredDuration : 1500;
  state.settings.timerMode = TIMER_MODES.includes(state.settings.timerMode) ? state.settings.timerMode : "countdown";
  state.settings.profileName = String(state.settings.profileName || "Estudiante").slice(0, 60);
  state.settings.seededDemo = Boolean(state.settings.seededDemo);
  state.projects = state.projects.map((project) => {
    const status = project.status === "completed" ? "completed" : "active";
    const defaults = defaultEvaluationConfig();
    const config = project.evaluationConfig ?? {};
    const rubric = config.rubric?.criteria?.length ? config.rubric : defaults.rubric;
    return {
      ...project,
      description: String(project.description ?? "").slice(0, 300),
      status,
      completedAt: status === "completed"
        ? (isIsoTimestamp(project.completedAt) ? project.completedAt : project.createdAt)
        : null,
      projectType: PROJECT_TYPES.includes(project.projectType) ? project.projectType : "general",
      evaluationConfig: {
        ...defaults,
        ...config,
        privacy: PRIVACY_MODES.includes(config.privacy) ? config.privacy : defaults.privacy,
        provider: AI_PROVIDERS.includes(config.provider) ? config.provider : defaults.provider,
        profile: AI_PROFILES.includes(config.profile) ? config.profile : defaults.profile,
        maxRequestsPerDay: Math.max(1, Math.min(100, Number.parseInt(config.maxRequestsPerDay, 10) || defaults.maxRequestsPerDay)),
        geminiModel: String(config.geminiModel || defaults.geminiModel).slice(0, 100),
        cloudflareModel: String(config.cloudflareModel || defaults.cloudflareModel).slice(0, 120),
        rubric: {
          id: String(rubric.id || DEFAULT_RUBRIC.id).slice(0, 128),
          version: Math.max(1, Number.parseInt(rubric.version, 10) || 1),
          name: String(rubric.name || DEFAULT_RUBRIC.name).slice(0, 120),
          thresholds: Array.isArray(rubric.thresholds) && rubric.thresholds.length === 6 ? rubric.thresholds.map(Number) : [...DEFAULT_RUBRIC.thresholds],
          criteria: rubric.criteria.map((item, index) => ({ id: String(item.id || `criterion-${index + 1}`).slice(0, 128), name: String(item.name || "Criterio").slice(0, 100), weight: Number(item.weight), descriptions: Array.isArray(item.descriptions) ? item.descriptions.slice(0, 5).map((value) => String(value).slice(0, 300)) : [] })),
        },
      },
    };
  });
  state.tasks = state.tasks.map((task) => {
    const dueDate = task.dueDate || null;
    const dueTime = dueDate && isTimeKey(task.dueTime) ? task.dueTime : null;
    const recurrence = task.recurrence?.frequency === "daily" && parseLocalDate(task.recurrence.startDate)
      ? {
          frequency: "daily",
          startDate: task.recurrence.startDate,
          endDate: parseLocalDate(task.recurrence.endDate) && task.recurrence.endDate >= task.recurrence.startDate ? task.recurrence.endDate : null,
          completedDates: [...new Set((Array.isArray(task.recurrence.completedDates) ? task.recurrence.completedDates : []).filter((date) => parseLocalDate(date) && date >= task.recurrence.startDate && (!task.recurrence.endDate || date <= task.recurrence.endDate)))].sort(),
        }
      : null;
    return { ...task, description: String(task.description ?? "").slice(0, 500), category: String(task.category ?? "").slice(0, 60), dueDate: recurrence ? null : dueDate, dueTime: recurrence ? null : dueTime, recurrence, completedAt: task.completedAt || null };
  });
  state.focusSessions = state.focusSessions.map((session) => {
    const normalized = { ...session, reason: String(session.reason || "stopped") };
    if (session.learningEntryDeleted === true) normalized.learningEntryDeleted = true;
    else delete normalized.learningEntryDeleted;
    return normalized;
  });
  state.learningEntries = state.learningEntries.map((entry) => {
    const session = state.focusSessions.find((item) => item.id === entry.focusSessionId);
    return {
      ...entry,
      learned: String(entry.learned ?? "").slice(0, 1200),
      unresolved: String(entry.unresolved ?? "").slice(0, 1200),
      nextSession: String(entry.nextSession ?? "").slice(0, 1200),
      learnedImages: normalizeLearningImages(entry.learnedImages),
      focusSessionId: entry.focusSessionId || null,
      createdAt: isIsoTimestamp(entry.createdAt) ? entry.createdAt : session?.endedAt ?? `${entry.date}T12:00:00.000Z`,
    };
  });
  state.pendingCompletion = state.pendingCompletion
    ? { ...state.pendingCompletion, kind: ["session", "completion"].includes(state.pendingCompletion.kind) ? state.pendingCompletion.kind : "completion" }
    : null;
  state.competencies = (Array.isArray(state.competencies) ? state.competencies : []).map((item) => ({ ...item, parentId: item.parentId || null, name: String(item.name || "").slice(0, 100), description: String(item.description || "").slice(0, 500), objectives: Array.isArray(item.objectives) ? item.objectives.map(String).slice(0, 20) : [], dependencies: Array.isArray(item.dependencies) ? item.dependencies.filter(Boolean) : [], resources: Array.isArray(item.resources) ? item.resources.slice(0, 30) : [] }));
  state.exercises = (Array.isArray(state.exercises) ? state.exercises : []).map((item) => ({ ...item, title: String(item.title || "").slice(0, 120), description: String(item.description || "").slice(0, 1200), objective: String(item.objective || "").slice(0, 600), difficulty: Math.max(1, Math.min(5, Number.parseInt(item.difficulty, 10) || 1)), competencyIds: Array.isArray(item.competencyIds) ? [...new Set(item.competencyIds)] : [], code: String(item.code || "").slice(0, 30000), expectedResult: String(item.expectedResult || "").slice(0, 3000), actualResult: String(item.actualResult || "").slice(0, 3000), helpLevel: HELP_LEVELS.includes(item.helpLevel) ? item.helpLevel : "unverified_help", independenceDeclared: Boolean(item.independenceDeclared), independenceVerified: item.independenceVerified === true, status: ["draft", "completed", "verified"].includes(item.status) ? item.status : "draft", tests: item.tests && typeof item.tests === "object" ? item.tests : { status: "not_run", passed: 0, total: 0, summary: "" }, files: Array.isArray(item.files) ? item.files : [] }));
  state.evidence = (Array.isArray(state.evidence) ? state.evidence : []).map((item) => ({ ...item, targetType: ["project", "exercise", "deliverable"].includes(item.targetType) ? item.targetType : "project", targetId: String(item.targetId || item.projectId), title: String(item.title || "").slice(0, 160), description: String(item.description || "").slice(0, 2000), kind: ["reported", "attached", "test_passed", "external_verified"].includes(item.kind) ? item.kind : "reported", competencyIds: Array.isArray(item.competencyIds) ? [...new Set(item.competencyIds)] : [] }));
  state.evaluations = (Array.isArray(state.evaluations) ? state.evaluations : []).map((item) => ({ ...item, competencyIds: Array.isArray(item.competencyIds) ? [...new Set(item.competencyIds)] : [], scores: Array.isArray(item.scores) ? item.scores : [], percentage: Number.isFinite(item.percentage) ? Math.max(0, Math.min(100, item.percentage)) : null, validationState: VALIDATION_STATES.includes(item.validationState) ? item.validationState : "insufficient", strengths: Array.isArray(item.strengths) ? item.strengths.map(String) : [], weaknesses: Array.isArray(item.weaknesses) ? item.weaknesses.map(String) : [], recommendations: Array.isArray(item.recommendations) ? item.recommendations.map(String) : [] }));
  state.deliveryStages = (Array.isArray(state.deliveryStages) ? state.deliveryStages : []).map((item, index) => ({ ...item, title: String(item.title || "").slice(0, 120), description: String(item.description || "").slice(0, 800), order: Number.isInteger(item.order) ? item.order : index }));
  state.deliverables = (Array.isArray(state.deliverables) ? state.deliverables : []).map((item) => ({ ...item, title: String(item.title || "").slice(0, 160), description: String(item.description || "").slice(0, 1200), status: DELIVERABLE_STATUSES.includes(item.status) ? item.status : "pending", dependencyIds: Array.isArray(item.dependencyIds) ? [...new Set(item.dependencyIds)] : [], blockingReason: String(item.blockingReason || "").slice(0, 800), weight: Number.isFinite(item.weight) && item.weight > 0 ? item.weight : null, dueDate: item.dueDate || null, verifiedAt: item.status === "verified" && isIsoTimestamp(item.verifiedAt) ? item.verifiedAt : null }));
  state.aiRequests = Array.isArray(state.aiRequests) ? state.aiRequests : [];
  state.weeklyReviews = Array.isArray(state.weeklyReviews) ? state.weeklyReviews : [];
  validateState(state);
  return state;
}

export function prepareImportedState(candidate, now = new Date()) {
  const state = normalizeState(candidate);
  state.revision += 1;
  state.updatedAt = now.toISOString();
  if (state.activeTimer?.phase === "running") {
    const resumedAt = new Date(state.activeTimer.lastResumedAt).getTime();
    const elapsedSince = Number.isFinite(resumedAt) ? Math.max(0, Math.floor((now.getTime() - resumedAt) / 1000)) : 0;
    state.activeTimer.elapsedSeconds += elapsedSince;
    state.activeTimer.phase = "paused";
    state.activeTimer.lastResumedAt = null;
  }
  return state;
}

export function createExportEnvelope(state, now = new Date()) {
  const snapshot = structuredClone(state);
  if (snapshot.activeTimer?.phase === "running") {
    const resumedAt = new Date(snapshot.activeTimer.lastResumedAt).getTime();
    snapshot.activeTimer.elapsedSeconds += Number.isFinite(resumedAt) ? Math.max(0, Math.floor((now.getTime() - resumedAt) / 1000)) : 0;
    snapshot.activeTimer.phase = "paused";
    snapshot.activeTimer.lastResumedAt = null;
  }
  return { app: "StudyHub", schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), data: snapshot };
}

export function assertBackupEnvelope(envelope) {
  assert(envelope?.app === "StudyHub", "Este archivo no es una copia de StudyHub.");
  assert([1, SCHEMA_VERSION].includes(envelope.schemaVersion), "La versión de la copia no es compatible.");
  return validateState(normalizeState(envelope.data));
}

export function demoDueDateLabel() {
  return toLocalDateKey();
}

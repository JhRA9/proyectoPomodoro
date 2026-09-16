import { addDaysKey, parseLocalDate, toLocalDateKey } from "../utils/time.js";

export const SCHEMA_VERSION = 1;
export const TASK_STATUSES = ["pending", "in_progress", "completed"];
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
  ];
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

function isSafeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
}

export function validateState(candidate) {
  assert(candidate && typeof candidate === "object", "La copia no contiene datos válidos.");
  assert(candidate.schemaVersion === SCHEMA_VERSION, `Versión de datos no compatible (${candidate.schemaVersion ?? "desconocida"}).`);
  assert(Array.isArray(candidate.projects) && Array.isArray(candidate.tasks), "Faltan proyectos o tareas.");
  assert(Array.isArray(candidate.focusSessions) && Array.isArray(candidate.learningEntries), "Faltan sesiones o registros de aprendizaje.");
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
  }

  const taskIds = new Set();
  for (const task of candidate.tasks) {
    assert(task && isSafeId(task.id) && !taskIds.has(task.id), "Hay tareas con identificadores inválidos o duplicados.");
    taskIds.add(task.id);
    assert(projectIds.has(task.projectId), "Hay una tarea sin proyecto válido.");
    assert(typeof task.title === "string" && task.title.trim().length > 0, "Hay una tarea sin nombre.");
    assert(TASK_STATUSES.includes(task.status), "Hay un estado de tarea inválido.");
    assert(task.dueDate === null || Boolean(parseLocalDate(task.dueDate)), "Hay una fecha límite inválida.");
    assert(Number.isInteger(task.accumulatedSeconds) && task.accumulatedSeconds >= 0, "Hay tiempo acumulado inválido.");
  }

  const sessionIds = new Set();
  const sessionsById = new Map();
  for (const session of candidate.focusSessions) {
    assert(session && isSafeId(session.id) && !sessionIds.has(session.id), "Hay sesiones con identificadores inválidos o duplicados.");
    sessionIds.add(session.id);
    sessionsById.set(session.id, session);
    assert(taskIds.has(session.taskId), "Hay una sesión sin tarea válida.");
    assert(Number.isInteger(session.durationSeconds) && session.durationSeconds > 0, "Hay una sesión con duración inválida.");
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
    assert(!candidate.activeTimer, "No puede haber un cronómetro activo mientras existe una reflexión pendiente.");
    assert(taskIds.has(candidate.pendingCompletion.taskId), "La reflexión pendiente pertenece a una tarea inexistente.");
    const pendingSession = candidate.pendingCompletion.focusSessionId === null ? null : sessionsById.get(candidate.pendingCompletion.focusSessionId);
    assert(candidate.pendingCompletion.focusSessionId === null || pendingSession?.taskId === candidate.pendingCompletion.taskId, "La reflexión pendiente contiene una sesión inválida.");
    assert(!candidate.pendingCompletion.focusSessionId || !reflectedSessionIds.has(candidate.pendingCompletion.focusSessionId), "La sesión pendiente ya tiene una reflexión.");
    assert(candidate.pendingCompletion.kind === undefined || ["session", "completion"].includes(candidate.pendingCompletion.kind), "La reflexión pendiente contiene un tipo inválido.");
    if (candidate.pendingCompletion.kind === "session") assert(candidate.pendingCompletion.focusSessionId !== null, "La reflexión de sesión necesita una sesión guardada.");
    assert(isIsoTimestamp(candidate.pendingCompletion.openedAt), "La reflexión pendiente contiene una fecha inválida.");
  }
  return candidate;
}

export function normalizeState(candidate) {
  const state = structuredClone(candidate);
  state.revision = Number.isInteger(state.revision) ? state.revision : 0;
  state.updatedAt = isIsoTimestamp(state.updatedAt) ? state.updatedAt : new Date().toISOString();
  const configuredDuration = Number.parseInt(state.settings.focusDurationSeconds, 10);
  state.settings.focusDurationSeconds = Number.isSafeInteger(configuredDuration) && configuredDuration >= 60 ? configuredDuration : 1500;
  state.settings.timerMode = TIMER_MODES.includes(state.settings.timerMode) ? state.settings.timerMode : "countdown";
  state.settings.profileName = String(state.settings.profileName || "Estudiante").slice(0, 60);
  state.settings.seededDemo = Boolean(state.settings.seededDemo);
  state.projects = state.projects.map((project) => ({ ...project, description: String(project.description ?? "").slice(0, 300) }));
  state.tasks = state.tasks.map((task) => ({ ...task, description: String(task.description ?? "").slice(0, 500), dueDate: task.dueDate || null, completedAt: task.completedAt || null }));
  state.focusSessions = state.focusSessions.map((session) => ({ ...session, reason: String(session.reason || "stopped") }));
  state.learningEntries = state.learningEntries.map((entry) => {
    const session = state.focusSessions.find((item) => item.id === entry.focusSessionId);
    return {
      ...entry,
      learned: String(entry.learned ?? "").slice(0, 1200),
      unresolved: String(entry.unresolved ?? "").slice(0, 1200),
      nextSession: String(entry.nextSession ?? "").slice(0, 1200),
      focusSessionId: entry.focusSessionId || null,
      createdAt: isIsoTimestamp(entry.createdAt) ? entry.createdAt : session?.endedAt ?? `${entry.date}T12:00:00.000Z`,
    };
  });
  state.pendingCompletion = state.pendingCompletion
    ? { ...state.pendingCompletion, kind: ["session", "completion"].includes(state.pendingCompletion.kind) ? state.pendingCompletion.kind : "completion" }
    : null;
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
  assert(envelope.schemaVersion === SCHEMA_VERSION, "La versión de la copia no es compatible.");
  return validateState(envelope.data);
}

export function demoDueDateLabel() {
  return toLocalDateKey();
}

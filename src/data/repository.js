import { createId } from "../utils/id.js";
import { cleanMultilineText, cleanText } from "../utils/text.js";
import { normalizeLearningImages } from "../utils/learningImages.js";
import { isDailyRecurringTask, isRecurringOccurrenceCompleted, isRecurringTaskActiveOn } from "../utils/recurrence.js";
import { parseLocalDate, toLocalDateKey } from "../utils/time.js";
import { AI_PROFILES, AI_PROVIDERS, DELIVERABLE_STATUSES, HELP_LEVELS, PRIVACY_MODES, PROJECT_TYPES, defaultEvaluationConfig } from "../evaluation/constants.js";
import { rubricPercentage, validationStateFor } from "../evaluation/progress.js";
import { validateExternalEvaluationReport } from "../evaluation/report.js";
import {
  PROJECT_COLORS,
  PROJECT_ICONS,
  PROJECT_STATUSES,
  TASK_STATUSES,
  TIMER_MODES,
  assertBackupEnvelope,
  createEmptyState,
  createExportEnvelope,
  normalizeState,
  prepareImportedState,
  validateState,
} from "./schema.js";

export function activeElapsedSeconds(timer, nowMs = Date.now()) {
  if (!timer) return 0;
  if (timer.phase !== "running" || !timer.lastResumedAt) return timer.elapsedSeconds;
  const resumedAt = new Date(timer.lastResumedAt).getTime();
  const delta = Number.isFinite(resumedAt) ? Math.max(0, Math.floor((nowMs - resumedAt) / 1000)) : 0;
  return timer.elapsedSeconds + delta;
}

function normalizeDueTime(dueDate, dueTime) {
  const value = String(dueTime ?? "").trim();
  if (!dueDate || !value) return null;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("La hora límite no es válida.");
  return value;
}

function normalizeRecurrenceInput(input, currentRecurrence = null) {
  if (!input.repeatDaily) return null;
  const startDate = String(input.recurrenceStartDate ?? "").trim();
  const endDate = String(input.recurrenceEndDate ?? "").trim() || null;
  if (!parseLocalDate(startDate)) throw new Error("Elige una fecha inicial para la repetición diaria.");
  if (endDate && !parseLocalDate(endDate)) throw new Error("La fecha final de repetición no es válida.");
  if (endDate && endDate < startDate) throw new Error("La fecha final no puede ser anterior a la fecha inicial.");
  const completedDates = currentRecurrence?.frequency === "daily"
    ? currentRecurrence.completedDates.filter((date) => date >= startDate && (!endDate || date <= endDate))
    : [];
  return { frequency: "daily", startDate, endDate, completedDates };
}

function assertRecurringOccurrenceAvailable(task, dateKey) {
  if (!isDailyRecurringTask(task)) return;
  if (!isRecurringTaskActiveOn(task, dateKey)) {
    if (dateKey < task.recurrence.startDate) throw new Error("Esta tarea diaria todavía no ha comenzado.");
    throw new Error("El periodo de esta tarea diaria ya terminó.");
  }
  if (isRecurringOccurrenceCompleted(task, dateKey)) throw new Error("La tarea de hoy ya está completada.");
}

function completeTaskOccurrence(task, dateKey, now) {
  if (!isDailyRecurringTask(task)) {
    task.status = "completed";
    task.completedAt = now.toISOString();
    return;
  }
  if (!task.recurrence.completedDates.includes(dateKey)) task.recurrence.completedDates.push(dateKey);
  task.recurrence.completedDates.sort();
  const seriesEnded = task.recurrence.endDate === dateKey;
  task.status = seriesEnded ? "completed" : "in_progress";
  task.completedAt = seriesEnded ? now.toISOString() : null;
}

export class StudyHubRepository {
  constructor({ adapter, store, clock = () => new Date() }) {
    this.adapter = adapter;
    this.store = store;
    this.clock = clock;
    this.unsubscribeExternal = () => {};
  }

  async initialize() {
    const result = await this.adapter.load();
    this.store.setState(result.data);
    if (result.isNew) await this.adapter.save(result.data);
    this.unsubscribeExternal = this.adapter.subscribe?.((nextState) => this.store.setState(nextState)) ?? (() => {});
    return result;
  }

  destroy() { this.unsubscribeExternal(); }
  getState() { return this.store.getState(); }

  async commit(mutator) {
    const current = this.getState();
    const next = structuredClone(current);
    const result = mutator(next, current);
    next.schemaVersion = current.schemaVersion;
    next.revision = current.revision + 1;
    next.updatedAt = this.clock().toISOString();
    validateState(next);
    await this.adapter.save(next);
    this.store.setState(next);
    return result;
  }

  async createProject(input) {
    const now = this.clock();
    const project = {
      id: createId("project"),
      name: cleanText(input.name, 80),
      description: cleanText(input.description, 300),
      icon: PROJECT_ICONS.includes(input.icon) ? input.icon : "folder",
      color: PROJECT_COLORS.includes(input.color) ? input.color : PROJECT_COLORS[1],
      createdAt: now.toISOString(),
      status: "active",
      completedAt: null,
      projectType: PROJECT_TYPES.includes(input.projectType) ? input.projectType : "general",
      evaluationConfig: defaultEvaluationConfig(),
    };
    if (!project.name) throw new Error("Escribe un nombre para el proyecto.");
    await this.commit((state) => { state.projects.unshift(project); state.settings.seededDemo = false; });
    return project;
  }

  async updateProject(projectId, input) {
    return this.commit((state) => {
      const project = state.projects.find((item) => item.id === projectId);
      if (!project) throw new Error("El proyecto ya no existe.");
      const name = cleanText(input.name, 80);
      if (!name) throw new Error("Escribe un nombre para el proyecto.");
      Object.assign(project, {
        name,
        description: cleanText(input.description, 300),
        icon: PROJECT_ICONS.includes(input.icon) ? input.icon : project.icon,
        color: PROJECT_COLORS.includes(input.color) ? input.color : project.color,
        projectType: PROJECT_TYPES.includes(input.projectType) ? input.projectType : project.projectType,
      });
    });
  }

  async deleteProject(projectId) {
    return this.commit((state) => {
      const taskIds = new Set(state.tasks.filter((task) => task.projectId === projectId).map((task) => task.id));
      if (state.activeTimer && taskIds.has(state.activeTimer.taskId)) state.activeTimer = null;
      state.projects = state.projects.filter((project) => project.id !== projectId);
      state.tasks = state.tasks.filter((task) => !taskIds.has(task.id));
      state.focusSessions = state.focusSessions.filter((session) => !taskIds.has(session.taskId));
      state.learningEntries = state.learningEntries.filter((entry) => !taskIds.has(entry.taskId));
      state.competencies = state.competencies.filter((item) => item.projectId !== projectId);
      state.exercises = state.exercises.filter((item) => item.projectId !== projectId);
      state.evidence = state.evidence.filter((item) => item.projectId !== projectId);
      state.evaluations = state.evaluations.filter((item) => item.projectId !== projectId);
      state.deliveryStages = state.deliveryStages.filter((item) => item.projectId !== projectId);
      state.deliverables = state.deliverables.filter((item) => item.projectId !== projectId);
      state.aiRequests = state.aiRequests.filter((item) => item.projectId !== projectId);
      state.weeklyReviews = state.weeklyReviews.filter((item) => item.projectId !== projectId);
      if (state.pendingCompletion && taskIds.has(state.pendingCompletion.taskId)) state.pendingCompletion = null;
    });
  }

  async setProjectStatus(projectId, status) {
    if (!PROJECT_STATUSES.includes(status)) throw new Error("Estado de proyecto no válido.");
    const now = this.clock();
    return this.commit((state) => {
      const project = state.projects.find((item) => item.id === projectId);
      if (!project) throw new Error("El proyecto ya no existe.");
      if (project.status === status) return { changed: false, pausedTaskTitle: null };

      let pausedTaskTitle = null;
      if (status === "completed" && state.activeTimer) {
        const activeTask = state.tasks.find((task) => task.id === state.activeTimer.taskId);
        if (activeTask?.projectId === projectId) {
          state.activeTimer.elapsedSeconds = activeElapsedSeconds(state.activeTimer, now.getTime());
          state.activeTimer.phase = "paused";
          state.activeTimer.lastResumedAt = null;
          pausedTaskTitle = activeTask.title;
        }
      }

      project.status = status;
      project.completedAt = status === "completed" ? now.toISOString() : null;
      return { changed: true, pausedTaskTitle };
    });
  }

  async createTask(projectId, input) {
    const project = this.getState().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("El proyecto ya no existe.");
    if (project.status === "completed") throw new Error("Descompleta el proyecto antes de crear otra tarea.");
    const title = cleanText(input.title, 100);
    if (!title) throw new Error("Escribe un nombre para la tarea.");
    const recurrence = normalizeRecurrenceInput(input);
    const task = {
      id: createId("task"),
      projectId,
      title,
      description: cleanText(input.description, 500),
      category: cleanText(input.category, 60),
      status: TASK_STATUSES.includes(input.status) ? input.status : "pending",
      dueDate: recurrence ? null : input.dueDate || null,
      dueTime: recurrence ? null : normalizeDueTime(input.dueDate, input.dueTime),
      recurrence,
      accumulatedSeconds: 0,
      createdAt: this.clock().toISOString(),
      completedAt: input.status === "completed" ? this.clock().toISOString() : null,
    };
    await this.commit((state) => state.tasks.unshift(task));
    return task;
  }

  async updateTask(taskId, input) {
    return this.commit((state) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error("La tarea ya no existe.");
      const title = cleanText(input.title, 100);
      if (!title) throw new Error("Escribe un nombre para la tarea.");
      task.title = title;
      task.description = cleanText(input.description, 500);
      task.category = cleanText(input.category, 60);
      task.recurrence = normalizeRecurrenceInput(input, task.recurrence);
      task.dueDate = task.recurrence ? null : input.dueDate || null;
      task.dueTime = task.recurrence ? null : normalizeDueTime(input.dueDate, input.dueTime);
      if (task.recurrence && task.status === "completed" && (!task.recurrence.endDate || task.recurrence.completedDates.at(-1) !== task.recurrence.endDate)) {
        task.status = "in_progress";
        task.completedAt = null;
      }
    });
  }

  async deleteTask(taskId) {
    return this.commit((state) => {
      if (state.activeTimer?.taskId === taskId) state.activeTimer = null;
      state.tasks = state.tasks.filter((task) => task.id !== taskId);
      state.focusSessions = state.focusSessions.filter((session) => session.taskId !== taskId);
      state.learningEntries = state.learningEntries.filter((entry) => entry.taskId !== taskId);
      if (state.pendingCompletion?.taskId === taskId) state.pendingCompletion = null;
    });
  }

  async setTaskStatus(taskId, status) {
    if (!TASK_STATUSES.includes(status)) throw new Error("Estado no válido.");
    if (status === "completed") return this.requestCompletion(taskId);
    return this.commit((state) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error("La tarea ya no existe.");
      const project = state.projects.find((item) => item.id === task.projectId);
      if (project?.status === "completed") throw new Error("Descompleta el proyecto antes de cambiar sus tareas.");
      task.status = status;
      task.completedAt = null;
    });
  }

  async setFocusDuration(seconds) {
    const duration = Number(seconds);
    if (!Number.isSafeInteger(duration) || duration < 60) throw new Error("Elige una duración mínima de un minuto.");
    return this.commit((state) => {
      if (state.activeTimer) throw new Error("Detén la sesión antes de cambiar su duración.");
      state.settings.focusDurationSeconds = duration;
    });
  }

  async setFocusDurationParts(hoursValue, minutesValue) {
    const hours = Number(hoursValue);
    const minutes = Number(minutesValue);
    if (!Number.isSafeInteger(hours) || hours < 0) throw new Error("Las horas deben ser un número entero positivo.");
    if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 59) throw new Error("Los minutos deben estar entre 0 y 59.");
    const duration = hours * 3600 + minutes * 60;
    if (!Number.isSafeInteger(duration) || duration < 60) throw new Error("Elige una duración mínima de un minuto.");
    return this.setFocusDuration(duration);
  }

  async setTimerMode(mode) {
    if (!TIMER_MODES.includes(mode)) throw new Error("Modo de temporizador no válido.");
    return this.commit((state) => {
      if (state.activeTimer) throw new Error("Detén la sesión antes de cambiar el modo del temporizador.");
      state.settings.timerMode = mode;
    });
  }

  async startTimer(taskId) {
    const now = this.clock();
    return this.commit((state) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error("La tarea ya no existe.");
      const project = state.projects.find((item) => item.id === task.projectId);
      if (project?.status === "completed") throw new Error("Descompleta el proyecto antes de iniciar otra sesión.");
      if (task.status === "completed") throw new Error("Reabre la tarea antes de iniciar otra sesión.");
      assertRecurringOccurrenceAvailable(task, toLocalDateKey(now));
      if (state.pendingCompletion) throw new Error("Guarda u omite la reflexión pendiente antes de iniciar otra sesión.");
      if (state.activeTimer) {
        if (state.activeTimer.taskId !== taskId) throw new Error("Ya hay una sesión activa. Deténla antes de cambiar de tarea.");
        if (state.activeTimer.phase === "paused") {
          state.activeTimer.phase = "running";
          state.activeTimer.lastResumedAt = now.toISOString();
        }
        return;
      }
      state.activeTimer = {
        sessionId: createId("session"),
        taskId,
        phase: "running",
        sessionStartedAt: now.toISOString(),
        lastResumedAt: now.toISOString(),
        elapsedSeconds: 0,
        targetSeconds: state.settings.timerMode === "infinite" ? null : state.settings.focusDurationSeconds,
      };
      if (task.status === "pending") task.status = "in_progress";
    });
  }

  async pauseTimer() {
    const now = this.clock();
    return this.commit((state) => {
      if (!state.activeTimer || state.activeTimer.phase !== "running") return;
      state.activeTimer.elapsedSeconds = activeElapsedSeconds(state.activeTimer, now.getTime());
      state.activeTimer.phase = "paused";
      state.activeTimer.lastResumedAt = null;
    });
  }

  finalizeTimerInState(state, now, reason = "stopped") {
    const timer = state.activeTimer;
    if (!timer) return null;
    if (state.focusSessions.some((session) => session.id === timer.sessionId)) {
      state.activeTimer = null;
      return null;
    }
    const durationSeconds = activeElapsedSeconds(timer, now.getTime());
    let session = null;
    if (durationSeconds > 0) {
      session = {
        id: timer.sessionId,
        taskId: timer.taskId,
        startedAt: timer.sessionStartedAt,
        endedAt: now.toISOString(),
        durationSeconds,
        reason,
      };
      state.focusSessions.push(session);
      const task = state.tasks.find((item) => item.id === timer.taskId);
      if (task) task.accumulatedSeconds += durationSeconds;
    }
    state.activeTimer = null;
    return session;
  }

  async stopTimer(reason = "stopped") {
    if (!this.getState().activeTimer) return 0;
    const now = this.clock();
    let session = null;
    await this.commit((state) => {
      if (state.pendingCompletion) throw new Error("Guarda u omite la reflexión pendiente antes de detener otra sesión.");
      session = this.finalizeTimerInState(state, now, reason);
      if (session) {
        state.pendingCompletion = {
          taskId: session.taskId,
          focusSessionId: session.id,
          kind: "session",
          openedAt: now.toISOString(),
        };
      }
    });
    return session?.durationSeconds ?? 0;
  }

  async requestCompletion(taskId) {
    const now = this.clock();
    return this.commit((state) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error("La tarea ya no existe.");
      const project = state.projects.find((item) => item.id === task.projectId);
      if (project?.status === "completed") throw new Error("Descompleta el proyecto antes de completar sus tareas.");
      if (task.status === "completed") return;
      const occurrenceDate = toLocalDateKey(now);
      assertRecurringOccurrenceAvailable(task, occurrenceDate);
      if (state.pendingCompletion) throw new Error("Guarda u omite la reflexión pendiente antes de completar la tarea.");
      let focusSessionId = null;
      let pausedTaskTitle = null;
      if (state.activeTimer?.taskId === taskId) {
        focusSessionId = this.finalizeTimerInState(state, now, "completed")?.id ?? null;
      } else {
        if (state.activeTimer?.phase === "running") {
          state.activeTimer.elapsedSeconds = activeElapsedSeconds(state.activeTimer, now.getTime());
          state.activeTimer.phase = "paused";
          state.activeTimer.lastResumedAt = null;
          pausedTaskTitle = state.tasks.find((item) => item.id === state.activeTimer.taskId)?.title ?? null;
        }
        const reflectedSessionIds = new Set(state.learningEntries.map((entry) => entry.focusSessionId).filter(Boolean));
        const latestUnreflected = state.focusSessions
          .filter((session) => session.taskId === taskId && !session.learningEntryDeleted && !reflectedSessionIds.has(session.id))
          .sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0];
        focusSessionId = latestUnreflected?.id ?? null;
      }
      state.pendingCompletion = { taskId, focusSessionId, kind: "completion", occurrenceDate, openedAt: now.toISOString() };
      return { pausedTaskTitle, ...(isDailyRecurringTask(task) ? { occurrenceCompletion: true } : {}) };
    });
  }

  async completeTaskWithReflection(taskId, input) {
    const learned = cleanMultilineText(input.learned, 1200);
    const unresolved = cleanMultilineText(input.unresolved, 1200);
    const nextSession = cleanMultilineText(input.nextSession, 1200);
    const learnedImages = normalizeLearningImages(input.learnedImages);
    if (!learned) throw new Error("Escribe qué aprendiste antes de completar la tarea.");
    const now = this.clock();
    return this.commit((state) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error("La tarea ya no existe.");
      const project = state.projects.find((item) => item.id === task.projectId);
      if (project?.status === "completed") throw new Error("Descompleta el proyecto antes de completar sus tareas.");
      if (task.status === "completed") return { alreadyCompleted: true, pausedTaskTitle: null };
      if (state.pendingCompletion) throw new Error("Guarda u omite la reflexión pendiente antes de completar la tarea.");
      const occurrenceDate = toLocalDateKey(now);
      if (isDailyRecurringTask(task) && isRecurringOccurrenceCompleted(task, occurrenceDate)) return { alreadyCompleted: true, pausedTaskTitle: null };
      assertRecurringOccurrenceAvailable(task, occurrenceDate);

      let focusSessionId = null;
      let pausedTaskTitle = null;
      if (state.activeTimer?.taskId === taskId) {
        focusSessionId = this.finalizeTimerInState(state, now, "completed")?.id ?? null;
      } else {
        if (state.activeTimer?.phase === "running") {
          state.activeTimer.elapsedSeconds = activeElapsedSeconds(state.activeTimer, now.getTime());
          state.activeTimer.phase = "paused";
          state.activeTimer.lastResumedAt = null;
          pausedTaskTitle = state.tasks.find((item) => item.id === state.activeTimer.taskId)?.title ?? null;
        }
        const reflectedSessionIds = new Set(state.learningEntries.map((entry) => entry.focusSessionId).filter(Boolean));
        const latestUnreflected = state.focusSessions
          .filter((session) => session.taskId === taskId && !session.learningEntryDeleted && !reflectedSessionIds.has(session.id))
          .sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0];
        focusSessionId = latestUnreflected?.id ?? null;
      }

      if (focusSessionId && state.learningEntries.some((entry) => entry.focusSessionId === focusSessionId)) {
        throw new Error("Esta sesión ya tiene una reflexión guardada.");
      }
      state.learningEntries.push({
        id: createId("learning"),
        projectId: task.projectId,
        taskId: task.id,
        focusSessionId,
        date: occurrenceDate,
        createdAt: now.toISOString(),
        learned,
        unresolved,
        nextSession,
        learnedImages,
      });
      completeTaskOccurrence(task, occurrenceDate, now);
      return { pausedTaskTitle, ...(isDailyRecurringTask(task) ? { occurrenceCompleted: true } : {}) };
    });
  }

  async cancelCompletion() {
    if (!this.getState().pendingCompletion) return;
    return this.commit((state) => { state.pendingCompletion = null; });
  }

  async saveReflection(input) {
    const learned = cleanMultilineText(input.learned, 1200);
    const unresolved = cleanMultilineText(input.unresolved, 1200);
    const nextSession = cleanMultilineText(input.nextSession, 1200);
    const learnedImages = normalizeLearningImages(input.learnedImages);
    if (!learned) throw new Error("Escribe qué aprendiste antes de guardar.");
    const now = this.clock();
    return this.commit((state) => {
      const pending = state.pendingCompletion;
      if (!pending) throw new Error("Esta reflexión ya fue guardada o cancelada.");
      const task = state.tasks.find((item) => item.id === pending.taskId);
      if (!task) throw new Error("La tarea ya no existe.");
      const occurrenceDate = pending.occurrenceDate || toLocalDateKey(now);
      if ((pending.kind ?? "completion") === "completion") assertRecurringOccurrenceAvailable(task, occurrenceDate);
      if (pending.focusSessionId && state.learningEntries.some((entry) => entry.focusSessionId === pending.focusSessionId)) {
        throw new Error("Esta sesión ya tiene una reflexión guardada.");
      }
      state.learningEntries.push({
        id: createId("learning"),
        projectId: task.projectId,
        taskId: task.id,
        focusSessionId: pending.focusSessionId,
        date: occurrenceDate,
        createdAt: now.toISOString(),
        learned,
        unresolved,
        nextSession,
        learnedImages,
      });
      if ((pending.kind ?? "completion") === "completion") {
        completeTaskOccurrence(task, occurrenceDate, now);
      }
      state.pendingCompletion = null;
    });
  }

  async updateLearningEntry(entryId, input) {
    const learned = cleanMultilineText(input.learned, 1200);
    const unresolved = cleanMultilineText(input.unresolved, 1200);
    const nextSession = cleanMultilineText(input.nextSession, 1200);
    if (!learned) throw new Error("Escribe qué aprendiste antes de guardar.");
    return this.commit((state) => {
      const entry = state.learningEntries.find((item) => item.id === entryId);
      if (!entry) throw new Error("El aprendizaje ya no existe.");
      entry.learned = learned;
      entry.unresolved = unresolved;
      entry.nextSession = nextSession;
      if (input.learnedImages !== undefined) entry.learnedImages = normalizeLearningImages(input.learnedImages);
    });
  }

  async deleteLearningEntry(entryId) {
    return this.commit((state) => {
      const entry = state.learningEntries.find((item) => item.id === entryId);
      if (!entry) throw new Error("El aprendizaje ya no existe.");
      if (entry.focusSessionId) {
        const session = state.focusSessions.find((item) => item.id === entry.focusSessionId);
        if (session) session.learningEntryDeleted = true;
      }
      state.learningEntries = state.learningEntries.filter((item) => item.id !== entryId);
    });
  }

  async updateEvaluationSettings(projectId, input) {
    return this.commit((state) => {
      const project = state.projects.find((item) => item.id === projectId);
      if (!project) throw new Error("El proyecto ya no existe.");
      project.projectType = PROJECT_TYPES.includes(input.projectType) ? input.projectType : project.projectType;
      project.evaluationConfig = {
        ...project.evaluationConfig,
        privacy: PRIVACY_MODES.includes(input.privacy) ? input.privacy : project.evaluationConfig.privacy,
        provider: AI_PROVIDERS.includes(input.provider) ? input.provider : project.evaluationConfig.provider,
        profile: AI_PROFILES.includes(input.profile) ? input.profile : project.evaluationConfig.profile,
        maxRequestsPerDay: Math.max(1, Math.min(100, Number.parseInt(input.maxRequestsPerDay, 10) || project.evaluationConfig.maxRequestsPerDay)),
      };
    });
  }

  async updateRubric(projectId, criteria) {
    const normalized = criteria.map((item, index) => ({
      id: cleanText(item.id || `criterion-${index + 1}`, 128),
      name: cleanText(item.name, 100),
      weight: Number(item.weight),
      descriptions: Array.isArray(item.descriptions) ? item.descriptions.map((value) => cleanText(value, 300)).slice(0, 5) : [],
    }));
    if (!normalized.length || normalized.some((item) => !item.id || !item.name || !Number.isFinite(item.weight) || item.weight < 0)) throw new Error("Revisa los criterios de la rúbrica.");
    if (Math.round(normalized.reduce((sum, item) => sum + item.weight, 0)) !== 100) throw new Error("Los pesos de la rúbrica deben sumar 100.");
    return this.commit((state) => {
      const project = state.projects.find((item) => item.id === projectId);
      if (!project) throw new Error("El proyecto ya no existe.");
      project.evaluationConfig.rubric = {
        ...project.evaluationConfig.rubric,
        version: project.evaluationConfig.rubric.version + 1,
        criteria: normalized,
      };
    });
  }

  async createCompetency(projectId, input) {
    const competency = {
      id: createId("competency"), projectId, parentId: input.parentId || null,
      name: cleanText(input.name, 100), description: cleanMultilineText(input.description, 500),
      objectives: cleanMultilineText(input.objectives, 1200).split("\n").map((value) => value.trim()).filter(Boolean).slice(0, 20),
      dependencies: [], resources: [], createdAt: this.clock().toISOString(),
    };
    if (!competency.name) throw new Error("Escribe un nombre para la competencia.");
    await this.commit((state) => {
      if (!state.projects.some((item) => item.id === projectId)) throw new Error("El proyecto ya no existe.");
      if (competency.parentId && !state.competencies.some((item) => item.id === competency.parentId && item.projectId === projectId)) throw new Error("La competencia principal no es válida.");
      state.competencies.push(competency);
    });
    return competency;
  }

  async deleteCompetency(competencyId) {
    return this.commit((state) => {
      if (state.exercises.some((item) => item.competencyIds.includes(competencyId)) || state.evaluations.some((item) => item.competencyIds.includes(competencyId))) throw new Error("Esta competencia ya tiene ejercicios o evaluaciones y forma parte del historial.");
      const children = new Set(state.competencies.filter((item) => item.parentId === competencyId).map((item) => item.id));
      state.competencies = state.competencies.filter((item) => item.id !== competencyId && !children.has(item.id));
    });
  }

  async createExercise(projectId, input) {
    const competencyIds = Array.isArray(input.competencyIds) ? [...new Set(input.competencyIds)] : String(input.competencyIds || "").split(",").map((item) => item.trim()).filter(Boolean);
    const exercise = {
      id: createId("exercise"), projectId, taskId: input.taskId || null,
      title: cleanText(input.title, 120), description: cleanMultilineText(input.description, 1200), objective: cleanMultilineText(input.objective, 600),
      difficulty: Math.max(1, Math.min(5, Number.parseInt(input.difficulty, 10) || 1)), competencyIds,
      code: String(input.code || "").slice(0, 30000), expectedResult: cleanMultilineText(input.expectedResult, 3000), actualResult: cleanMultilineText(input.actualResult, 3000),
      helpLevel: HELP_LEVELS.includes(input.helpLevel) ? input.helpLevel : "unverified_help",
      independenceDeclared: input.independenceDeclared === true || input.independenceDeclared === "on", independenceVerified: false,
      status: input.status === "completed" ? "completed" : "draft", tests: { status: "not_run", passed: 0, total: 0, summary: "" }, files: [],
      createdAt: this.clock().toISOString(), updatedAt: this.clock().toISOString(),
    };
    if (!exercise.title) throw new Error("Escribe un título para el ejercicio.");
    await this.commit((state) => {
      if (!state.projects.some((item) => item.id === projectId)) throw new Error("El proyecto ya no existe.");
      if (exercise.competencyIds.some((id) => !state.competencies.some((item) => item.id === id && item.projectId === projectId))) throw new Error("Hay competencias seleccionadas que ya no existen.");
      state.exercises.push(exercise);
    });
    return exercise;
  }

  async createEvidence(projectId, input) {
    const competencyIds = Array.isArray(input.competencyIds) ? [...new Set(input.competencyIds)] : [];
    const allowedKinds = ["reported", "attached", "test_passed", "external_verified"];
    const evidence = {
      id: createId("evidence"), projectId,
      targetType: ["project", "exercise", "deliverable"].includes(input.targetType) ? input.targetType : "project",
      targetId: input.targetId || projectId,
      title: cleanText(input.title, 160),
      description: cleanMultilineText(input.description, 2000),
      kind: allowedKinds.includes(input.kind) ? input.kind : "reported",
      competencyIds,
      createdAt: this.clock().toISOString(),
    };
    if (!evidence.title) throw new Error("Escribe un título para la evidencia.");
    await this.commit((state) => {
      if (!state.projects.some((item) => item.id === projectId)) throw new Error("El proyecto ya no existe.");
      if (evidence.targetType === "exercise" && !state.exercises.some((item) => item.id === evidence.targetId && item.projectId === projectId)) throw new Error("El ejercicio seleccionado no existe.");
      if (evidence.targetType === "deliverable" && !state.deliverables.some((item) => item.id === evidence.targetId && item.projectId === projectId)) throw new Error("El entregable seleccionado no existe.");
      if (competencyIds.some((id) => !state.competencies.some((item) => item.id === id && item.projectId === projectId))) throw new Error("Hay competencias seleccionadas que ya no existen.");
      state.evidence.push(evidence);
    });
    return evidence;
  }

  async deleteEvidence(evidenceId) {
    return this.commit((state) => {
      if (!state.evidence.some((item) => item.id === evidenceId)) throw new Error("La evidencia ya no existe.");
      state.evidence = state.evidence.filter((item) => item.id !== evidenceId);
    });
  }

  async recordManualEvaluation(exerciseId, input) {
    const state = this.getState();
    const exercise = state.exercises.find((item) => item.id === exerciseId);
    if (!exercise) throw new Error("El ejercicio ya no existe.");
    const project = state.projects.find((item) => item.id === exercise.projectId);
    const rubric = structuredClone(project.evaluationConfig.rubric);
    const scores = rubric.criteria.map((criterion) => ({ criterionId: criterion.id, score: Math.max(0, Math.min(4, Number(input[`score_${criterion.id}`]))), justification: cleanMultilineText(input[`justification_${criterion.id}`], 1000) }));
    if (scores.some((item) => !Number.isFinite(item.score))) throw new Error("Asigna una puntuación de 0 a 4 a cada criterio.");
    const percentage = rubricPercentage(rubric.criteria, scores);
    const evaluation = {
      id: createId("evaluation"), projectId: project.id, targetType: "exercise", targetId: exercise.id,
      source: "manual", provider: null, model: null, profile: "manual", status: "completed",
      rubricVersion: rubric.version, rubric, scores, percentage, validationState: "provisional", provisionalLevel: null,
      competencyIds: [...exercise.competencyIds], difficulty: exercise.difficulty, helpLevel: exercise.helpLevel,
      strengths: cleanMultilineText(input.strengths, 2000).split("\n").filter(Boolean), weaknesses: cleanMultilineText(input.weaknesses, 2000).split("\n").filter(Boolean), recommendations: cleanMultilineText(input.recommendations, 2000).split("\n").filter(Boolean),
      summary: cleanMultilineText(input.summary, 3000), createdAt: this.clock().toISOString(), latencyMs: null, usage: null, provenance: "user",
    };
    return this.commit((next) => {
      const existing = next.evaluations.filter((item) => item.projectId === project.id && item.status === "completed" && item.competencyIds.some((id) => evaluation.competencyIds.includes(id)));
      evaluation.validationState = validationStateFor([...existing, evaluation], percentage);
      next.evaluations.push(evaluation);
      const storedExercise = next.exercises.find((item) => item.id === exercise.id);
      storedExercise.status = "completed";
      storedExercise.updatedAt = this.clock().toISOString();
      return evaluation;
    });
  }

  async storeAiEvaluation(exerciseId, response) {
    const now = this.clock().toISOString();
    return this.commit((state) => {
      const exercise = state.exercises.find((item) => item.id === exerciseId);
      const project = state.projects.find((item) => item.id === exercise?.projectId);
      if (!exercise || !project) throw new Error("El ejercicio ya no existe.");
      const results = Array.isArray(response.results) ? response.results : [response];
      const created = [];
      for (const result of results) {
        const scores = project.evaluationConfig.rubric.criteria.map((criterion) => {
          const score = result.scores?.find((item) => item.criterionId === criterion.id);
          return { criterionId: criterion.id, score: Math.max(0, Math.min(4, Number(score?.score))), justification: cleanMultilineText(score?.justification, 1200) };
        });
        if (scores.some((item) => !Number.isFinite(item.score))) throw new Error("El proveedor devolvió una rúbrica incompleta.");
        const percentage = rubricPercentage(project.evaluationConfig.rubric.criteria, scores);
        const evaluation = {
          id: createId("evaluation"), projectId: project.id, targetType: "exercise", targetId: exercise.id,
          source: result.provider, provider: result.provider, model: result.model, profile: response.profile || project.evaluationConfig.profile, status: "completed",
          rubricVersion: project.evaluationConfig.rubric.version, rubric: structuredClone(project.evaluationConfig.rubric), scores, percentage,
          validationState: "provisional", provisionalLevel: cleanText(result.provisionalLevel, 60) || null,
          competencyIds: [...exercise.competencyIds], difficulty: exercise.difficulty, helpLevel: exercise.helpLevel,
          strengths: (result.strengths ?? []).map((item) => cleanText(item, 500)).filter(Boolean), weaknesses: (result.weaknesses ?? []).map((item) => cleanText(item, 500)).filter(Boolean), recommendations: (result.recommendations ?? []).map((item) => cleanText(item, 500)).filter(Boolean),
          summary: cleanMultilineText(result.summary, 3000), createdAt: now, latencyMs: result.latencyMs ?? null, usage: result.usage ?? null, provenance: "ai",
        };
        const prior = state.evaluations.filter((item) => item.projectId === project.id && item.status === "completed" && item.competencyIds.some((id) => evaluation.competencyIds.includes(id)));
        evaluation.validationState = validationStateFor([...prior, evaluation], percentage);
        state.evaluations.push(evaluation);
        state.aiRequests.push({ id: createId("ai-request"), projectId: project.id, evaluationId: evaluation.id, provider: evaluation.provider, model: evaluation.model, profile: evaluation.profile, createdAt: now, latencyMs: evaluation.latencyMs, inputTokens: evaluation.usage?.inputTokens ?? null, outputTokens: evaluation.usage?.outputTokens ?? null, reasoningTokens: evaluation.usage?.reasoningTokens ?? null, neurons: evaluation.usage?.neurons ?? null, status: "completed", error: null });
        created.push(evaluation);
      }
      exercise.status = "completed";
      exercise.updatedAt = now;
      return created;
    });
  }

  async recordAiFailure(projectId, details) {
    return this.commit((state) => state.aiRequests.push({ id: createId("ai-request"), projectId, evaluationId: null, provider: details.provider, model: details.model || null, profile: details.profile || null, createdAt: this.clock().toISOString(), latencyMs: details.latencyMs ?? null, inputTokens: null, outputTokens: null, reasoningTokens: null, neurons: null, status: "failed", error: cleanText(details.error, 500) }));
  }

  async createDeliveryStage(projectId, input) {
    const stage = { id: createId("stage"), projectId, title: cleanText(input.title, 120), description: cleanMultilineText(input.description, 800), order: this.getState().deliveryStages.filter((item) => item.projectId === projectId).length, createdAt: this.clock().toISOString() };
    if (!stage.title) throw new Error("Escribe un nombre para la etapa.");
    await this.commit((state) => state.deliveryStages.push(stage));
    return stage;
  }

  async createDeliverable(projectId, input) {
    const deliverable = { id: createId("deliverable"), projectId, stageId: input.stageId, title: cleanText(input.title, 160), description: cleanMultilineText(input.description, 1200), status: DELIVERABLE_STATUSES.includes(input.status) ? input.status : "pending", dependencyIds: Array.isArray(input.dependencyIds) ? [...new Set(input.dependencyIds)] : [], blockingReason: cleanMultilineText(input.blockingReason, 800), weight: input.weight ? Number(input.weight) : null, dueDate: input.dueDate || null, verifiedAt: input.status === "verified" ? this.clock().toISOString() : null, createdAt: this.clock().toISOString(), updatedAt: this.clock().toISOString() };
    if (!deliverable.title) throw new Error("Escribe un nombre para el entregable.");
    await this.commit((state) => {
      if (!state.deliveryStages.some((item) => item.id === deliverable.stageId && item.projectId === projectId)) throw new Error("Selecciona una etapa válida.");
      if (deliverable.dependencyIds.some((id) => !state.deliverables.some((item) => item.id === id && item.projectId === projectId))) throw new Error("Hay dependencias que no pertenecen a este proyecto.");
      state.deliverables.push(deliverable);
    });
    return deliverable;
  }

  async updateDeliverableStatus(deliverableId, status, blockingReason = "") {
    if (!DELIVERABLE_STATUSES.includes(status)) throw new Error("Estado de entregable no válido.");
    return this.commit((state) => {
      const item = state.deliverables.find((candidate) => candidate.id === deliverableId);
      if (!item) throw new Error("El entregable ya no existe.");
      const dependenciesReady = item.dependencyIds.every((id) => state.deliverables.find((candidate) => candidate.id === id)?.status === "verified");
      if (["completed_unverified", "verified"].includes(status) && !dependenciesReady) throw new Error("Verifica primero las dependencias de este entregable.");
      item.status = status;
      item.blockingReason = status === "blocked" ? cleanMultilineText(blockingReason, 800) : "";
      item.verifiedAt = status === "verified" ? this.clock().toISOString() : null;
      item.updatedAt = this.clock().toISOString();
    });
  }

  async importExternalEvaluations(projectId, report) {
    validateExternalEvaluationReport(report);
    if (report.project.id !== projectId) throw new Error("El informe pertenece a otro proyecto.");
    return this.commit((state) => {
      const existing = new Set(state.evaluations.flatMap((item) => [item.id, item.externalId]).filter(Boolean));
      let imported = 0;
      for (const source of report.evaluations) {
        const externalId = String(source.id || "");
        if (!externalId || existing.has(externalId)) continue;
        state.evaluations.push({ ...source, id: createId("evaluation"), projectId, externalId, source: "external", provenance: "external-import", competencyIds: (source.competencyIds ?? []).filter((id) => state.competencies.some((item) => item.id === id && item.projectId === projectId)), createdAt: source.createdAt || this.clock().toISOString() });
        existing.add(externalId);
        imported += 1;
      }
      return { imported };
    });
  }

  exportEnvelope() { return createExportEnvelope(this.getState(), this.clock()); }

  async importEnvelope(envelope) {
    assertBackupEnvelope(envelope);
    const next = prepareImportedState(envelope.data, this.clock());
    await this.adapter.save(next);
    this.store.setState(next);
  }

  async replaceFromMigration(candidate) {
    const next = prepareImportedState(candidate, this.clock());
    await this.adapter.save(next);
    this.adapter.acknowledgeMigration?.("migrated");
    this.store.setState(next);
    return next;
  }

  async persistCurrentState() {
    const current = this.getState();
    await this.adapter.save(current);
    this.adapter.acknowledgeMigration?.("skipped");
    return current;
  }

  async syncNow() {
    return this.adapter.flush?.() ?? { data: null, synced: true };
  }

  async resetAll() {
    const next = createEmptyState(this.clock());
    next.revision = this.getState().revision + 1;
    await this.adapter.save(next);
    this.store.setState(next);
  }

  async replaceForTest(nextState) {
    const normalized = normalizeState(nextState);
    await this.adapter.save(normalized);
    this.store.setState(normalized);
  }
}

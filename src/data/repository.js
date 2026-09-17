import { createId } from "../utils/id.js";
import { cleanMultilineText, cleanText } from "../utils/text.js";
import { normalizeLearningImages } from "../utils/learningImages.js";
import { toLocalDateKey } from "../utils/time.js";
import {
  PROJECT_COLORS,
  PROJECT_ICONS,
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
      });
    });
  }

  async deleteProject(projectId) {
    return this.commit((state) => {
      const taskIds = new Set(state.tasks.filter((task) => task.projectId === projectId).map((task) => task.id));
      if (state.activeTimer && taskIds.has(state.activeTimer.taskId)) throw new Error("Detén el cronómetro antes de eliminar este proyecto.");
      state.projects = state.projects.filter((project) => project.id !== projectId);
      state.tasks = state.tasks.filter((task) => !taskIds.has(task.id));
      state.focusSessions = state.focusSessions.filter((session) => !taskIds.has(session.taskId));
      state.learningEntries = state.learningEntries.filter((entry) => !taskIds.has(entry.taskId));
      if (state.pendingCompletion && taskIds.has(state.pendingCompletion.taskId)) state.pendingCompletion = null;
    });
  }

  async createTask(projectId, input) {
    const project = this.getState().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("El proyecto ya no existe.");
    const title = cleanText(input.title, 100);
    if (!title) throw new Error("Escribe un nombre para la tarea.");
    const task = {
      id: createId("task"),
      projectId,
      title,
      description: cleanText(input.description, 500),
      status: TASK_STATUSES.includes(input.status) ? input.status : "pending",
      dueDate: input.dueDate || null,
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
      task.dueDate = input.dueDate || null;
    });
  }

  async deleteTask(taskId) {
    return this.commit((state) => {
      if (state.activeTimer?.taskId === taskId) throw new Error("Detén el cronómetro antes de eliminar esta tarea.");
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
      if (task.status === "completed") throw new Error("Reabre la tarea antes de iniciar otra sesión.");
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
      if (task.status === "completed") return;
      if (state.pendingCompletion) throw new Error("Guarda u omite la reflexión pendiente antes de completar la tarea.");
      if (state.activeTimer && state.activeTimer.taskId !== taskId) throw new Error("Detén la sesión activa antes de completar otra tarea.");
      let focusSessionId = null;
      if (state.activeTimer?.taskId === taskId) {
        focusSessionId = this.finalizeTimerInState(state, now, "completed")?.id ?? null;
      } else {
        const reflectedSessionIds = new Set(state.learningEntries.map((entry) => entry.focusSessionId).filter(Boolean));
        const latestUnreflected = state.focusSessions
          .filter((session) => session.taskId === taskId && !reflectedSessionIds.has(session.id))
          .sort((a, b) => b.endedAt.localeCompare(a.endedAt))[0];
        focusSessionId = latestUnreflected?.id ?? null;
      }
      state.pendingCompletion = { taskId, focusSessionId, kind: "completion", openedAt: now.toISOString() };
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
      if (pending.focusSessionId && state.learningEntries.some((entry) => entry.focusSessionId === pending.focusSessionId)) {
        throw new Error("Esta sesión ya tiene una reflexión guardada.");
      }
      state.learningEntries.push({
        id: createId("learning"),
        projectId: task.projectId,
        taskId: task.id,
        focusSessionId: pending.focusSessionId,
        date: toLocalDateKey(now),
        createdAt: now.toISOString(),
        learned,
        unresolved,
        nextSession,
        learnedImages,
      });
      if ((pending.kind ?? "completion") === "completion") {
        task.status = "completed";
        task.completedAt = now.toISOString();
      }
      state.pendingCompletion = null;
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

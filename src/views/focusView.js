import { projectTasks, sessionsToday, taskEntries } from "../state/selectors.js";
import { escapeHtml } from "../utils/text.js";
import { dueDateTimeLabel, formatDuration, formatFocusTimer, toLocalDateKey } from "../utils/time.js";
import { learningDraftForm, learningTable, projectIcon, taskFilterMenu, taskRow } from "../ui/components.js";
import { icon } from "../ui/icons.js";

function focusList(state, project, task, ui) {
  const tasks = projectTasks(state, project.id).filter((item) => ui.taskFilter === "all" || item.status === ui.taskFilter);
  return `<section class="focus-task-column"><div class="focus-tools">${taskFilterMenu(ui)}<button class="primary-button small" type="button" data-action="new-task" data-project-id="${project.id}">${icon("plus", 17)} Nueva tarea</button></div><div class="focus-task-list">${tasks.length ? tasks.map((item) => taskRow(item, { selectedTaskId: task.id, menu: ui.menu })).join("") : `<div class="empty-state compact">${icon("filter", 24)}<strong>No hay tareas en este filtro</strong><p>Selecciona otro estado para ver más tareas.</p></div>`}</div></section>`;
}

function fileSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

function taskFilesPanel(task, ui) {
  if (!ui.filesEnabled) return "";
  const current = ui.taskFiles?.taskId === task.id ? ui.taskFiles : { status: "loading", items: [] };
  const items = current.items ?? [];
  const content = current.status === "loading"
    ? `<p class="task-files-message">Cargando archivos…</p>`
    : current.status === "error"
      ? `<p class="task-files-message error">No se pudieron cargar los archivos. <button type="button" data-action="retry-task-files" data-task-id="${escapeHtml(task.id)}">Reintentar</button></p>`
      : items.length
        ? `<ul class="task-files-list">${items.map((file) => `<li><span class="task-file-icon">${icon("note", 18)}</span><span class="task-file-details"><strong title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</strong><small>${fileSize(file.sizeBytes)}</small></span><button class="task-file-download" type="button" data-action="download-task-file" data-task-id="${escapeHtml(task.id)}" data-file-key="${escapeHtml(file.key)}" aria-label="Descargar ${escapeHtml(file.name)}">${icon("download", 18)}</button></li>`).join("")}</ul>`
        : `<p class="task-files-message">Todavía no hay archivos en esta tarea.</p>`;
  return `<section class="task-files" aria-labelledby="task-files-heading"><header><h3 id="task-files-heading">Archivos adjuntos</h3><label class="task-file-picker">${icon("upload", 16)} Adjuntar<input class="sr-only" type="file" multiple data-input="task-files" data-task-id="${escapeHtml(task.id)}" aria-label="Adjuntar archivos a esta tarea" /></label></header><p class="task-files-note">Opcional · hasta 20 MB por archivo. Subir el mismo nombre lo reemplaza.</p><div aria-live="polite">${content}</div></section>`;
}

function timerPanel(state, task, ui) {
  const timer = state.activeTimer?.taskId === task.id ? state.activeTimer : null;
  const elapsed = timer?.elapsedSeconds ?? 0;
  const mode = timer ? (timer.targetSeconds === null ? "infinite" : "countdown") : state.settings.timerMode;
  const target = timer ? timer.targetSeconds : mode === "infinite" ? null : state.settings.focusDurationSeconds;
  const configuredDuration = timer?.targetSeconds ?? state.settings.focusDurationSeconds;
  const durationHours = Math.floor(configuredDuration / 3600);
  const durationMinutes = Math.floor((configuredDuration % 3600) / 60);
  const progress = target === null ? (elapsed % 60) / 60 : Math.min(1, elapsed / target);
  const isCompleted = task.status === "completed";
  const centerLabel = timer?.phase === "running" ? "Pausar" : timer?.phase === "paused" ? "Reanudar" : "Iniciar";
  const centerIcon = timer?.phase === "running" ? "pause" : "play";
  const todaySessions = sessionsToday(state, task.id, toLocalDateKey());
  const todaySeconds = todaySessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const remaining = target === null ? null : target - elapsed;
  const status = timer?.phase === "paused"
    ? "En pausa"
    : timer?.phase === "running"
      ? mode === "infinite" ? "Tiempo transcurrido" : remaining < 0 ? "Tiempo extra" : "Enfócate"
      : isCompleted ? "Tarea completada" : mode === "infinite" ? "Listo · sin límite" : "Listo para comenzar";
  const hasHours = mode === "countdown" ? configuredDuration >= 3600 : elapsed >= 3600;
  const deadline = task.dueDate ? `<p class="focus-task-deadline">${icon("calendar", 14)} <span>Se entrega el ${escapeHtml(dueDateTimeLabel(task, { year: true, long: true }))}</span></p>` : "";
  return `<section class="timer-panel" aria-labelledby="focus-task-title"><header><small>Tarea actual</small><h2 id="focus-task-title">${escapeHtml(task.title)}</h2><p>${escapeHtml(task.description || "Sin descripción")}</p>${deadline}</header><form class="timer-config" data-form="timer-config"><fieldset ${timer ? "disabled" : ""}><legend>Modo del temporizador</legend><div class="timer-mode"><label><input class="sr-only" type="radio" name="timerMode" value="infinite" data-input="focus-mode" ${mode === "infinite" ? "checked" : ""}/><span>Sin límite</span></label><label><input class="sr-only" type="radio" name="timerMode" value="countdown" data-input="focus-mode" ${mode === "countdown" ? "checked" : ""}/><span>Con tiempo</span></label></div><div class="timer-config-detail">${mode === "infinite" ? `<p class="mode-hint">Cuenta desde cero hasta que presiones Detener.</p>` : `<div class="duration-fields" aria-describedby="focus-duration-help"><label for="focus-hours"><span>Horas</span><input id="focus-hours" name="hours" type="number" min="0" step="1" inputmode="numeric" value="${durationHours}" required /></label><label for="focus-minutes"><span>Minutos</span><input id="focus-minutes" name="minutes" type="number" min="0" max="59" step="1" inputmode="numeric" value="${durationMinutes}" required /></label><button class="timer-duration-submit" type="submit">Aplicar</button></div><p class="mode-hint" id="focus-duration-help">Elige cualquier duración desde 1 minuto.</p>`}</div></fieldset></form><div class="clock-dial ${timer?.phase === "running" ? "is-running" : ""} ${mode === "infinite" ? "is-infinite" : ""}" data-timer-mode="${mode}" style="--timer-progress:${progress}"><div class="tick-ring"></div><svg class="progress-ring" viewBox="0 0 320 320" aria-hidden="true"><circle class="ring-track" cx="160" cy="160" r="146"/><circle class="ring-progress" cx="160" cy="160" r="146" pathLength="1"/></svg><div class="clock-face"><strong class="${hasHours ? "has-hours" : ""}" data-timer-display role="timer" aria-live="off">${formatFocusTimer(elapsed, target)}</strong><span data-timer-status>${status}</span></div></div><div class="timer-actions"><button class="round-action complete" type="button" data-action="complete-task" data-task-id="${task.id}" ${isCompleted ? "disabled" : ""}>${icon("check", 35)}<span>Completar</span></button><button class="round-action primary" type="button" data-action="toggle-timer" data-task-id="${task.id}" ${isCompleted ? "disabled" : ""}>${icon(centerIcon, 37)}<span>${centerLabel}</span></button><button class="round-action stop" type="button" data-action="stop-timer" ${timer ? "" : "disabled"}>${icon("stop", 31)}<span>Detener</span></button></div><div class="session-summary"><article><span>Tiempo de hoy</span><strong>${formatDuration(todaySeconds, true)}</strong></article><article><span>Sesiones hoy</span><strong>${todaySessions.length}</strong></article><article><span>Tiempo total</span><strong>${formatDuration(task.accumulatedSeconds, true)}</strong></article></div>${taskFilesPanel(task, ui)}</section>`;
}

function taskLearningPanel(entries, state, task, ui) {
  const activeTab = ui.focusLearningTab === "history" ? "history" : "draft";
  const draftPanelId = `learning-draft-panel-${escapeHtml(task.id)}`;
  const historyPanelId = `learning-history-panel-${escapeHtml(task.id)}`;
  const content = activeTab === "draft"
    ? `<div class="learning-tab-panel" id="${draftPanelId}" role="tabpanel" aria-labelledby="learning-draft-tab">${learningDraftForm(task, ui.learningDrafts?.[task.id])}</div>`
    : `<div class="learning-tab-panel" id="${historyPanelId}" role="tabpanel" aria-labelledby="learning-history-tab">${learningTable(entries, state, "task")}</div>`;
  return `<section class="task-learning"><header><div><h2>Registro de aprendizaje</h2><p>Anota durante la sesión y consulta tus reflexiones anteriores.</p></div><span class="entry-count">${entries.length} ${entries.length === 1 ? "sesión" : "sesiones"}</span></header><div class="learning-tabs" role="tablist" aria-label="Contenido de aprendizaje"><button id="learning-draft-tab" class="learning-tab" type="button" role="tab" data-action="set-learning-tab" data-learning-tab="draft" aria-selected="${activeTab === "draft"}" aria-controls="${draftPanelId}" tabindex="${activeTab === "draft" ? "0" : "-1"}">Notas de la sesión</button><button id="learning-history-tab" class="learning-tab" type="button" role="tab" data-action="set-learning-tab" data-learning-tab="history" aria-selected="${activeTab === "history"}" aria-controls="${historyPanelId}" tabindex="${activeTab === "history" ? "0" : "-1"}">Historial <span>${entries.length}</span></button></div>${content}</section>`;
}

export function focusView(state, project, task, ui) {
  const entries = taskEntries(state, task.id);
  return `<section class="focus-page${ui.animatePage ? " page-enter" : ""}" style="--project:${escapeHtml(project.color)}"><header class="project-heading compact"><button class="icon-button back-button" type="button" data-action="go-project" data-project-id="${project.id}" aria-label="Volver al proyecto">${icon("chevronLeft", 25)}</button>${projectIcon(project, 27)}<div><h1>${escapeHtml(project.name)}</h1><p>${escapeHtml(project.description || "Sin descripción")}</p></div></header><div class="focus-layout">${focusList(state, project, task, ui)}${timerPanel(state, task, ui)}${taskLearningPanel(entries, state, task, ui)}</div></section>`;
}

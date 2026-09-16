import { PROJECT_COLORS, PROJECT_ICONS } from "../data/schema.js";
import { projectStats } from "../state/selectors.js";
import { dueCategory, formatDate, formatDuration, relativeDueLabel } from "../utils/time.js";
import { escapeHtml } from "../utils/text.js";
import { icon } from "./icons.js";

export const STATUS_META = {
  pending: { label: "Pendiente", tone: "neutral" },
  in_progress: { label: "En curso", tone: "blue" },
  completed: { label: "Completada", tone: "green" },
};

export const TASK_FILTER_LABELS = {
  all: "Todas",
  pending: "Pendientes",
  in_progress: "En curso",
  completed: "Completadas",
};

const ICON_LABELS = {
  graduation: "Graduación",
  code: "Programación",
  calculator: "Calculadora",
  book: "Libro",
  bulb: "Idea",
  activity: "Actividad",
  folder: "Carpeta",
  brain: "Aprendizaje",
};

export function brand() {
  return `<a class="brand" href="#/projects" aria-label="StudyHub, proyectos"><span class="brand-mark">${icon("layers", 38)}</span><span><strong>StudyHub</strong><small>Organiza. Enfócate. Logra.</small></span></a>`;
}

export function projectIcon(project, size = 32) {
  return `<span class="project-icon" style="--project:${escapeHtml(project.color)}">${icon(project.icon, size)}</span>`;
}

export function statusChip(task, expanded = false) {
  const meta = STATUS_META[task.status];
  return `<button class="status-chip status-${meta.tone}" type="button" data-action="toggle-status" data-task-id="${escapeHtml(task.id)}" aria-haspopup="menu" aria-expanded="${expanded}"><span class="status-dot"></span>${meta.label}</button>`;
}

export function statusMenu(task) {
  return `<div class="floating-menu status-menu" role="menu" aria-label="Cambiar estado de ${escapeHtml(task.title)}">
    ${Object.entries(STATUS_META).map(([status, meta]) => `<button type="button" role="menuitemradio" aria-checked="${task.status === status}" data-action="set-status" data-task-id="${escapeHtml(task.id)}" data-status="${status}" class="status-option status-${meta.tone}"><span class="status-dot"></span>${meta.label}${task.status === status ? icon("check", 15) : ""}</button>`).join("")}
  </div>`;
}

export function taskFilterMenu(ui) {
  const expanded = ui.menu?.type === "filter";
  return `<div class="filter-wrap"><button class="filter-button" type="button" data-action="toggle-filter" aria-haspopup="menu" aria-expanded="${expanded}">${icon("filter", 18)} Filtrar tareas: <strong>${TASK_FILTER_LABELS[ui.taskFilter]}</strong>${icon("chevronDown", 16)}</button>${expanded ? `<div class="floating-menu filter-menu" role="menu">${Object.entries(TASK_FILTER_LABELS).map(([value, label]) => `<button type="button" role="menuitemradio" aria-checked="${ui.taskFilter === value}" data-action="set-filter" data-filter="${value}">${label}${ui.taskFilter === value ? icon("check", 15) : ""}</button>`).join("")}</div>` : ""}</div>`;
}

export function taskRow(task, options = {}) {
  const selected = options.selectedTaskId === task.id;
  const menuOpen = options.menu?.type === "status" && options.menu.taskId === task.id;
  const anyMenuOpen = options.menu?.taskId === task.id;
  const category = dueCategory(task);
  return `<article class="task-row ${selected ? "is-selected" : ""} ${options.dateSelected ? "is-date-selected" : ""} ${anyMenuOpen ? "has-open-menu" : ""}" data-task-id="${escapeHtml(task.id)}" tabindex="0" aria-label="Abrir ${escapeHtml(task.title)}">
    <span class="task-radio ${task.status === "completed" ? "is-complete" : ""}">${task.status === "completed" ? icon("check", 13) : ""}</span>
    <div class="task-copy"><strong>${escapeHtml(task.title)}</strong>${options.showDescription && task.description ? `<small>${escapeHtml(task.description)}</small>` : ""}</div>
    ${task.dueDate ? `<span class="date-chip due-${category}">${icon("calendar", 14)}${escapeHtml(formatDate(task.dueDate, { year: true }))}</span>` : ""}
    <span class="status-wrap">${statusChip(task, menuOpen)}${menuOpen ? statusMenu(task) : ""}</span>
    <span class="task-time">${task.accumulatedSeconds ? escapeHtml(formatDuration(task.accumulatedSeconds, true)) : ""}</span>
    <button class="icon-button task-more" type="button" data-action="toggle-task-menu" data-task-id="${escapeHtml(task.id)}" aria-label="Más opciones para ${escapeHtml(task.title)}">${icon("more", 20)}</button>
    ${options.menu?.type === "task" && options.menu.taskId === task.id ? taskActionMenu(task) : ""}
  </article>`;
}

export function taskActionMenu(task) {
  return `<div class="floating-menu action-menu" role="menu">
    <button type="button" role="menuitem" data-action="edit-task" data-task-id="${escapeHtml(task.id)}">${icon("edit", 17)} Editar tarea</button>
    <button type="button" role="menuitem" class="danger-text" data-action="delete-task" data-task-id="${escapeHtml(task.id)}">${icon("trash", 17)} Eliminar tarea</button>
  </div>`;
}

export function projectCard(project, state, menu) {
  const stats = projectStats(state, project.id);
  const menuOpen = menu?.type === "project" && menu.projectId === project.id;
  return `<article class="project-card" tabindex="0" data-project-id="${escapeHtml(project.id)}" style="--project:${escapeHtml(project.color)}" aria-label="Abrir ${escapeHtml(project.name)}">
    <button class="icon-button card-menu" type="button" data-action="toggle-project-menu" data-project-id="${escapeHtml(project.id)}" aria-label="Opciones de ${escapeHtml(project.name)}">${icon("more", 22)}</button>
    ${menuOpen ? `<div class="floating-menu project-menu" role="menu"><button type="button" role="menuitem" data-action="edit-project" data-project-id="${escapeHtml(project.id)}">${icon("edit", 17)} Editar proyecto</button><button type="button" role="menuitem" class="danger-text" data-action="delete-project" data-project-id="${escapeHtml(project.id)}">${icon("trash", 17)} Eliminar proyecto</button></div>` : ""}
    <div class="project-card__top">${projectIcon(project, 38)}<div class="project-card__copy"><h3>${escapeHtml(project.name)}</h3><p>${escapeHtml(project.description || "Sin descripción")}</p></div></div>
    <div class="project-counts"><span><i class="status-ring"></i>${stats.pending} ${stats.pending === 1 ? "tarea pendiente" : "tareas pendientes"}</span><span><i class="status-check">${icon("check", 12)}</i>${stats.completed} ${stats.completed === 1 ? "tarea completada" : "tareas completadas"}</span></div>
    <div class="progress-row" aria-label="${stats.progress}% completado"><span class="progress-track"><span style="width:${stats.progress}%"></span></span><strong>${stats.progress}%</strong></div>
  </article>`;
}

export function dueNotice(tasks) {
  const near = tasks
    .filter((task) => task.dueDate && task.status !== "completed")
    .filter((task) => ["overdue", "urgent", "soon"].includes(dueCategory(task)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (!near.length) return "";
  return `<section class="due-notice" aria-labelledby="due-title"><span class="notice-icon">${icon("bell", 24)}</span><div><h2 id="due-title">Tienes ${near.length} ${near.length === 1 ? "tarea próxima" : "tareas próximas"} a vencer</h2><p>Revisa tus fechas y decide qué atender primero.</p></div><ul>${near.slice(0, 3).map((task) => `<li class="due-${dueCategory(task)}"><span></span><div><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(relativeDueLabel(task.dueDate))}</small></div></li>`).join("")}</ul></section>`;
}

export function learningTable(entries, state, scope = "project") {
  if (!entries.length) {
    return `<div class="empty-state compact">${icon("book", 27)}<strong>Aún no hay reflexiones</strong><p>Cuando detengas o completes una sesión y guardes su reflexión, aparecerá aquí.</p></div>`;
  }
  return `<div class="table-scroll"><table class="learning-table"><thead><tr><th>${scope === "task" ? "Sesión" : "Clase / Sesión"}</th><th>Qué aprendí</th><th>${scope === "task" ? "Qué me faltó por responder" : "Qué no entendí"}</th>${scope === "task" ? "<th>Siguiente sesión</th>" : ""}</tr></thead><tbody>${entries.map((entry, index) => {
    const task = state.tasks.find((item) => item.id === entry.taskId);
    const first = scope === "task"
      ? `Sesión ${index + 1}<small>${formatDate(entry.date, { year: true })}</small>`
      : `Clase ${index + 1}<small class="entry-task-title">${escapeHtml(task?.title || "Tarea")}</small><small>${formatDate(entry.date, { year: true })}</small>`;
    return `<tr><th scope="row">${first}</th><td>${escapeHtml(entry.learned)}</td><td>${escapeHtml(entry.unresolved)}</td>${scope === "task" ? `<td>${escapeHtml(entry.nextSession)}</td>` : ""}</tr>`;
  }).join("")}</tbody></table></div>`;
}

export function emptyProjects() {
  return `<div class="empty-state projects-empty">${icon("folder", 34)}<h2>Tu espacio está listo</h2><p>Crea tu primer proyecto y reúne allí todas sus tareas.</p><button class="primary-button" type="button" data-action="new-project">${icon("plus")} Crear proyecto</button></div>`;
}

export function projectFormDialog(project = null) {
  const isEdit = Boolean(project?.id);
  const title = isEdit ? "Editar proyecto" : "Nuevo proyecto";
  return `<dialog class="app-dialog" id="project-dialog" aria-labelledby="project-dialog-title"><form data-form="project" data-project-id="${escapeHtml(project?.id ?? "")}"><div class="dialog-heading"><div><p class="eyebrow">Organización</p><h2 id="project-dialog-title">${title}</h2></div><button class="icon-button" type="button" data-action="close-dialog" aria-label="Cerrar">${icon("x")}</button></div><label>Nombre del proyecto<input name="name" maxlength="80" required value="${escapeHtml(project?.name ?? "")}" placeholder="Ej. Curso de programación" autofocus /></label><label>Descripción <span>opcional</span><textarea name="description" maxlength="300" rows="3" placeholder="¿Qué quieres lograr?">${escapeHtml(project?.description ?? "")}</textarea></label><fieldset><legend>Icono</legend><div class="icon-options">${PROJECT_ICONS.map((name) => `<label title="${ICON_LABELS[name]}"><input type="radio" name="icon" value="${name}" aria-label="Icono: ${ICON_LABELS[name]}" ${(project?.icon ?? "folder") === name ? "checked" : ""}/><span>${icon(name, 22)}</span></label>`).join("")}</div></fieldset><fieldset><legend>Color</legend><div class="color-options">${PROJECT_COLORS.map((color) => `<label title="${color}"><input type="radio" name="color" value="${color}" aria-label="Color ${color}" ${(project?.color ?? PROJECT_COLORS[1]) === color ? "checked" : ""}/><span style="--swatch:${color}"></span></label>`).join("")}</div></fieldset><div class="dialog-actions"><button class="secondary-button" type="button" data-action="close-dialog">Cancelar</button><button class="primary-button" type="submit">${isEdit ? "Guardar cambios" : "Crear proyecto"}</button></div></form></dialog>`;
}

export function taskFormDialog(projectId, task = null) {
  const isEdit = Boolean(task?.id);
  return `<dialog class="app-dialog" id="task-dialog" aria-labelledby="task-dialog-title"><form data-form="task" data-project-id="${escapeHtml(projectId)}" data-task-id="${escapeHtml(task?.id ?? "")}"><div class="dialog-heading"><div><p class="eyebrow">Plan de estudio</p><h2 id="task-dialog-title">${isEdit ? "Editar tarea" : "Nueva tarea"}</h2></div><button class="icon-button" type="button" data-action="close-dialog" aria-label="Cerrar">${icon("x")}</button></div><label>Nombre de la tarea<input name="title" maxlength="100" required value="${escapeHtml(task?.title ?? "")}" placeholder="Ej. Resolver ejercicios" autofocus /></label><label>Descripción <span>opcional</span><textarea name="description" maxlength="500" rows="3" placeholder="Añade contexto o pasos importantes">${escapeHtml(task?.description ?? "")}</textarea></label><label>Fecha límite <span>opcional</span><input name="dueDate" type="date" value="${escapeHtml(task?.dueDate ?? "")}" /></label>${isEdit ? "" : `<label>Estado<select name="status"><option value="pending" ${task?.status === "pending" || !task?.status ? "selected" : ""}>Pendiente</option><option value="in_progress" ${task?.status === "in_progress" ? "selected" : ""}>En curso</option></select></label><p class="field-note">Para marcarla como completada, guarda primero una reflexión.</p>`}<div class="dialog-actions"><button class="secondary-button" type="button" data-action="close-dialog">Cancelar</button><button class="primary-button" type="submit">${isEdit ? "Guardar cambios" : "Crear tarea"}</button></div></form></dialog>`;
}

export function reflectionDialog(task, draft = {}, pending = {}) {
  const completesTask = (pending.kind ?? "completion") === "completion";
  const title = completesTask ? "Reflexiona antes de completar" : "Reflexión de la sesión";
  const hint = completesTask
    ? "La tarea se marcará como completada solo cuando guardes esta reflexión."
    : "La sesión y su tiempo ya están guardados. Puedes omitir la reflexión sin perderlos.";
  const submitLabel = completesTask ? "Guardar y completar" : "Guardar reflexión";
  return `<dialog class="app-dialog reflection-dialog" id="reflection-dialog" aria-labelledby="reflection-title"><form data-form="reflection"><div class="dialog-heading"><div><p class="eyebrow">Cierre de sesión</p><h2 id="reflection-title">${title}</h2><p>${escapeHtml(task?.title || "Tarea")}</p></div></div><label>¿Qué aprendí?<textarea name="learned" rows="3" maxlength="1200" required placeholder="Resume la idea más importante…" autofocus>${escapeHtml(draft.learned ?? "")}</textarea></label><label>¿Qué me faltó por responder / qué no entendí?<textarea name="unresolved" rows="3" maxlength="1200" required placeholder="Registra tus dudas para retomarlas…">${escapeHtml(draft.unresolved ?? "")}</textarea></label><label>¿Qué haré en la siguiente sesión?<textarea name="nextSession" rows="3" maxlength="1200" required placeholder="Define un siguiente paso concreto…">${escapeHtml(draft.nextSession ?? "")}</textarea></label><p class="form-hint">${hint}</p><div class="dialog-actions"><button class="secondary-button" type="button" data-action="cancel-reflection">${completesTask ? "Ahora no" : "Omitir"}</button><button class="primary-button" type="submit">${icon("check")} ${submitLabel}</button></div></form></dialog>`;
}

export function confirmDialog(confirmState) {
  return `<dialog class="app-dialog confirm-dialog" id="confirm-dialog" aria-labelledby="confirm-title"><div class="confirm-icon">${icon("trash", 25)}</div><h2 id="confirm-title">${escapeHtml(confirmState.title)}</h2><p>${escapeHtml(confirmState.message)}</p><div class="dialog-actions"><button class="secondary-button" type="button" data-action="cancel-confirm">Cancelar</button><button class="danger-button" type="button" data-action="confirm-action">${escapeHtml(confirmState.confirmLabel || "Eliminar")}</button></div></dialog>`;
}

import { calendarCells, monthLabel, toLocalDateKey, differenceInCalendarDays } from "../utils/time.js";
import { isDailyRecurringTask, isRecurringTaskActiveOn, isRecurringOccurrenceCompleted } from "../utils/recurrence.js";
import { escapeHtml as e } from "../utils/text.js";
import { globalTaskCard } from "../ui/components.js";

export function agendaTasks(state, { completed = false, projectId = "all", date = null } = {}, now = new Date()) {
  const today = toLocalDateKey(now);
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  return state.tasks.filter((task) => {
    if (!projects.has(task.projectId) || (projectId !== "all" && task.projectId !== projectId)) return false;
    const day = date || today;
    const daily = isDailyRecurringTask(task);
    if (completed) return (task.status === "completed" || (daily && isRecurringOccurrenceCompleted(task, day))) && (!date || daily || task.dueDate === date);
    if (projects.get(task.projectId).status === "completed" || task.status === "completed") return false;
    if (daily) return isRecurringTaskActiveOn(task, day) && !isRecurringOccurrenceCompleted(task, day);
    return !date || task.dueDate === date;
  }).map((task) => isDailyRecurringTask(task) ? { ...task, dueDate: date || today, agendaRecurrence: true, agendaCompleted: completed } : { ...task, agendaCompleted: completed })
    .sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")) || String(a.dueTime || "23:59").localeCompare(String(b.dueTime || "23:59")) || a.title.localeCompare(b.title));
}

export function agendaGroups(tasks, now = new Date()) {
  const labels = ["Vencidas", "Se entregan hoy", "Vence mañana", "Próximos 3 días", "Próxima semana", "Próximas a vencer", "Sin fecha"];
  const groups = labels.map((title) => ({ title, tasks: [] }));
  for (const task of tasks) {
    const days = task.dueDate ? differenceInCalendarDays(task.dueDate, now) : null;
    const index = days === null ? 6 : days < 0 ? 0 : days === 0 ? 1 : days === 1 ? 2 : days <= 3 ? 3 : days <= 7 ? 4 : 5;
    groups[index].tasks.push(task);
  }
  return groups;
}

export function agendaView(state, ui, now = new Date()) {
  const completed = ui.wsAgendaTab === "completed";
  const tasks = agendaTasks(state, { completed, projectId: ui.wsAgendaProject || "all", date: ui.wsAgendaDate }, now);
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const { year, month } = ui.wsCalendar;
  const calendar = `<div class="ws-calendar-head"><button type="button" data-action="ws-month" data-offset="-1" aria-label="Mes anterior">‹</button><strong>${e(monthLabel(year, month))}</strong><button type="button" data-action="ws-month" data-offset="1" aria-label="Mes siguiente">›</button><button type="button" data-action="ws-today">Hoy</button></div><div class="ws-calendar-grid">${["L", "M", "X", "J", "V", "S", "D"].map((day) => `<span>${day}</span>`).join("")}${calendarCells(year, month).map((cell) => {
    const count = agendaTasks(state, { completed, projectId: ui.wsAgendaProject || "all", date: cell.key }, now).length;
    return `<button type="button" data-action="ws-agenda-date" data-date="${cell.key}" class="${cell.inMonth ? "" : "outside"} ${ui.wsAgendaDate === cell.key ? "selected" : ""}" aria-pressed="${ui.wsAgendaDate === cell.key}" aria-label="${cell.key}, ${count} tareas">${cell.day}${count ? `<i>${count}</i>` : ""}</button>`;
  }).join("")}</div>`;
  const groups = completed ? [{ title: "Tareas completadas", tasks }] : agendaGroups(tasks, now);
  return `<aside class="global-tasks-sidebar ws-agenda" id="global-tasks-sidebar" aria-label="Agenda global"><header><div><span class="eyebrow">Todos tus proyectos</span><h2>Agenda</h2></div><button type="button" class="icon-button" data-action="toggle-right-sidebar" aria-label="Cerrar Agenda">×</button></header><div class="global-tasks-scroll"><div class="ws-tabs" aria-label="Tareas de la agenda"><button type="button" data-action="ws-agenda-tab" data-tab="pending" aria-pressed="${!completed}">Por hacer</button><button type="button" data-action="ws-agenda-tab" data-tab="completed" aria-pressed="${completed}">Completadas</button></div><label>Proyecto<select data-ws-agenda-project><option value="all">Todos los proyectos</option>${state.projects.map((p) => `<option value="${e(p.id)}" ${ui.wsAgendaProject === p.id ? "selected" : ""}>${e(p.name)}</option>`).join("")}</select></label><button type="button" class="ws-disclosure" data-action="ws-calendar-toggle" aria-expanded="${Boolean(ui.wsCalendarOpen)}">Calendario global ${ui.wsCalendarOpen ? "−" : "+"}</button>${ui.wsCalendarOpen ? calendar : ""}${ui.wsAgendaDate ? `<button type="button" class="secondary-button" data-action="ws-agenda-date" data-date="">Quitar fecha · ${e(ui.wsAgendaDate)}</button>` : ""}${groups.map((group) => `<section><div class="global-tasks-heading"><h3>${group.title}</h3><span>${group.tasks.length}</span></div>${group.tasks.length ? group.tasks.map((task) => globalTaskCard(task, projects.get(task.projectId), now)).join("") : '<p class="global-tasks-empty">Sin tareas en este apartado.</p>'}</section>`).join("")}</div></aside>`;
}

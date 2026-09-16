import { calendarCells, dueCategory, monthLabel, toLocalDateKey } from "../utils/time.js";
import { escapeHtml } from "../utils/text.js";
import { dueNotice, learningTable, projectIcon, taskFilterMenu, taskRow } from "../ui/components.js";
import { icon } from "../ui/icons.js";
import { projectEntries, projectTasks } from "../state/selectors.js";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function calendar(projectTaskList, ui) {
  const { year, month } = ui.calendar;
  const cells = calendarCells(year, month);
  const tasksByDate = new Map();
  projectTaskList.filter((task) => task.dueDate).forEach((task) => {
    const list = tasksByDate.get(task.dueDate) ?? [];
    list.push(task);
    tasksByDate.set(task.dueDate, list);
  });
  return `<section class="calendar-panel" aria-labelledby="calendar-title"><header><button class="icon-button outlined" type="button" data-action="calendar-prev" aria-label="Mes anterior">${icon("chevronLeft")}</button><h2 id="calendar-title">${monthLabel(year, month)}</h2><div><button class="icon-button outlined" type="button" data-action="calendar-next" aria-label="Mes siguiente">${icon("chevronRight")}</button><button class="today-button" type="button" data-action="calendar-today">Hoy</button></div></header><div class="calendar-weekdays">${WEEKDAYS.map((day) => `<span>${day}</span>`).join("")}</div><div class="calendar-grid">${cells.map((cell) => {
    const tasks = tasksByDate.get(cell.key) ?? [];
    const categories = [...new Set(tasks.map((task) => dueCategory(task)))];
    const primary = categories.includes("completed") && categories.length === 1 ? "completed" : categories.includes("overdue") || categories.includes("urgent") ? "urgent" : categories.includes("soon") ? "soon" : categories.includes("future") ? "future" : "";
    return `<button type="button" data-action="calendar-day" data-date="${cell.key}" class="calendar-day ${!cell.inMonth ? "outside" : ""} ${cell.isToday ? "today" : ""} ${ui.selectedDate === cell.key ? "selected" : ""} ${primary ? `has-${primary}` : ""}" aria-label="${cell.key}${tasks.length ? `, ${tasks.length} tareas` : ""}" ${tasks.length ? "" : "tabindex=\"-1\""}><span>${cell.day}</span>${categories.length ? `<i class="date-markers">${categories.slice(0, 3).map((category) => `<b class="due-${category}"></b>`).join("")}</i>` : ""}</button>`;
  }).join("")}</div><footer><strong>Fechas de entrega</strong><div><span><i class="legend-dot due-urgent"></i>Próxima</span><span><i class="legend-dot due-soon"></i>En unos días</span><span><i class="legend-dot due-future"></i>Más adelante</span><span><i class="legend-dot due-completed"></i>Completada</span></div></footer></section>`;
}

export function projectView(state, project, ui) {
  const allTasks = projectTasks(state, project.id);
  const filteredTasks = allTasks.filter((task) => {
    if (ui.taskFilter !== "all" && task.status !== ui.taskFilter) return false;
    if (ui.selectedDate && task.dueDate !== ui.selectedDate) return false;
    return true;
  });
  const entries = projectEntries(state, project.id);
  return `<section class="project-page${ui.animatePage ? " page-enter" : ""}" style="--project:${escapeHtml(project.color)}" aria-labelledby="project-title"><header class="project-heading"><button class="icon-button back-button" type="button" data-action="go-projects" aria-label="Volver a proyectos">${icon("chevronLeft", 25)}</button>${projectIcon(project, 29)}<div><h1 id="project-title">${escapeHtml(project.name)}</h1><p>${escapeHtml(project.description || "Sin descripción")}</p></div><button class="icon-button" type="button" data-action="toggle-project-menu" data-project-id="${project.id}" aria-label="Opciones del proyecto">${icon("more", 23)}</button>${ui.menu?.type === "project" && ui.menu.projectId === project.id ? `<div class="floating-menu project-menu" role="menu"><button type="button" role="menuitem" data-action="edit-project" data-project-id="${project.id}">${icon("edit", 17)} Editar proyecto</button><button type="button" role="menuitem" class="danger-text" data-action="delete-project" data-project-id="${project.id}">${icon("trash", 17)} Eliminar proyecto</button></div>` : ""}</header>
    <div class="project-overview"><div class="tasks-column">${dueNotice(allTasks)}<section class="tasks-panel" aria-labelledby="tasks-title"><header><div><h2 id="tasks-title">Próximas tareas</h2><p>Las fechas de entrega son opcionales.</p></div><button class="primary-button small" type="button" data-action="new-task" data-project-id="${project.id}">${icon("plus", 18)} Nueva tarea</button></header><div class="task-toolbar">${taskFilterMenu(ui)}${ui.selectedDate ? `<button class="selected-date-filter" type="button" data-action="clear-date-filter">${icon("calendar", 15)} ${ui.selectedDate} ${icon("x", 14)}</button>` : ""}</div><div class="task-list">${filteredTasks.length ? filteredTasks.map((task) => taskRow(task, { menu: ui.menu, dateSelected: ui.selectedDate === task.dueDate })).join("") : `<div class="empty-state compact">${icon("check", 25)}<strong>No hay tareas en esta vista</strong><p>Cambia el filtro o crea una nueva tarea.</p></div>`}</div></section></div>${calendar(allTasks, ui)}</div>
    <section class="learning-section"><header><div><span>${icon("book", 28)}</span><div><h2>Registro general de clases</h2><p>Resumen real de lo aprendido en este proyecto.</p></div></div><span class="entry-count">${entries.length} ${entries.length === 1 ? "entrada" : "entradas"}</span></header>${learningTable(entries, state, "project")}</section>
  </section>`;
}

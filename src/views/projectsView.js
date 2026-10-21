import { projectStats } from "../state/selectors.js";
import { escapeHtml, normalizeForSearch } from "../utils/text.js";
import { projectCard } from "../ui/components.js";
import { icon } from "../ui/icons.js";

function stat(iconName, value, label, accent) {
  return `<article class="stat-card" style="--stat:${accent}"><span class="stat-icon">${icon(iconName, 29)}</span><strong>${value}</strong><span>${label}</span></article>`;
}

export function projectsView(state, ui) {
  const query = normalizeForSearch(ui.search.trim());
  const allActiveProjects = state.projects.filter((project) => project.status !== "completed");
  const projects = allActiveProjects.filter((project) => normalizeForSearch(`${project.name} ${project.description}`).includes(query));
  const totals = state.projects.reduce((result, project) => {
    const stats = projectStats(state, project.id);
    if (project.status !== "completed") result.pending += stats.pending;
    result.completed += stats.completed;
    return result;
  }, { pending: 0, completed: 0 });
  const name = state.settings.profileName === "Estudiante" ? "" : `, ${escapeHtml(state.settings.profileName.split(" ")[0])}`;
  return `<section class="dashboard${ui.animatePage ? " page-enter" : ""}" aria-labelledby="page-title">
    <div class="page-heading"><div><p class="eyebrow">Panel personal</p><h1 id="page-title">¡Hola${name}!</h1><p>Aquí están tus proyectos. Organiza tus tareas y avanza en lo que te importa.</p></div><button class="primary-button" type="button" data-action="new-project">${icon("plus")} Nuevo proyecto</button></div>
    ${state.settings.seededDemo ? `<div class="demo-banner"><span>${icon("info", 18)}</span><p>Estás viendo datos de ejemplo. Puedes editarlos o empezar con un espacio vacío.</p><button type="button" data-action="reset-data">Empezar de cero</button></div>` : ""}
    <section class="stats" aria-label="Resumen de proyectos">${stat("folder", state.projects.length, "proyectos en total", "#347dff")}${stat("clock", totals.pending, "tareas pendientes", "#59a4ff")}${stat("check", totals.completed, "tareas completadas", "#31d98b")}${stat("activity", state.projects.filter((project) => project.status !== "completed").length, "proyectos activos", "#579eff")}</section>
    <div class="section-heading"><div><p class="eyebrow">Tu espacio de estudio</p><h2>Mis proyectos</h2></div><span class="view-label">${icon("grid", 17)} Cuadrícula</span></div>
    ${!allActiveProjects.length ? `<div class="empty-state projects-empty">${icon("folder", 34)}<h2>No tienes proyectos activos</h2><p>Crea uno nuevo o recupera un proyecto desde la sección de completados.</p><button class="primary-button" type="button" data-action="new-project">${icon("plus")} Crear proyecto</button></div>` : !projects.length ? `<div class="empty-state compact">${icon("search", 27)}<strong>No hay coincidencias</strong><p>Prueba con otro nombre o descripción.</p></div>` : `<section class="project-grid" aria-label="Proyectos activos">${projects.map((project) => projectCard(project, state, ui.menu)).join("")}${!query ? `<button class="new-project-card" type="button" data-action="new-project"><span>${icon("plus", 30)}</span><strong>Crear nuevo proyecto</strong><small>Organiza tus ideas y tareas</small></button>` : ""}</section>`}
  </section>`;
}

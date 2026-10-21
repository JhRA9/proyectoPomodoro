import { normalizeForSearch } from "../utils/text.js";
import { projectCard } from "../ui/components.js";
import { icon } from "../ui/icons.js";

export function completedProjectsView(state, ui) {
  const query = normalizeForSearch(ui.search.trim());
  const completed = state.projects
    .filter((project) => project.status === "completed")
    .filter((project) => normalizeForSearch(`${project.name} ${project.description}`).includes(query))
    .sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
  const total = state.projects.filter((project) => project.status === "completed").length;

  return `<section class="dashboard completed-projects-page${ui.animatePage ? " page-enter" : ""}" aria-labelledby="completed-projects-title">
    <div class="page-heading"><div><p class="eyebrow">Historial</p><h1 id="completed-projects-title">Proyectos completados</h1><p>Consulta lo que terminaste y reactiva cualquier proyecto cuando vuelvas a necesitarlo.</p></div><span class="completed-project-count" aria-label="${total} proyectos completados">${total}</span></div>
    ${!total ? `<div class="empty-state projects-empty">${icon("archive", 34)}<h2>Aún no hay proyectos completados</h2><p>Cuando completes un proyecto aparecerá aquí, con todas sus tareas y archivos intactos.</p></div>` : !completed.length ? `<div class="empty-state compact">${icon("search", 27)}<strong>No hay coincidencias</strong><p>Prueba con otro nombre o descripción.</p></div>` : `<section class="project-grid completed-project-grid" aria-label="Proyectos completados">${completed.map((project) => projectCard(project, state, ui.menu)).join("")}</section>`}
  </section>`;
}

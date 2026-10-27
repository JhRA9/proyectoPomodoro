import { areaContext, normalizeAreaSuggestions } from "../evaluation/areaSuggestions.js";
import { createId } from "../utils/id.js";
import { toLocalDateKey } from "../utils/time.js";
import { escapeHtml as e } from "../utils/text.js";

export class AreaSuggestionsController {
  constructor(workspace) {
    this.workspace = workspace; this.app = workspace.app;
    this.storage = workspace.storage; this.prefix = workspace.prefix + ":areas:";
    this.pending = new Map(); this.destroyed = false;
    this.app.ui.areaDrafts = {};
  }
  draft(projectId) {
    if (!this.app.ui.areaDrafts[projectId]) {
      let saved; try { saved = JSON.parse(this.storage?.getItem(this.prefix + projectId) || "null"); } catch { /* Use empty draft. */ }
      const draft = saved && Array.isArray(saved.rows) ? saved : { mode: "manual", context: "", rows: [] };
      draft.mode = ["manual", "gemini", "mixed"].includes(draft.mode) ? draft.mode : "manual";
      draft.context = typeof draft.context === "string" ? draft.context : "";
      draft.rows = draft.rows.filter((row) => row && typeof row.name === "string" && typeof row.description === "string" && typeof row.objectives === "string").slice(0, 24);
      draft.active = false;
      if (draft.status === "waiting") draft.status = "interrupted";
      this.app.ui.areaDrafts[projectId] = draft;
    }
    return this.app.ui.areaDrafts[projectId];
  }
  persist(projectId) {
    try { if (!this.storage) throw new Error("Storage unavailable"); this.storage.setItem(this.prefix + projectId, JSON.stringify(this.draft(projectId))); return true; }
    catch { this.app.addToast("No se pudo guardar el borrador de áreas en este navegador. No recargues antes de copiarlo.", "error"); return false; }
  }
  capture(form) {
    if (!form?.dataset?.areaSuggestions) return;
    const draft = this.draft(form.dataset.projectId);
    if (form.dataset.form === "area-request") draft.context = form.elements.context.value;
    if (form.dataset.form === "area-accept") for (const [index, row] of draft.rows.entries()) {
      for (const key of ["name", "description", "objectives"]) row[key] = form.elements[`${key}_${index}`]?.value ?? row[key];
      row.selected = Boolean(form.elements[`selected_${index}`]?.checked);
    }
    this.persist(form.dataset.projectId);
  }
  async action(action, target) {
    if (!action.startsWith("area-")) return false;
    const id = target.dataset.projectId, draft = this.draft(id);
    if (action === "area-mode") draft.mode = target.dataset.mode;
    if (action === "area-add" && draft.rows.length < 24) draft.rows.push({ name: "", description: "", objectives: "", selected: false, original: null });
    if (action === "area-remove") draft.rows.splice(Number(target.dataset.index), 1);
    if (action === "area-cancel") { this.pending.get(id)?.abort(); draft.status = "cancelled"; draft.message = "Espera cancelada. La propuesta anterior se conserva; puedes recuperar la solicitud o continuar manualmente."; }
    this.persist(id); this.app.render(); return true;
  }
  async submit(form) {
    if (!form?.dataset?.areaSuggestions) return false;
    this.capture(form);
    const id = form.dataset.projectId, draft = this.draft(id);
    if (form.dataset.form === "area-request") {
      if (!form.elements.consent.checked) { this.app.addToast("Confirma que quieres enviar únicamente este contexto a Gemini.", "error"); return true; }
      await this.request(id); return true;
    }
    if (form.dataset.form === "area-accept") {
      const selected = draft.rows.filter((row) => row.selected);
      const success = await this.app.safely(async () => {
        if (!selected.length) throw new Error("Selecciona al menos un área. Ninguna propuesta se acepta automáticamente.");
        const result = await this.app.repository.createCompetencies(id, selected, { deduplicate: true, provenance: { method: draft.mode } });
        this.app.addToast(`${result.created.length} áreas añadidas Sin evaluar. ${result.skipped} duplicadas omitidas.`);
      });
      if (success) { draft.rows = draft.rows.filter((row) => !row.selected); this.persist(id); this.app.render(); }
      return true;
    }
    return false;
  }
  async request(id) {
    if (this.pending.has(id)) return;
    const draft = this.draft(id), repo = this.app.repository;
    let controller, logId;
    try {
      if (!this.app.aiEvaluator?.supportsAreaSuggestions) throw new Error("Gemini no está habilitado para sugerir áreas. Puedes continuar manualmente.");
      const context = areaContext(draft.context);
      const retry = draft.requestContext === context && Boolean(draft.requestId);
      if (!retry && draft.rows.length > 12) throw new Error("Guarda o retira algunas propuestas antes de solicitar más áreas.");
      if (!retry) { draft.requestId = createId("area-request"); draft.requestContext = context; }
      // Persist the identity before sending so reload/retry cannot create a new paid request accidentally.
      if (!this.persist(id)) return;
      controller = new AbortController(); this.pending.set(id, controller);
      logId = createId("ai-request");
      await repo.commit((state) => {
        const project = state.projects.find((p) => p.id === id);
        if (!project) throw new Error("El proyecto ya no existe.");
        const day = toLocalDateKey(repo.clock());
        if (state.aiRequests.filter((r) => r.projectId === id && toLocalDateKey(new Date(r.createdAt)) === day).length >= project.evaluationConfig.maxRequestsPerDay) throw new Error("Se alcanzó el límite diario del proyecto. Puedes continuar manualmente.");
        state.aiRequests.push({ id: logId, projectId: id, kind: "area-suggestions", requestId: draft.requestId, provider: "gemini", status: "pending", createdAt: repo.clock().toISOString(), latencyMs: null, inputTokens: null, outputTokens: null });
      });
      draft.active = true; draft.status = "waiting"; draft.message = "Enviando el contexto…"; this.persist(id); this.app.render();
      const response = await this.app.aiEvaluator.suggestAreas({ context, requestId: draft.requestId, retry, signal: controller.signal,
        onState: (phase) => { if (controller.signal.aborted || this.destroyed) return; draft.message = phase === "waiting" ? "Solicitud enviada. Esperando la propuesta de Gemini…" : "Propuesta recibida. Comprobando su formato…"; this.app.render(); } });
      if (controller.signal.aborted || this.destroyed) return;
      const areas = normalizeAreaSuggestions(response.areas);
      const source = { provider: "gemini", model: response.model, promptVersion: response.promptVersion, requestId: draft.requestId };
      if (draft.receivedRequestId !== draft.requestId) draft.rows = [...draft.rows, ...areas.map((area) => ({ ...area, objectives: area.objectives.join("\n"), selected: false, original: area, source }))].slice(0, 24);
      draft.receivedRequestId = draft.requestId;
      Object.assign(draft, { provider: "gemini", model: response.model, promptVersion: response.promptVersion, status: "received", message: "Revisa, edita y selecciona las áreas que quieras guardar. Ninguna está aceptada." });
      await repo.commit((state) => { const log = state.aiRequests.find((r) => r.id === logId); if (log) Object.assign(log, { status: "completed", model: response.model, inputTokens: response.usage?.inputTokens ?? null, outputTokens: response.usage?.outputTokens ?? null }); });
    } catch (error) {
      if (!this.destroyed) { draft.status = controller?.signal.aborted ? "cancelled" : "failed"; draft.message = error.message || "No se pudo recibir la propuesta. Continúa manualmente."; }
    } finally {
      if (!this.destroyed) {
        if (logId && draft.status !== "received") await repo.commit((state) => { const log = state.aiRequests.find((r) => r.id === logId); if (log) { log.status = "failed"; log.error = draft.message; } }).catch(() => this.app.addToast("No se pudo guardar el estado de la solicitud.", "error"));
        draft.active = false; this.pending.delete(id); this.persist(id); this.app.render();
      }
    }
  }
  destroy() { this.destroyed = true; for (const controller of this.pending.values()) controller.abort(); }
}

export function areaSuggestionsView(project, draft = {}, enabled = false) {
  const id = e(project.id), mode = draft.mode || "manual";
  return `<section class="progress-card ws-area-builder" aria-label="Definir áreas evaluables"><h2>Definir áreas evaluables</h2><p>Las áreas nuevas comienzan Sin evaluar. El historial de otra persona nunca determina tu nivel.</p><div class="ws-tabs" aria-label="Método para crear áreas">${[["manual","Manual"],["gemini","Sugerencias de Gemini"],["mixed","Mixto"]].map(([key,label]) => `<button type="button" data-action="area-mode" data-project-id="${id}" data-mode="${key}" aria-pressed="${mode === key}">${label}</button>`).join("")}</div>${mode === "manual" ? '<p>Usa el formulario Nueva competencia de abajo. No se envía información a ningún proveedor.</p>' : `<p>${mode === "mixed" ? "Gemini puede proponer; tú seleccionas, editas o agregas tus propias áreas." : "Solicita una propuesta, revísala y confirma únicamente las áreas que elijas."}</p>${!enabled ? '<p role="status">Gemini no está habilitado en este entorno. Puedes añadir áreas manualmente o usar el método mixto sin IA.</p>' : ""}<form data-form="area-request" data-area-suggestions="true" data-project-id="${id}"><label>Contexto para Gemini<textarea name="context" rows="4" maxlength="2000" ${draft.active ? "readonly" : ""}>${e(draft.context || "")}</textarea></label><p>Solo se enviará este texto, sin adjuntos, notas, historial ni datos de cuenta. Evita información personal o confidencial.</p><label class="checkbox-field"><input type="checkbox" name="consent" required /> Quiero enviar este contexto a Gemini</label><button type="submit" class="secondary-button" ${!enabled || draft.active ? "disabled" : ""}>${draft.requestContext === draft.context?.trim() && draft.requestId ? "Recuperar / reintentar propuesta" : "Solicitar propuesta"}</button>${draft.active ? `<button type="button" class="secondary-button" data-action="area-cancel" data-project-id="${id}">Cancelar espera</button>` : ""}</form>${draft.message ? `<p role="status" aria-live="polite">${e(draft.message)}</p>` : ""}${draft.status === "interrupted" ? '<p role="status">La espera se interrumpió. Recuperar usa la misma solicitud para evitar duplicarla.</p>' : ""}<form data-form="area-accept" data-area-suggestions="true" data-project-id="${id}">${(draft.rows || []).map((row,index) => `<fieldset class="ws-area-proposal"><legend>Área propuesta ${index+1}${row.original ? " · Gemini" : " · Manual"}</legend><label class="checkbox-field"><input type="checkbox" name="selected_${index}" ${row.selected ? "checked" : ""} /> Seleccionar esta área</label><label>Nombre del área ${index+1}<input name="name_${index}" value="${e(row.name)}" maxlength="100" /></label><label>Descripción del área ${index+1}<textarea name="description_${index}" maxlength="500">${e(row.description)}</textarea></label><label>Objetivos del área ${index+1}, uno por línea<textarea name="objectives_${index}" maxlength="1200">${e(row.objectives)}</textarea></label><button type="button" class="secondary-button" data-action="area-remove" data-project-id="${id}" data-index="${index}">Retirar propuesta ${index+1}</button></fieldset>`).join("") || '<p class="progress-empty">Todavía no hay propuestas. Puedes solicitarlas o añadir un área propia en Mixto.</p>'}<div class="ws-actions">${mode === "mixed" ? `<button type="button" class="secondary-button" data-action="area-add" data-project-id="${id}" ${(draft.rows || []).length >= 24 ? "disabled" : ""}>Añadir área propia</button>` : ""}<button type="submit" class="primary-button" ${!(draft.rows || []).length || draft.active ? "disabled" : ""}>Guardar áreas seleccionadas</button></div><p>Solo se añadirán las seleccionadas. Los nombres ya existentes en este proyecto se omiten, sin sobrescribirlos.</p></form>`}</section>`;
}

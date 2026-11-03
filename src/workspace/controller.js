import { WorkspaceDrafts, workspaceEnabled } from "./preferences.js";
import { beginAttempt, reserveAttemptRequests, saveAttemptResponse, resolveAttempt, recordManualAttempt, reviseExercise, verifyEvidence, migrationBackup, restoreMigrationBackup, migrateAttempts } from "../evaluation/attempts.js";
import { toLocalDateKey } from "../utils/time.js";
import { normalizeForSearch } from "../utils/text.js";
import { AreaSuggestionsController } from "./areaSuggestions.js";
import { WorkspacePanels } from "./panels.js";
import { PlanningController } from "../planning/controller.js";

export class WorkspaceController {
  constructor(app, context = {}) {
    this.app = app;
    this.storage = context.layoutStorage ?? globalThis.localStorage;
    this.enabled = context.workspaceV2 ?? workspaceEnabled(this.storage);
    this.prefix = `studyhub:workspace:2:${encodeURIComponent(app.account?.id || "local")}`;
    this.drafts = new WorkspaceDrafts(context.draftStorage ?? this.storage, app.account?.id || "local");
    this.controllers = new Map();
    this.launching = false;
    this.backStack = [];
    this.lastPath = null;
    this.formCaptureSuppressed = false;
    this.areas = new AreaSuggestionsController(this);
    this.planning = new PlanningController(this);
    this.panels = new WorkspacePanels(this);
    const now = new Date();
    Object.assign(app.ui, { workspaceV2: this.enabled, wsAgendaTab: "pending", wsAgendaProject: "all", wsCalendar: { year: now.getFullYear(), month: now.getMonth() }, wsRequests: {} });
    if (this.enabled && !this.storage?.getItem(app.layoutStorageKey)) {
      app.ui.leftSidebarOpen = globalThis.matchMedia?.("(min-width: 1101px)").matches ?? true;
      app.ui.rightSidebarOpen = false;
    }
    try { Object.assign(app.ui, JSON.parse(this.storage?.getItem(this.prefix + ":preferences") || "{}")); } catch { /* Defaults remain usable. */ }
  }
  persist() {
    const ui = this.app.ui;
    const preferences = Object.fromEntries(["wsProgressTab", "wsAgendaTab", "wsAgendaProject", "wsCalendarOpen"].map((key) => [key, ui[key]]));
    try { this.storage?.setItem(this.prefix + ":preferences", JSON.stringify(preferences)); } catch { /* Navigation does not depend on writable storage. */ }
  }
  capture() {
    if (!this.enabled || this.formCaptureSuppressed) return;
    for (const form of this.app.root.querySelectorAll?.("[data-workspace-draft]") || []) this.drafts.capture(form);
    this.openDetails = new Map([...(this.app.root.querySelectorAll?.("details") || [])].map((element) => [this.detailKey(element), element.open]));
    this.detailsPath = this.lastPath;
    const active = globalThis.document?.activeElement;
    const form = active?.closest?.("form");
    this.focus = active && this.app.root.contains?.(active) ? { name: active.name, form: form ? this.drafts.key(form) : null, dataset: { ...active.dataset }, start: active.selectionStart, end: active.selectionEnd } : null;
  }
  restore() {
    if (!this.enabled) return;
    this.drafts.restore(this.app.root);
    if (this.detailsPath === this.lastPath) for (const element of this.app.root.querySelectorAll("details")) { const key = this.detailKey(element); if (this.openDetails?.has(key)) element.open = this.openDetails.get(key); }
    if (this.focus?.name) {
      const form = [...this.app.root.querySelectorAll("form")].find((f) => this.drafts.key(f) === this.focus.form);
      const element = [...(form?.elements || [])].find((x) => x.name === this.focus.name);
      element?.focus({ preventScroll: true });
      try { element?.setSelectionRange(this.focus.start, this.focus.end); } catch { /* Selects and numbers have no text selection. */ }
    } else if (this.focus?.dataset?.action) {
      const element = [...this.app.root.querySelectorAll("[data-action]")].find((el) => Object.entries(this.focus.dataset).every(([key, value]) => el.dataset[key] === value));
      element?.focus({ preventScroll: true });
    }
    if (this.routeChanged) { const heading = this.app.root.querySelector("main h1"); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } }
    this.panels.sync(this.routeChanged);
    this.routeChanged = false;
    this.formCaptureSuppressed = false;
    this.galleryObserver?.disconnect();
    const gallery = this.app.root.querySelector(".ws-gauge-scroll");
    if (gallery) {
      const update = () => {
        const buttons = this.app.root.querySelectorAll('[data-action="ws-gallery"]');
        for (const button of buttons) button.disabled = Number(button.dataset.direction) < 0 ? gallery.scrollLeft <= 1 : gallery.scrollLeft + gallery.clientWidth >= gallery.scrollWidth - 1;
      };
      gallery.addEventListener("scroll", update, { passive: true });
      if (globalThis.ResizeObserver) { this.galleryObserver = new ResizeObserver(update); this.galleryObserver.observe(gallery); }
      update();
    }
  }
  detailKey(element) {
    const form = element.querySelector("form");
    return `${element.querySelector("summary")?.textContent || ""}:${form ? this.drafts.key(form) : ""}`;
  }
  route(route) {
    if (route.projectId) this.areas.draft(route.projectId);
    const path = [route.name, route.projectId, route.taskId].filter(Boolean).join(":");
    if (path === this.lastPath) return;
    this.routeChanged = Boolean(this.lastPath);
    if (this.routeChanged && this.panels.media?.matches) { this.app.ui.leftSidebarOpen = false; this.app.ui.rightSidebarOpen = false; }
    if (this.lastPath && !this.goingBack) this.backStack.push(this.lastRoute);
    if (route.projectId !== this.lastRoute?.projectId) { this.app.ui.wsArea = "all"; this.app.ui.wsHistoryPage = 0; }
    this.lastPath = path; this.lastRoute = route; this.goingBack = false;
  }
  path(route) {
    if (route.name === "plan") return `projects/${encodeURIComponent(route.projectId)}/plan`;
    if (route.name.startsWith("workspace-")) return route.name.slice(10);
    if (route.name === "completedProjects") return "completed";
    return `projects${route.projectId ? `/${encodeURIComponent(route.projectId)}` : ""}${route.name === "progress" ? "/progress" : route.taskId ? `/tasks/${encodeURIComponent(route.taskId)}` : ""}`;
  }
  change(event) {
    if (!this.enabled) return false;
    this.areas.capture(event.target.closest?.("form"));
    this.drafts.capture(event.target.closest?.("form"));
    const ui = this.app.ui;
    if (event.target.matches?.("[data-ws-area]")) { ui.wsArea = event.target.value; ui.wsHistoryPage = 0; }
    else if (event.target.matches?.("[data-ws-agenda-project]")) ui.wsAgendaProject = event.target.value;
    else return false;
    this.persist(); this.app.render(); return true;
  }
  async action(action, target) {
    if (action === "ws-toggle") {
      this.capture(); this.enabled = !this.enabled; this.app.ui.workspaceV2 = this.enabled;
      try { this.storage?.setItem("studyhub:workspaceV2", String(this.enabled)); } catch { /* Session toggle still works. */ }
      const url = new URL(globalThis.location.href); url.searchParams.delete("workspaceV2"); globalThis.history.replaceState(null, "", url);
      this.app.ui.settingsOpen = false;
      this.app.router.navigate(this.enabled ? "home" : "projects"); this.app.render(); return true;
    }
    if (!this.enabled) return false;
    if (await this.planning.action(action, target)) return true;
    if (await this.areas.action(action, target)) return true;
    const app = this.app, ui = app.ui, repo = app.repository, state = repo.getState();
    if (action === "recommendation-to-task") {
      const existing = state.tasks.find((x) => x.projectId === target.dataset.projectId && normalizeForSearch(x.title) === normalizeForSearch(String(target.dataset.recommendation || "").slice(0, 120)));
      if (existing) { app.addToast("Esta recomendación ya tiene una tarea. Se abrió la existente."); app.router.navigate(`projects/${existing.projectId}/tasks/${existing.id}`); return true; }
      return false;
    }
    if (!action.startsWith("ws-")) return false;
    switch (action) {
      case "ws-back": { this.goingBack = true; const route = this.backStack.pop(); app.router.navigate(route ? this.path(route) : "home"); break; }
      case "ws-progress-tab": ui.wsProgressTab = target.dataset.tab; break;
      case "ws-select-area": ui.wsArea = target.dataset.areaId; ui.wsHistoryPage = 0; break;
      case "ws-history-page": ui.wsHistoryPage = Math.max(0, Number(target.dataset.page) || 0); break;
      case "ws-gallery": app.root.querySelector(".ws-gauge-scroll")?.scrollBy({ left: Number(target.dataset.direction) * 260, behavior: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); return true;
      case "ws-learning": ui.wsProjectTab = "learning"; app.router.navigate(`projects/${target.dataset.projectId}`); break;
      case "ws-tasks": ui.wsProjectTab = "tasks"; break;
      case "ws-agenda-tab": ui.wsAgendaTab = target.dataset.tab; break;
      case "ws-calendar-toggle": ui.wsCalendarOpen = !ui.wsCalendarOpen; break;
      case "ws-month": { const month = new Date(ui.wsCalendar.year, ui.wsCalendar.month + Number(target.dataset.offset), 1); ui.wsCalendar = { year: month.getFullYear(), month: month.getMonth() }; break; }
      case "ws-today": { const now = new Date(); ui.wsCalendar = { year: now.getFullYear(), month: now.getMonth() }; ui.wsAgendaDate = toLocalDateKey(now); break; }
      case "ws-agenda-date": ui.wsAgendaDate = target.dataset.date === ui.wsAgendaDate ? null : target.dataset.date || null; break;
      case "ws-ai-preview": ui.wsPreview = { exerciseId: target.dataset.exerciseId, provider: target.dataset.provider, attemptId: target.dataset.attemptId || null }; break;
      case "ws-ai-preview-close": ui.wsPreview = null; break;
      case "ws-edit-exercise": ui.wsEditingExercise = target.dataset.exerciseId; ui.wsPreview = null; break;
      case "ws-edit-exercise-close": ui.wsEditingExercise = null; break;
      case "ws-delete-evidence": {
        const evidence = state.evidence.find((item) => item.id === target.dataset.evidenceId);
        if (!evidence) return true;
        ui.confirm = { type: "delete-evidence", id: evidence.id, title: "¿Eliminar esta evidencia?", message: `Se eliminará “${evidence.title}” y su verificación. Los intentos y sus revisiones se conservarán; los indicadores se recalcularán.`, confirmLabel: "Eliminar evidencia" };
        break;
      }
      case "ws-ai-send": void this.send(); return true;
      case "ws-ai-cancel": { const controller = this.controllers.get(target.dataset.requestId); controller?.abort(); const request = ui.wsRequests[target.dataset.requestId]; if (request) { request.active = false; request.message = "Espera cancelada. El proveedor podría seguir procesando; reintentar recupera el mismo intento."; } break; }
      case "ws-migration-prepare": await app.safely(async () => {
        this.preparedBackup = migrationBackup(state);
        const serialized = JSON.stringify(this.preparedBackup);
        this.storage.setItem(this.prefix + ":migration", serialized);
        const verified = restoreMigrationBackup(JSON.parse(this.storage.getItem(this.prefix + ":migration")));
        if (JSON.stringify(verified) !== JSON.stringify(state)) throw new Error("No se pudo verificar la copia. No se ha modificado ningún dato.");
        app.downloadText(serialized, "studyhub-antes-de-intentos-v2.json", "application/json"); ui.wsMigrationPrepared = true;
      }); break;
      case "ws-migration-apply": await app.safely(async () => {
        if (!ui.wsMigrationPrepared || !this.preparedBackup || JSON.stringify(state) !== this.preparedBackup.serialized) throw new Error("Los datos cambiaron. Prepara otra copia antes de convertir.");
        await repo.commit((next) => { const migrated = migrateAttempts(next); next.evaluations = migrated.evaluations; next.evaluationModelVersion = 2; });
        this.storage.setItem(this.prefix + ":migration-revision", String(repo.getState().revision)); ui.wsMigrationPrepared = false;
        app.addToast("Historial convertido sin fusionar intentos. La copia anterior está disponible.");
      }); break;
      case "ws-migration-rollback": await app.safely(async () => {
        if (String(state.revision) !== this.storage?.getItem(this.prefix + ":migration-revision")) throw new Error("Hay cambios posteriores o no existe una conversión reversible. Exporta una copia actual antes de restaurar manualmente; no se reemplazaron tus datos.");
        const restored = restoreMigrationBackup(JSON.parse(this.storage.getItem(this.prefix + ":migration")));
        await repo.commit((next) => { next.evaluations = restored.evaluations; if (restored.evaluationModelVersion) next.evaluationModelVersion = restored.evaluationModelVersion; else delete next.evaluationModelVersion; });
        this.storage.removeItem(this.prefix + ":migration-revision"); app.addToast("Se revirtió la conversión del historial.");
      }); break;
    }
    this.persist(); app.render(); return true;
  }

  async submit(form, data) {
    if (this.enabled && await this.planning.submit(form, data)) return true;
    if (this.enabled && await this.areas.submit(form)) return true;
    if (!this.enabled || !form.matches("[data-workspace-draft]")) return false;
    const app = this.app, repo = app.repository;
    const handlers = {
      competency: () => repo.createCompetency(form.dataset.projectId, data),
      exercise: () => repo.createExercise(form.dataset.projectId, { ...data, competencyIds: new FormData(form).getAll("competencyIds"), independenceDeclared: form.elements.independenceDeclared.checked }),
      "manual-evaluation": () => recordManualAttempt(repo, form.dataset.exerciseId, data),
      "ws-exercise-revision": () => reviseExercise(repo, form.dataset.exerciseId, data),
      evidence: () => { const [targetType, targetId] = data.target.split(":"); return repo.createEvidence(form.dataset.projectId, { ...data, targetType, targetId, competencyIds: new FormData(form).getAll("competencyIds") }); },
      "evaluation-settings": () => repo.updateEvaluationSettings(form.dataset.projectId, data),
      "rubric-settings": () => repo.updateRubric(form.dataset.projectId, repo.getState().projects.find((p) => p.id === form.dataset.projectId).evaluationConfig.rubric.criteria.map((c) => ({ ...c, weight: Number(data[`weight_${c.id}`]) }))),
      "delivery-stage": () => repo.createDeliveryStage(form.dataset.projectId, data),
      deliverable: () => repo.createDeliverable(form.dataset.projectId, { ...data, dependencyIds: new FormData(form).getAll("dependencyIds") }),
      "deliverable-status": () => repo.updateDeliverableStatus(form.dataset.deliverableId, data.status, data.blockingReason),
      "ws-resolution": () => resolveAttempt(repo, form.dataset.attemptId, { ...data, actor: app.account?.email || repo.getState().settings.profileName || "Usuario" }),
      "ws-verification": () => verifyEvidence(repo, form.dataset.evidenceId, { ...data, independenceVerified: form.elements.independenceVerified.checked }),
      "ws-weekly": () => repo.saveWeeklyReview(form.dataset.projectId,data,app.account?.id||"local"),
    };
    if (!handlers[form.dataset.form]) return false;
    const success = await app.safely(handlers[form.dataset.form]);
    if (success) {
      if (form.dataset.form === "ws-exercise-revision") app.ui.wsEditingExercise = null;
      this.drafts.clear(form); this.formCaptureSuppressed = true; this.focus = null;
      app.render(); app.addToast("Cambios guardados.");
    }
    return true;
  }

  async send() {
    const app = this.app, repo = app.repository, preview = app.ui.wsPreview;
    if (!preview || this.launching) return;
    this.launching = true;
    let attempt, controller, request;
    try {
      if (!app.aiEvaluator?.supportsAttemptRequests) throw new Error("La evaluación segura de StudyHub 2.0 requiere actualizar la función y el registro de solicitudes de Supabase. Puedes usar la evaluación manual mientras tanto.");
      const state = repo.getState();
      const exercise = state.exercises.find((x) => x.id === preview.exerciseId);
      const project = state.projects.find((p) => p.id === exercise?.projectId);
      if (!project) throw new Error("El ejercicio ya no existe.");
      if (project.evaluationConfig.privacy === "private" && (exercise.code || exercise.files?.length)) throw new Error("El modo privado impide enviar código o archivos.");
      let providers = preview.provider === "both" ? ["gemini", "cloudflare"] : [preview.provider];
      attempt = await beginAttempt(repo, exercise.id, preview.provider, preview.attemptId);
      if (this.controllers.has(attempt.id)) throw new Error("Este intento ya está en curso.");
      providers = providers.filter((p) => !attempt.reviews.some((r) => r.provider === p));
      if (!providers.length) { app.ui.wsPreview = null; app.ui.wsProgressTab = "history"; app.addToast("Esta entrega ya tiene las revisiones solicitadas. Se abrió su historial."); return; }
      await reserveAttemptRequests(repo, attempt.id, providers);
      controller = new AbortController(); this.controllers.set(attempt.id, controller);
      request = { id: attempt.id, projectId: project.id, title: exercise.title, active: true, message: "Enviando la solución…" };
      app.ui.wsRequests[attempt.id] = request; app.ui.wsPreview = null; app.render();
      const outcomes = await Promise.allSettled(providers.map(async (provider) => {
        const response = await app.aiEvaluator.evaluate({ project, exercise: attempt.evidenceSnapshot,
          competencies: state.competencies.filter((c) => attempt.competencyIds.includes(c.id)), provider,
          profile: attempt.profile, requestId: `${attempt.id}:${provider}`, retry: Boolean(preview.attemptId), signal: controller.signal,
          onState: (phase) => { if (controller.signal.aborted) return; request.message = phase === "waiting" ? "Solicitud enviada. Esperando respuesta del proveedor…" : "Respuesta recibida. Validando y guardando…"; app.render(); } });
        if (controller.signal.aborted) return;
        await saveAttemptResponse(repo, attempt.id, response);
        if (response.errors?.length) throw new Error(response.errors.map((x) => x.message).join(" · "));
      }));
      if (this.destroyed) return;
      const errors = outcomes.flatMap((result, i) => result.status === "rejected" ? [{ provider: providers[i], message: result.reason?.message || "Solicitud fallida" }] : []);
      if (controller.signal.aborted) errors.push(...providers.map((provider) => ({ provider, message: "Espera cancelada. Reintenta para recuperar la respuesta del mismo intento." })));
      if (errors.length) await saveAttemptResponse(repo, attempt.id, { errors });
      request.message = controller.signal.aborted ? "Espera cancelada. Se conserva el intento para reintentar." : errors.length ? "Hay revisiones pendientes o fallidas. Consulta el historial para reintentar." : "Revisiones guardadas. Consulta el historial.";
      app.ui.wsProgressTab = "history";
    } catch (error) {
      if (attempt && !controller && !this.controllers.has(attempt.id)) {
        await saveAttemptResponse(repo, attempt.id, { errors: attempt.requestedProviders.filter((provider) => !attempt.reviews.some((review) => review.provider === provider)).map((provider) => ({ provider, message: error.message || "No se pudo enviar la solicitud." })) });
      }
      if (request) request.message = error.message;
      app.addToast(error.message || "No se pudo evaluar la solución.", "error");
    } finally {
      this.launching = false;
      if (request) request.active = false;
      if (attempt) this.controllers.delete(attempt.id);
      if (!this.destroyed) app.render();
    }
  }
  destroy() { this.destroyed = true; this.areas.destroy(); this.panels.destroy(); this.galleryObserver?.disconnect(); for (const controller of this.controllers.values()) controller.abort(); }
}

import { LocalStorageAdapter } from "../data/localAdapter.js";
import { CloudStorageAdapter, SupabaseStateGateway } from "../data/cloudAdapter.js";
import { StudyHubRepository } from "../data/repository.js";
import { mountAuthGate } from "../cloud/authGate.js";
import { StudyHubAuth, createStudyHubSupabaseClient, readSupabaseConfig } from "../cloud/supabase.js";
import { TaskFileStore } from "../cloud/taskFiles.js";
import { createRouter } from "../router.js";
import { createStore } from "../state/store.js";
import { TimerController } from "../timer/timerController.js";
import { formatDuration, formatFocusTimer, toLocalDateKey } from "../utils/time.js";
import { escapeHtml, normalizeForSearch } from "../utils/text.js";
import { MAX_LEARNING_IMAGES, prepareLearningImage } from "../utils/learningImages.js";
import { focusView } from "../views/focusView.js";
import { projectView } from "../views/projectView.js";
import { projectsView } from "../views/projectsView.js";
import { registerStudyHubTools } from "../webmcp.js";
import { brand, confirmDialog, migrationDialog, projectFormDialog, reflectionDialog, taskFormDialog } from "./components.js";
import { icon } from "./icons.js";
import { LearningDraftStore, normalizeLearningDraft } from "./learningDrafts.js";

function initialUiState(learningDrafts = {}) {
  const today = new Date();
  return {
    search: "",
    projectSearch: "",
    taskFilter: "all",
    selectedDate: null,
    calendar: { year: today.getFullYear(), month: today.getMonth() },
    menu: null,
    dialog: null,
    confirm: null,
    pendingImport: null,
    focusLearningTab: "draft",
    learningDrafts,
    taskFiles: null,
    filesEnabled: false,
    settingsOpen: false,
    settingsAnchor: null,
    dimTheme: false,
    syncStatus: { state: "local", pending: false, message: "Guardado en este dispositivo" },
    toasts: [],
  };
}

function shellSidebar(state, route, ui, account) {
  if (route.name === "projects") {
    const sidebarSettingsOpen = ui.settingsOpen && ui.settingsAnchor === "sidebar";
    return `<aside class="sidebar dashboard-sidebar">${brand()}<nav class="main-nav" aria-label="Navegación principal"><a class="active" href="#/projects" aria-label="Proyectos">${icon("grid")}<span>Proyectos</span></a><button type="button" data-action="export-backup" aria-label="Exportar copia">${icon("download")}<span>Exportar copia</span></button><button type="button" data-action="import-backup" aria-label="Importar copia">${icon("upload")}<span>Importar copia</span></button><button type="button" data-action="open-settings" data-settings-anchor="topbar" aria-label="Ajustes">${icon("settings")}<span>Ajustes</span></button></nav><blockquote>“Disciplina hoy,<br />resultados mañana.”</blockquote><div class="profile"><span>SH</span><strong>${escapeHtml(state.settings.profileName)}</strong><button class="icon-button" type="button" data-action="open-settings" data-settings-anchor="sidebar" aria-haspopup="menu" aria-expanded="${sidebarSettingsOpen}" aria-label="Abrir ajustes">${icon("settings", 19)}</button>${sidebarSettingsOpen ? settingsMenu(state, account, ui.syncStatus) : ""}</div></aside>`;
  }
  const projectQuery = normalizeForSearch(ui.projectSearch);
  const filtered = state.projects.filter((project) => normalizeForSearch(`${project.name} ${project.description}`).includes(projectQuery));
  return `<aside class="sidebar project-sidebar">${brand()}<label class="sidebar-search">${icon("search", 19)}<span class="sr-only">Buscar proyectos</span><input type="search" data-input="project-search" value="${escapeHtml(ui.projectSearch)}" placeholder="Buscar proyectos…" /></label><nav class="project-nav" aria-label="Tus proyectos">${filtered.map((project) => `<a href="#/projects/${encodeURIComponent(project.id)}" aria-label="${escapeHtml(project.name)}" class="${project.id === route.projectId ? "active" : ""}" style="--project:${escapeHtml(project.color)}"><span>${icon(project.icon, 22)}</span><strong>${escapeHtml(project.name)}</strong></a>`).join("")}</nav><button class="sidebar-create" type="button" data-action="new-project">${icon("plus", 19)} Nuevo proyecto</button></aside>`;
}

function settingsMenu(state, account, syncStatus) {
  const cloudProfile = account
    ? `<div class="settings-profile"><span>SH</span><div><strong>${escapeHtml(state.settings.profileName)}</strong><small>${escapeHtml(account.email || "Cuenta StudyHub")}</small><small class="sync-state sync-${escapeHtml(syncStatus.state)}" data-sync-state>${escapeHtml(syncStatus.message)}</small></div></div>`
    : `<div class="settings-profile"><span>SH</span><div><strong>${escapeHtml(state.settings.profileName)}</strong><small>Modo local</small></div></div>`;
  return `<div class="floating-menu settings-menu" role="menu">${cloudProfile}${account && (syncStatus.pending || syncStatus.state === "error") ? `<button type="button" role="menuitem" data-action="sync-now">${icon("upload", 18)} Sincronizar ahora</button>` : ""}<button type="button" role="menuitem" data-action="export-backup">${icon("download", 18)} Exportar copia JSON</button><button type="button" role="menuitem" data-action="import-backup">${icon("upload", 18)} Importar copia JSON</button><button type="button" role="menuitem" class="danger-text" data-action="reset-data">${icon("trash", 18)} Limpiar todos los datos</button>${account ? `<button type="button" role="menuitem" data-action="sign-out">${icon("logOut", 18)} Cerrar sesión</button>` : ""}</div>`;
}

function shellTopbar(state, route, ui, account) {
  const dashboard = route.name === "projects";
  const topbarSettingsOpen = ui.settingsOpen && ui.settingsAnchor !== "sidebar";
  return `<header class="topbar"><label class="search-field">${icon("search")}<span class="sr-only">${dashboard ? "Buscar proyectos" : "Buscar en tus proyectos"}</span><input type="search" data-input="${dashboard ? "search" : "project-search"}" value="${escapeHtml(dashboard ? ui.search : ui.projectSearch)}" placeholder="Buscar proyectos…" /></label><button class="icon-button theme-button" type="button" data-action="toggle-theme" aria-label="Cambiar intensidad del tema">${icon(ui.dimTheme ? "moon" : "sun")}</button><div class="settings-wrap"><button class="avatar" type="button" data-action="open-settings" data-settings-anchor="topbar" aria-haspopup="menu" aria-expanded="${topbarSettingsOpen}" aria-label="Copias y ajustes">SH</button>${topbarSettingsOpen ? settingsMenu(state, account, ui.syncStatus) : ""}</div></header>`;
}

function toastRegion(toasts) {
  return `<div class="toast-region" aria-live="polite" aria-atomic="true">${toasts.map((toast) => `<div class="toast ${toast.type === "error" ? "error" : ""}" data-toast-id="${toast.id}">${icon(toast.type === "error" ? "info" : "check", 18)}<span>${escapeHtml(toast.message)}</span><button class="icon-button" type="button" data-action="dismiss-toast" data-toast-id="${toast.id}" aria-label="Cerrar aviso">${icon("x", 15)}</button></div>`).join("")}</div>`;
}

function pausedOtherTaskName(state, taskId) {
  if (state.activeTimer?.phase !== "paused" || state.activeTimer.taskId === taskId) return null;
  return state.tasks.find((task) => task.id === state.activeTimer.taskId)?.title ?? null;
}

export class StudyHubApp {
  constructor(root, repository, store, router, context = {}) {
    this.root = root;
    this.repository = repository;
    this.store = store;
    this.router = router;
    this.account = context.account ?? null;
    this.auth = context.auth ?? null;
    this.fileStore = context.fileStore ?? null;
    this.adapter = context.adapter ?? repository.adapter;
    this.migrationCandidate = context.migrationCandidate ?? null;
    this.learningDraftStore = new LearningDraftStore(context.draftStorage ?? globalThis.localStorage, this.account?.id ?? "local");
    this.ui = initialUiState(this.learningDraftStore.load());
    this.ui.filesEnabled = Boolean(this.fileStore);
    if (this.adapter?.getStatus) this.ui.syncStatus = this.adapter.getStatus();
    this.toastCounter = 0;
    this.busy = false;
    this.searchTimer = null;
    this.fileListRequest = 0;
    this.fileCleanupRunning = null;
    this.lastRouteKey = null;
    this.unsubscribeStore = () => {};
    this.unsubscribeRouter = () => {};
    this.unsubscribeStatus = () => {};
    this.unsubscribeAuth = () => {};
    this.toolsCleanup = () => {};
    this.timer = new TimerController(repository, (snapshot) => this.updateTimer(snapshot));
    this.onClick = (event) => this.handleClick(event);
    this.onInput = (event) => this.handleInput(event);
    this.onChange = (event) => this.handleChange(event);
    this.onSubmit = (event) => this.handleSubmit(event);
    this.onKeydown = (event) => this.handleKeydown(event);
    this.onCancel = (event) => this.handleDialogCancel(event);
    this.onPaste = (event) => { void this.handlePaste(event); };
  }

  mount() {
    this.root.addEventListener("click", this.onClick);
    this.root.addEventListener("input", this.onInput);
    this.root.addEventListener("change", this.onChange);
    this.root.addEventListener("submit", this.onSubmit);
    this.root.addEventListener("keydown", this.onKeydown);
    this.root.addEventListener("cancel", this.onCancel);
    this.root.addEventListener("paste", this.onPaste);
    this.unsubscribeStore = this.store.subscribe(() => this.render());
    this.unsubscribeRouter = this.router.subscribe(() => {
      this.ui.menu = null;
      this.ui.selectedDate = null;
      this.ui.taskFiles = null;
      globalThis.scrollTo?.({ top: 0, behavior: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      this.render();
    });
    this.unsubscribeStatus = this.adapter?.subscribeStatus?.((status) => {
      this.ui.syncStatus = status;
      if (status.state === "synced" && !status.pending) {
        globalThis.setTimeout(() => { void this.flushTaskFileCleanup(); }, 0);
      }
      const node = this.root.querySelector("[data-sync-state]");
      if (node) {
        node.textContent = status.message;
        node.className = `sync-state sync-${status.state}`;
      }
    }) ?? (() => {});
    this.unsubscribeAuth = this.auth?.subscribe?.((event) => {
      if (event === "SIGNED_OUT") globalThis.location?.reload?.();
    }) ?? (() => {});
    this.timer.start();
    this.render();
  }

  setToolsCleanup(cleanup) {
    this.toolsCleanup = cleanup ?? (() => {});
  }

  destroy() {
    this.timer.stop();
    this.unsubscribeStore();
    this.unsubscribeRouter();
    this.unsubscribeStatus();
    this.unsubscribeAuth();
    this.toolsCleanup();
    this.repository.destroy();
    this.router.destroy();
    this.root.removeEventListener("click", this.onClick);
    this.root.removeEventListener("input", this.onInput);
    this.root.removeEventListener("change", this.onChange);
    this.root.removeEventListener("submit", this.onSubmit);
    this.root.removeEventListener("keydown", this.onKeydown);
    this.root.removeEventListener("cancel", this.onCancel);
    this.root.removeEventListener("paste", this.onPaste);
  }

  addToast(message, type = "success") {
    const id = `toast-${++this.toastCounter}`;
    this.ui.toasts.push({ id, message, type });
    this.ui.toasts = this.ui.toasts.slice(-3);
    this.renderToasts();
    globalThis.setTimeout(() => {
      this.ui.toasts = this.ui.toasts.filter((toast) => toast.id !== id);
      this.renderToasts();
    }, 4200);
  }

  renderToasts() {
    const region = this.root.querySelector(".toast-region");
    if (!region) {
      this.render();
      return;
    }
    region.outerHTML = toastRegion(this.ui.toasts);
  }

  getLearningDraft(taskId) {
    return normalizeLearningDraft(this.ui.learningDrafts?.[taskId]);
  }

  setLearningDraft(taskId, value) {
    if (!taskId) return false;
    const draft = normalizeLearningDraft(value);
    const empty = !draft.learned && !draft.unresolved && !draft.nextSession && draft.learnedImages.length === 0;
    const next = { ...(this.ui.learningDrafts ?? {}) };
    if (empty) delete next[taskId];
    else next[taskId] = draft;
    this.ui.learningDrafts = next;
    try {
      this.learningDraftStore.save(next);
      return true;
    } catch {
      return false;
    }
  }

  clearLearningDraft(taskId) {
    if (!taskId || !this.ui.learningDrafts?.[taskId]) return;
    const next = { ...this.ui.learningDrafts };
    delete next[taskId];
    this.ui.learningDrafts = next;
    try { this.learningDraftStore.save(next); } catch { /* The saved reflection remains the source of truth. */ }
  }

  clearAllLearningDrafts() {
    this.ui.learningDrafts = {};
    try { this.learningDraftStore.clear(); } catch { /* Ignore unavailable browser storage. */ }
  }

  captureLearningDraftForm(form) {
    if (!form) return null;
    const taskId = form.dataset.taskId || this.repository.getState().pendingCompletion?.taskId;
    if (!taskId) return null;
    const fields = Object.fromEntries(new FormData(form).entries());
    const draft = { ...this.getLearningDraft(taskId), ...fields };
    const persisted = this.setLearningDraft(taskId, draft);
    return { taskId, draft: this.getLearningDraft(taskId), persisted };
  }

  captureOpenFormDraft() {
    const reflectionForm = this.root.querySelector?.('form[data-form="reflection"]');
    if (reflectionForm) {
      this.captureLearningDraftForm(reflectionForm);
      return;
    }
    const learningForm = this.root.querySelector?.('form[data-form="learning-draft"]');
    if (learningForm) this.captureLearningDraftForm(learningForm);
    const form = this.root.querySelector?.('form[data-form="project"], form[data-form="task"]');
    if (!form) return;
    const draft = Object.fromEntries(new FormData(form).entries());
    if (this.ui.dialog?.type === form.dataset.form) this.ui.dialog = { ...this.ui.dialog, draft };
  }

  async safely(action) {
    if (this.busy) return false;
    this.busy = true;
    try {
      await action();
      return true;
    } catch (error) {
      this.addToast(error?.message || "Ocurrió un error inesperado.", "error");
      return false;
    } finally {
      this.busy = false;
    }
  }

  async loadTaskFiles(taskId) {
    if (!this.fileStore) return;
    const request = ++this.fileListRequest;
    try {
      const items = await this.fileStore.list(taskId);
      if (request !== this.fileListRequest || this.ui.taskFiles?.taskId !== taskId) return;
      this.ui.taskFiles = { taskId, status: "ready", items };
    } catch (error) {
      if (request !== this.fileListRequest || this.ui.taskFiles?.taskId !== taskId) return;
      this.ui.taskFiles = { taskId, status: "error", items: [], error };
    }
    if (this.router.current().taskId === taskId) this.render();
  }

  async flushTaskFileCleanup() {
    if (!this.fileStore || this.fileCleanupRunning || this.adapter?.getStatus?.().state !== "synced") return;
    this.fileCleanupRunning = this.fileStore.flushCleanup(this.repository.getState().tasks.map((task) => task.id));
    try {
      await this.fileCleanupRunning;
    } catch {
      // La limpieza se reintentará cuando vuelva a sincronizarse la cuenta.
    } finally {
      this.fileCleanupRunning = null;
    }
  }

  queueTaskFileCleanup(taskIds) {
    if (!this.fileStore || !taskIds.length) return;
    this.fileStore.queueCleanup(taskIds);
    void this.flushTaskFileCleanup();
  }

  resolveRoute() {
    const state = this.repository.getState();
    const route = this.router.current();
    if (route.name === "projects") return { route, project: null, task: null };
    const project = state.projects.find((item) => item.id === route.projectId);
    if (!project) {
      queueMicrotask(() => this.router.navigate("projects"));
      return { route: { name: "projects" }, project: null, task: null };
    }
    if (route.name === "project") return { route, project, task: null };
    const task = state.tasks.find((item) => item.id === route.taskId && item.projectId === project.id);
    if (!task) {
      queueMicrotask(() => this.router.navigate(`projects/${project.id}`));
      return { route: { name: "project", projectId: project.id }, project, task: null };
    }
    return { route, project, task };
  }

  render({ skipDraftCapture = false } = {}) {
    if (!skipDraftCapture) this.captureOpenFormDraft();
    const state = this.repository.getState();
    if (!state) return;
    const { route, project, task } = this.resolveRoute();
    if (route.name === "focus" && task && this.fileStore && this.ui.taskFiles?.taskId !== task.id) {
      this.ui.taskFiles = { taskId: task.id, status: "loading", items: [] };
      queueMicrotask(() => { void this.loadTaskFiles(task.id); });
    }
    const routeKey = [route.name, route.projectId, route.taskId].filter(Boolean).join(":");
    this.ui.animatePage = this.lastRouteKey !== routeKey;
    this.lastRouteKey = routeKey;
    let content = projectsView(state, this.ui);
    if (route.name === "project" && project) content = projectView(state, project, this.ui);
    if (route.name === "focus" && project && task) content = focusView(state, project, task, this.ui);
    const storedProject = this.ui.dialog?.type === "project" ? state.projects.find((item) => item.id === this.ui.dialog.id) : null;
    const storedTask = this.ui.dialog?.type === "task" ? state.tasks.find((item) => item.id === this.ui.dialog.id) : null;
    const editingProject = this.ui.dialog?.type === "project" ? { ...(storedProject ?? {}), ...(this.ui.dialog.draft ?? {}) } : null;
    const editingTask = this.ui.dialog?.type === "task" ? { ...(storedTask ?? {}), ...(this.ui.dialog.draft ?? {}) } : null;
    const pendingTask = state.pendingCompletion ? state.tasks.find((item) => item.id === state.pendingCompletion.taskId) : null;
    const activeTaskTitle = pendingTask ? pausedOtherTaskName(state, pendingTask.id) : null;
    this.root.innerHTML = `<div class="app-shell ${this.ui.dimTheme ? "dim-theme" : ""}">${shellSidebar(state, route, this.ui, this.account)}<main class="workspace">${shellTopbar(state, route, this.ui, this.account)}${content}</main></div><input class="sr-only" type="file" id="backup-file" accept="application/json,.json" data-input="backup-file" />${this.ui.dialog?.type === "project" ? projectFormDialog(editingProject) : ""}${this.ui.dialog?.type === "task" ? taskFormDialog(this.ui.dialog.projectId, editingTask, { filesEnabled: this.ui.filesEnabled, selectedFiles: this.ui.dialog.files ?? [] }) : ""}${pendingTask ? reflectionDialog(pendingTask, this.getLearningDraft(pendingTask.id), { ...state.pendingCompletion, activeTaskTitle }) : ""}${this.migrationCandidate ? migrationDialog(this.migrationCandidate) : ""}${this.ui.confirm ? confirmDialog(this.ui.confirm) : ""}${toastRegion(this.ui.toasts)}`;
    this.openPendingDialog();
    this.timer.renderNow();
  }

  openPendingDialog() {
    const selector = this.migrationCandidate ? "#migration-dialog" : this.repository.getState().pendingCompletion ? "#reflection-dialog" : this.ui.confirm ? "#confirm-dialog" : this.ui.dialog?.type === "project" ? "#project-dialog" : this.ui.dialog?.type === "task" ? "#task-dialog" : null;
    if (!selector) return;
    requestAnimationFrame(() => {
      const dialog = this.root.querySelector(selector);
      if (dialog && !dialog.open) dialog.showModal();
    });
  }

  updateTimer({ timer, elapsedSeconds }) {
    const display = this.root.querySelector("[data-timer-display]");
    if (!display) return;
    const state = this.repository.getState();
    const route = this.router.current();
    const task = state.tasks.find((item) => item.id === route.taskId);
    const relevant = timer?.taskId === task?.id ? timer : null;
    const mode = relevant ? (relevant.targetSeconds === null ? "infinite" : "countdown") : state.settings.timerMode;
    const target = relevant ? relevant.targetSeconds : mode === "infinite" ? null : state.settings.focusDurationSeconds;
    const seconds = relevant ? elapsedSeconds : 0;
    const remaining = target === null ? null : target - seconds;
    display.textContent = formatFocusTimer(seconds, target);
    display.classList.toggle("has-hours", target === null ? seconds >= 3600 : Math.max(target, Math.abs(remaining)) >= 3600);
    const panel = display.closest(".timer-panel");
    panel?.style.setProperty("--timer-progress", String(target === null ? (seconds % 60) / 60 : Math.min(1, seconds / target)));
    const status = panel?.querySelector("[data-timer-status]");
    if (status) status.textContent = relevant?.phase === "paused" ? "En pausa" : relevant?.phase === "running" ? (mode === "infinite" ? "Tiempo transcurrido" : remaining < 0 ? "Tiempo extra" : "Enfócate") : task?.status === "completed" ? "Tarea completada" : mode === "infinite" ? "Listo · sin límite" : "Listo para comenzar";
  }

  async handleClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      event.preventDefault();
      event.stopPropagation();
      await this.runAction(actionTarget.dataset.action, actionTarget);
      return;
    }
    if (this.ui.menu || this.ui.settingsOpen) {
      this.ui.menu = null;
      this.ui.settingsOpen = false;
      this.ui.settingsAnchor = null;
      this.render();
    }
    const projectCard = event.target.closest(".project-card[data-project-id]");
    if (projectCard && !event.target.closest("button, a, input, select")) this.router.navigate(`projects/${projectCard.dataset.projectId}`);
    const taskRow = event.target.closest(".task-row[data-task-id]");
    if (taskRow && !event.target.closest("button, a, input, select, .floating-menu")) {
      const task = this.repository.getState().tasks.find((item) => item.id === taskRow.dataset.taskId);
      if (task) this.router.navigate(`projects/${task.projectId}/tasks/${task.id}`);
    }
  }

  async runAction(action, target) {
    const state = this.repository.getState();
    const route = this.router.current();
    switch (action) {
      case "new-project": this.ui.dialog = { type: "project" }; this.ui.menu = null; this.render(); break;
      case "edit-project": this.ui.dialog = { type: "project", id: target.dataset.projectId }; this.ui.menu = null; this.render(); break;
      case "delete-project": {
        const project = state.projects.find((item) => item.id === target.dataset.projectId);
        const count = state.tasks.filter((task) => task.projectId === project?.id).length;
        this.ui.confirm = { type: "delete-project", id: project?.id, title: "¿Eliminar este proyecto?", message: `Se eliminarán “${project?.name ?? "Proyecto"}”, ${count} tareas y sus registros. Esta acción no se puede deshacer.`, confirmLabel: "Eliminar proyecto" };
        this.ui.menu = null; this.render(); break;
      }
      case "toggle-project-menu": this.ui.menu = this.ui.menu?.type === "project" && this.ui.menu.projectId === target.dataset.projectId ? null : { type: "project", projectId: target.dataset.projectId }; this.render(); break;
      case "new-task": this.ui.dialog = { type: "task", projectId: target.dataset.projectId || route.projectId }; this.render(); break;
      case "edit-task": {
        const task = state.tasks.find((item) => item.id === target.dataset.taskId);
        this.ui.dialog = { type: "task", id: task?.id, projectId: task?.projectId }; this.ui.menu = null; this.render(); break;
      }
      case "delete-task": {
        const task = state.tasks.find((item) => item.id === target.dataset.taskId);
        this.ui.confirm = { type: "delete-task", id: task?.id, title: "¿Eliminar esta tarea?", message: `Se eliminarán “${task?.title ?? "Tarea"}”, su tiempo y sus reflexiones.`, confirmLabel: "Eliminar tarea" };
        this.ui.menu = null; this.render(); break;
      }
      case "toggle-task-menu": this.ui.menu = this.ui.menu?.type === "task" && this.ui.menu.taskId === target.dataset.taskId ? null : { type: "task", taskId: target.dataset.taskId }; this.render(); break;
      case "toggle-status": this.ui.menu = this.ui.menu?.type === "status" && this.ui.menu.taskId === target.dataset.taskId ? null : { type: "status", taskId: target.dataset.taskId }; this.render(); break;
      case "set-status": await this.safely(async () => {
        this.ui.menu = null;
        const task = this.repository.getState().tasks.find((item) => item.id === target.dataset.taskId);
        if (task?.status === target.dataset.status) { this.render(); return; }
        if (target.dataset.status === "completed") this.captureOpenFormDraft();
        const result = await this.repository.setTaskStatus(target.dataset.taskId, target.dataset.status);
        this.addToast(result?.pausedTaskTitle
          ? `Sesión de “${result.pausedTaskTitle}” pausada. Guarda la reflexión para completar la tarea.`
          : target.dataset.status === "completed" ? "Guarda la reflexión para completar la tarea." : "Estado actualizado.");
      }); break;
      case "toggle-filter": this.ui.menu = this.ui.menu?.type === "filter" ? null : { type: "filter" }; this.render(); break;
      case "set-filter": this.ui.taskFilter = target.dataset.filter; this.ui.menu = null; this.render(); break;
      case "set-learning-tab": this.ui.focusLearningTab = target.dataset.learningTab === "history" ? "history" : "draft"; this.render(); break;
      case "remove-learning-image": {
        this.captureOpenFormDraft();
        const taskId = target.dataset.taskId || state.pendingCompletion?.taskId;
        const draft = this.getLearningDraft(taskId);
        const persisted = this.setLearningDraft(taskId, {
          ...draft,
          learnedImages: draft.learnedImages.filter((image) => image.id !== target.dataset.imageId),
        });
        this.render();
        this.focusLearningTextarea(taskId);
        if (!persisted) this.addToast("La imagen se quitó, pero el borrador no pudo guardarse en este navegador.", "error");
        break;
      }
      case "calendar-prev": this.moveCalendar(-1); break;
      case "calendar-next": this.moveCalendar(1); break;
      case "calendar-today": { const today = new Date(); this.ui.calendar = { year: today.getFullYear(), month: today.getMonth() }; this.ui.selectedDate = null; this.render(); break; }
      case "calendar-day": this.ui.selectedDate = this.ui.selectedDate === target.dataset.date ? null : target.dataset.date; this.render(); break;
      case "clear-date-filter": this.ui.selectedDate = null; this.render(); break;
      case "go-projects": this.router.navigate("projects"); break;
      case "go-project": this.router.navigate(`projects/${target.dataset.projectId}`); break;
      case "toggle-timer": await this.safely(async () => { const timer = state.activeTimer; if (timer?.taskId === target.dataset.taskId && timer.phase === "running") { await this.repository.pauseTimer(); this.addToast("Sesión pausada."); } else { await this.repository.startTimer(target.dataset.taskId); this.addToast(timer ? "Sesión reanudada." : "Sesión iniciada."); } }); break;
      case "stop-timer": await this.safely(async () => {
        this.captureOpenFormDraft();
        const saved = await this.repository.stopTimer();
        this.addToast(saved ? `Sesión guardada: ${formatDuration(saved, true)}. Añade u omite la reflexión.` : "La sesión se detuvo sin tiempo pendiente.");
      }); break;
      case "complete-task": await this.safely(async () => {
        this.captureOpenFormDraft();
        const result = await this.repository.requestCompletion(target.dataset.taskId);
        this.addToast(result?.pausedTaskTitle
          ? `Sesión de “${result.pausedTaskTitle}” pausada. Guarda la reflexión para completar la tarea.`
          : "Guarda la reflexión para completar la tarea.");
      }); break;
      case "retry-task-files": {
        if (!this.fileStore || route.taskId !== target.dataset.taskId) break;
        this.ui.taskFiles = { taskId: route.taskId, status: "loading", items: [] };
        this.render();
        void this.loadTaskFiles(route.taskId);
        break;
      }
      case "download-task-file": await this.safely(async () => {
        const taskId = target.dataset.taskId;
        const file = this.ui.taskFiles?.taskId === taskId
          ? this.ui.taskFiles.items.find((item) => item.key === target.dataset.fileKey)
          : null;
        if (!this.fileStore || route.taskId !== taskId || !file) throw new Error("El archivo ya no está disponible en esta tarea.");
        const blob = await this.fileStore.download(taskId, file.key, file.updatedAt);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.append(link);
        link.click();
        link.remove();
        globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }); break;
      case "cancel-reflection": {
        const reflectionKind = state.pendingCompletion?.kind ?? "completion";
        const pausedTask = pausedOtherTaskName(state, state.pendingCompletion?.taskId);
        this.captureOpenFormDraft();
        await this.safely(async () => {
          await this.repository.cancelCompletion();
          this.addToast(pausedTask
            ? `La tarea sigue abierta. La sesión de “${pausedTask}” sigue pausada y puedes reanudarla.`
            : reflectionKind === "session" ? "Reflexión omitida; la sesión y su tiempo quedaron guardados." : "La tarea sigue abierta; el tiempo ya quedó guardado.");
        });
        break;
      }
      case "migrate-local": await this.safely(async () => {
        const candidate = this.migrationCandidate;
        if (!candidate) return;
        await this.repository.replaceFromMigration(candidate);
        this.migrationCandidate = null;
        this.render();
        this.addToast("Tus datos locales se migraron a la nube.");
      }); break;
      case "skip-migration": await this.safely(async () => {
        await this.repository.persistCurrentState();
        this.migrationCandidate = null;
        this.render();
        this.addToast("Se creó un espacio nuevo. La copia local anterior se conservó.");
      }); break;
      case "sync-now": await this.safely(async () => {
        const result = await this.repository.syncNow();
        this.addToast(result?.synced ? "Datos sincronizados." : "La sincronización sigue pendiente.", result?.synced ? "success" : "error");
      }); break;
      case "sign-out": await this.safely(async () => {
        await this.auth?.signOut();
        globalThis.location?.reload?.();
      }); break;
      case "close-dialog": this.ui.dialog = null; this.render(); break;
      case "open-settings": {
        const anchor = target.dataset.settingsAnchor || "topbar";
        const closeCurrent = this.ui.settingsOpen && this.ui.settingsAnchor === anchor;
        this.ui.settingsOpen = !closeCurrent;
        this.ui.settingsAnchor = closeCurrent ? null : anchor;
        this.ui.menu = null;
        this.render();
        break;
      }
      case "toggle-theme": this.ui.dimTheme = !this.ui.dimTheme; this.render(); break;
      case "export-backup": this.exportBackup(); this.ui.settingsOpen = false; this.ui.settingsAnchor = null; this.render(); break;
      case "import-backup": this.ui.settingsOpen = false; this.ui.settingsAnchor = null; this.root.querySelector("#backup-file")?.click(); break;
      case "reset-data": this.ui.confirm = { type: "reset", title: "¿Empezar desde cero?", message: this.account ? "Se eliminarán todos los proyectos, tareas, sesiones, reflexiones y archivos adjuntos de esta cuenta. La limpieza de archivos se completará al sincronizar." : "Se eliminarán todos los proyectos, tareas, sesiones y reflexiones de este dispositivo.", confirmLabel: "Limpiar datos" }; this.ui.settingsOpen = false; this.ui.settingsAnchor = null; this.render(); break;
      case "cancel-confirm": this.ui.confirm = null; this.ui.pendingImport = null; this.render(); break;
      case "confirm-action": await this.confirmAction(); break;
      case "dismiss-toast": this.ui.toasts = this.ui.toasts.filter((toast) => toast.id !== target.dataset.toastId); this.renderToasts(); break;
      default: break;
    }
  }

  moveCalendar(delta) {
    const date = new Date(this.ui.calendar.year, this.ui.calendar.month + delta, 1);
    this.ui.calendar = { year: date.getFullYear(), month: date.getMonth() };
    this.ui.selectedDate = null;
    this.render();
  }

  async confirmAction() {
    const current = this.ui.confirm;
    if (!current) return;
    await this.safely(async () => {
      this.ui.confirm = null;
      if (current.type === "delete-project") {
        const taskIds = this.repository.getState().tasks.filter((task) => task.projectId === current.id).map((task) => task.id);
        if (taskIds.includes(this.repository.getState().activeTimer?.taskId)) throw new Error("Detén el cronómetro antes de eliminar este proyecto.");
        await this.repository.deleteProject(current.id);
        this.queueTaskFileCleanup(taskIds);
        taskIds.forEach((taskId) => this.clearLearningDraft(taskId));
        if (this.router.current().projectId === current.id) this.router.navigate("projects");
        this.addToast("Proyecto eliminado.");
      } else if (current.type === "delete-task") {
        const task = this.repository.getState().tasks.find((item) => item.id === current.id);
        if (this.repository.getState().activeTimer?.taskId === current.id) throw new Error("Detén el cronómetro antes de eliminar esta tarea.");
        await this.repository.deleteTask(current.id);
        this.queueTaskFileCleanup([current.id]);
        this.clearLearningDraft(current.id);
        if (this.router.current().taskId === current.id) this.router.navigate(`projects/${task.projectId}`);
        this.addToast("Tarea eliminada.");
      } else if (current.type === "reset") {
        const taskIds = this.repository.getState().tasks.map((task) => task.id);
        await this.repository.resetAll();
        this.queueTaskFileCleanup(taskIds);
        this.clearAllLearningDrafts();
        this.router.navigate("projects");
        this.addToast("Tu espacio quedó vacío.");
      } else if (current.type === "import") {
        const previousTaskIds = this.repository.getState().tasks.map((task) => task.id);
        await this.repository.importEnvelope(this.ui.pendingImport);
        const importedTaskIds = new Set(this.repository.getState().tasks.map((task) => task.id));
        this.queueTaskFileCleanup(previousTaskIds.filter((id) => !importedTaskIds.has(id)));
        this.clearAllLearningDrafts();
        this.ui.pendingImport = null;
        this.router.navigate("projects");
        this.addToast("Copia restaurada correctamente.");
      }
    });
  }

  exportBackup() {
    const envelope = this.repository.exportEnvelope();
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `studyhub-backup-${toLocalDateKey()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.addToast("Copia de seguridad exportada.");
  }

  focusLearningTextarea(taskId) {
    requestAnimationFrame(() => {
      const pendingTaskId = this.repository.getState().pendingCompletion?.taskId;
      const selector = pendingTaskId === taskId
        ? '#reflection-dialog textarea[name="learned"]'
        : `form[data-form="learning-draft"][data-task-id="${taskId}"] textarea[name="learned"]`;
      const textarea = this.root.querySelector?.(selector);
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }
    });
  }

  async addLearningImageFiles(form, files) {
    const taskId = form?.dataset.taskId || this.repository.getState().pendingCompletion?.taskId;
    if (!taskId) return;
    this.captureLearningDraftForm(form);
    const current = this.getLearningDraft(taskId);
    const available = MAX_LEARNING_IMAGES - current.learnedImages.length;
    if (available <= 0) {
      this.addToast(`Puedes guardar hasta ${MAX_LEARNING_IMAGES} imágenes por reflexión.`, "error");
      return;
    }
    const selected = [...files].filter((file) => String(file?.type).startsWith("image/")).slice(0, available);
    if (!selected.length) {
      this.addToast("No encontramos una imagen válida para añadir.", "error");
      return;
    }

    let prepared = [];
    const success = await this.safely(async () => {
      for (const file of selected) prepared.push(await prepareLearningImage(file));
    });
    if (!success) return;
    const persisted = this.setLearningDraft(taskId, {
      ...this.getLearningDraft(taskId),
      learnedImages: [...this.getLearningDraft(taskId).learnedImages, ...prepared],
    });
    this.render();
    this.focusLearningTextarea(taskId);
    if (!persisted) {
      this.addToast("La imagen está lista, pero el borrador no pudo guardarse en este navegador.", "error");
      return;
    }
    const omitted = [...files].filter((file) => String(file?.type).startsWith("image/")).length - selected.length;
    this.addToast(omitted > 0 ? `Imagen añadida. El máximo es ${MAX_LEARNING_IMAGES} por reflexión.` : prepared.length === 1 ? "Imagen añadida a tus notas." : `${prepared.length} imágenes añadidas a tus notas.`);
  }

  async handlePaste(event) {
    const textarea = event.target.closest?.('textarea[name="learned"]');
    const form = textarea?.closest('form[data-form="learning-draft"], form[data-form="reflection"]');
    if (!form) return;
    const files = [...(event.clipboardData?.items ?? [])]
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    event.preventDefault();
    await this.addLearningImageFiles(form, files);
  }

  handleInput(event) {
    const learningForm = event.target.closest?.('form[data-form="learning-draft"], form[data-form="reflection"]');
    if (learningForm && event.target.matches("textarea")) {
      const captured = this.captureLearningDraftForm(learningForm);
      if (captured && !captured.persisted) {
        const status = learningForm.querySelector?.(".learning-draft-status");
        if (status) status.textContent = "No se pudo guardar el borrador en este navegador";
      }
      return;
    }
    const inputType = event.target.dataset.input;
    if (inputType !== "search" && inputType !== "project-search") return;
    const searchScope = event.target.closest(".topbar") ? ".topbar" : ".sidebar";
    if (inputType === "search") this.ui.search = event.target.value;
    if (inputType === "project-search") this.ui.projectSearch = event.target.value;
    globalThis.clearTimeout(this.searchTimer);
    this.searchTimer = globalThis.setTimeout(() => {
      this.render();
      requestAnimationFrame(() => {
        const input = this.root.querySelector(`${searchScope} [data-input="${inputType}"]`);
        if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
      });
    }, 90);
  }

  async handleChange(event) {
    if (event.target.dataset.input === "new-task-files") {
      if (this.ui.dialog?.type !== "task" || this.ui.dialog.id) return;
      const files = [...(event.target.files ?? [])];
      this.ui.dialog.files = files;
      const selected = event.target.closest(".task-create-files")?.querySelector("[data-selected-task-files]");
      if (selected) selected.innerHTML = files.length
        ? `<ul>${files.map((file) => `<li>${escapeHtml(file.name)}</li>`).join("")}</ul>`
        : "Ningún archivo seleccionado";
      return;
    }
    if (event.target.dataset.input === "task-files") {
      const taskId = event.target.dataset.taskId;
      const files = [...(event.target.files ?? [])];
      event.target.value = "";
      if (!files.length) return;
      await this.safely(async () => {
        if (!this.fileStore || !this.repository.getState().tasks.some((task) => task.id === taskId)) {
          throw new Error("Abre una tarea de tu cuenta para adjuntar archivos.");
        }
        let uploaded = 0;
        let replaced = 0;
        let firstError = null;
        for (const file of files) {
          try {
            const result = await this.fileStore.upload(taskId, file);
            if (result.kind === "updated") replaced += 1;
            else uploaded += 1;
          } catch (error) {
            firstError ??= error;
          }
        }
        await this.loadTaskFiles(taskId);
        if (uploaded || replaced) this.addToast(`${uploaded} ${uploaded === 1 ? "archivo añadido" : "archivos añadidos"}${replaced ? ` · ${replaced} ${replaced === 1 ? "actualizado" : "actualizados"}` : ""}.`);
        if (firstError) throw firstError;
      });
      return;
    }
    if (event.target.dataset.input === "learning-images") {
      const form = event.target.closest('form[data-form="learning-draft"], form[data-form="reflection"]');
      await this.addLearningImageFiles(form, event.target.files ?? []);
      event.target.value = "";
      return;
    }
    if (event.target.dataset.input === "backup-file") {
      const [file] = event.target.files;
      if (!file) return;
      try {
        const envelope = JSON.parse(await file.text());
        this.ui.pendingImport = envelope;
        this.ui.confirm = { type: "import", title: "¿Restaurar esta copia?", message: this.fileStore ? "Los datos actuales serán reemplazados. La copia JSON no incluye archivos: los adjuntos de tareas conservadas permanecerán y los de tareas eliminadas se limpiarán al sincronizar. Si había un cronómetro activo, se restaurará en pausa." : "Los datos actuales serán reemplazados. Si la copia tenía un cronómetro activo, se restaurará en pausa.", confirmLabel: "Restaurar copia" };
        this.render();
      } catch {
        this.addToast("El archivo no contiene JSON válido.", "error");
      }
    }
    if (event.target.dataset.input === "focus-mode") {
      await this.safely(async () => {
        await this.repository.setTimerMode(event.target.value);
        this.addToast(event.target.value === "infinite" ? "Modo sin límite activado." : "Modo con tiempo activado.");
      });
    }
  }

  async handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());
    if (form.dataset.form === "timer-config") {
      const success = await this.safely(async () => { await this.repository.setFocusDurationParts(data.hours, data.minutes); });
      if (success) this.addToast("Duración personalizada guardada.");
      return;
    }
    if (form.dataset.form === "project") {
      this.ui.dialog = { ...this.ui.dialog, draft: data };
      const success = await this.safely(async () => {
        const isEdit = Boolean(form.dataset.projectId);
        if (isEdit) await this.repository.updateProject(form.dataset.projectId, data);
        else await this.repository.createProject(data);
      });
      if (success) {
        this.ui.dialog = null;
        this.render();
        this.addToast(form.dataset.projectId ? "Proyecto actualizado." : "Proyecto creado.");
      }
    }
    if (form.dataset.form === "task") {
      this.ui.dialog = { ...this.ui.dialog, draft: data };
      const files = form.dataset.taskId ? [] : [...(this.ui.dialog.files ?? [])];
      let createdTask = null;
      const success = await this.safely(async () => {
        const isEdit = Boolean(form.dataset.taskId);
        if (isEdit) await this.repository.updateTask(form.dataset.taskId, data);
        else createdTask = await this.repository.createTask(form.dataset.projectId, data);
      });
      if (success) {
        this.ui.dialog = null;
        this.render();
        this.addToast(form.dataset.taskId ? "Tarea actualizada." : "Tarea creada.");
        if (createdTask && files.length && this.fileStore) {
          await this.safely(async () => {
            let uploaded = 0;
            let failed = 0;
            for (const file of files) {
              try {
                await this.fileStore.upload(createdTask.id, file);
                uploaded += 1;
              } catch {
                failed += 1;
              }
            }
            if (uploaded) this.addToast(`${uploaded} ${uploaded === 1 ? "archivo adjuntado" : "archivos adjuntados"} a la tarea.`);
            if (failed) throw new Error(`La tarea se creó, pero ${failed} ${failed === 1 ? "archivo no se pudo adjuntar" : "archivos no se pudieron adjuntar"}. Ábrela para reintentar la carga.`);
          });
        }
      }
    }
    if (form.dataset.form === "reflection") {
      const pending = this.repository.getState().pendingCompletion;
      const pausedTask = pausedOtherTaskName(this.repository.getState(), pending?.taskId);
      const captured = this.captureLearningDraftForm(form);
      const reflectionKind = pending?.kind ?? "completion";
      const reflection = { ...data, learnedImages: captured?.draft.learnedImages ?? [] };
      const success = await this.safely(async () => { await this.repository.saveReflection(reflection); });
      if (success) {
        this.clearLearningDraft(pending?.taskId);
        this.render({ skipDraftCapture: true });
        this.addToast(pausedTask
          ? `Tarea completada. La sesión de “${pausedTask}” sigue pausada y puedes reanudarla.`
          : reflectionKind === "session" ? "Reflexión de la sesión guardada." : "Tarea completada y reflexión guardada.");
      }
    }
  }

  handleKeydown(event) {
    if (event.key === "ArrowDown" && event.target.matches('[aria-expanded="true"]')) {
      const menu = event.target.parentElement?.querySelector(".floating-menu");
      const first = menu?.querySelector("button:not(:disabled)");
      if (first) { event.preventDefault(); first.focus(); return; }
    }
    const menu = event.target.closest(".floating-menu");
    if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const items = [...menu.querySelectorAll("button:not(:disabled)")];
      const current = items.indexOf(event.target);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
      items[next]?.focus();
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches(".project-card[data-project-id]")) { event.preventDefault(); this.router.navigate(`projects/${event.target.dataset.projectId}`); }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches(".task-row[data-task-id]")) {
      event.preventDefault(); const task = this.repository.getState().tasks.find((item) => item.id === event.target.dataset.taskId); if (task) this.router.navigate(`projects/${task.projectId}/tasks/${task.id}`);
    }
    if (event.key === "Escape" && (this.ui.menu || this.ui.settingsOpen)) { this.ui.menu = null; this.ui.settingsOpen = false; this.ui.settingsAnchor = null; this.render(); }
  }

  handleDialogCancel(event) {
    if (event.target.id === "migration-dialog") {
      event.preventDefault();
      return;
    }
    if (event.target.id === "reflection-dialog") {
      event.preventDefault();
      const state = this.repository.getState();
      const reflectionKind = state.pendingCompletion?.kind ?? "completion";
      const pausedTask = pausedOtherTaskName(state, state.pendingCompletion?.taskId);
      this.captureOpenFormDraft();
      void this.safely(async () => {
        await this.repository.cancelCompletion();
        this.addToast(pausedTask
          ? `La tarea sigue abierta. La sesión de “${pausedTask}” sigue pausada y puedes reanudarla.`
          : reflectionKind === "session" ? "Reflexión omitida; la sesión y su tiempo quedaron guardados." : "La tarea sigue abierta; el tiempo ya quedó guardado.");
      });
      return;
    }
    if (event.target.id === "confirm-dialog") { this.ui.confirm = null; this.ui.pendingImport = null; }
    else this.ui.dialog = null;
    this.render();
  }
}

async function mountStudyHub(root, { adapter, account = null, auth = null, fileStore = null }) {
  const store = createStore(null);
  const repository = new StudyHubRepository({ adapter, store });
  const init = await repository.initialize();
  const router = createRouter();
  const app = new StudyHubApp(root, repository, store, router, {
    account,
    auth,
    fileStore,
    adapter,
    migrationCandidate: init.migrationCandidate ?? null,
  });
  app.mount();
  app.setToolsCleanup(registerStudyHubTools(repository, router, (message, type) => app.addToast(message, type)));
  if (init.recovery) app.addToast(init.recovery, "error");
  return app;
}

export async function createApp(root, dependencies = {}) {
  if (!root) throw new Error("No se encontró el contenedor de StudyHub.");
  const config = dependencies.config === undefined ? readSupabaseConfig() : dependencies.config;
  const client = dependencies.client ?? (config ? createStudyHubSupabaseClient(config) : null);
  if (!client) return mountStudyHub(root, { adapter: dependencies.localAdapter ?? new LocalStorageAdapter() });

  const auth = dependencies.auth ?? new StudyHubAuth(client);
  const mountCloudSession = async (session) => {
    const userId = session?.user?.id;
    if (!userId) throw new Error("La sesión de StudyHub no contiene un usuario válido.");
    const gateway = dependencies.gatewayFactory
      ? dependencies.gatewayFactory({ client, userId })
      : new SupabaseStateGateway({ client, userId });
    const adapter = dependencies.cloudAdapterFactory
      ? dependencies.cloudAdapterFactory({ gateway, userId })
      : new CloudStorageAdapter({ gateway, userId });
    return mountStudyHub(root, {
      adapter,
      account: { id: userId, email: session.user.email ?? "" },
      auth,
      fileStore: dependencies.fileStoreFactory
        ? dependencies.fileStoreFactory({ client, userId })
        : new TaskFileStore(client, userId),
    });
  };

  const session = dependencies.session ?? await auth.getSession();
  if (session) return mountCloudSession(session);

  let gate;
  gate = mountAuthGate(root, auth, {
    onAuthenticated: async (authenticatedSession) => {
      gate?.destroy();
      await mountCloudSession(authenticatedSession);
    },
  });
  return gate;
}

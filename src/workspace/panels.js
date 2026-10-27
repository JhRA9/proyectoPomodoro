export function overlaySide(enabled, compact, ui) {
  return enabled && compact ? ui.rightSidebarOpen ? "right" : ui.leftSidebarOpen ? "left" : null : null;
}
const visible = (element) => element?.getClientRects().length && globalThis.getComputedStyle(element).visibility !== "hidden";

export class WorkspacePanels {
  constructor(workspace) {
    this.workspace = workspace; this.app = workspace.app;
    this.media = globalThis.matchMedia?.("(max-width: 1100px)");
    this.onResize = () => this.sync(); this.media?.addEventListener?.("change", this.onResize);
  }
  sync(navigated = false) {
    const { root, ui } = this.app;
    const side = overlaySide(this.workspace.enabled, this.media?.matches, ui);
    const main = root.querySelector("main"); if (main) main.inert = Boolean(side);
    for (const name of ["left", "right"]) {
      const shell = root.querySelector(`.${name}-sidebar-shell`); if (!shell) continue;
      shell.inert = Boolean(side && side !== name);
      if (side === name) { shell.setAttribute("role", "dialog"); shell.setAttribute("aria-modal", "true"); shell.setAttribute("aria-label", name === "left" ? "Menú de navegación" : "Agenda global"); }
      else { shell.removeAttribute("role"); shell.removeAttribute("aria-modal"); shell.removeAttribute("aria-label"); }
    }
    const modal = root.querySelector("dialog[open]");
    if (!modal && side) {
      const panel = root.querySelector(`.${side}-sidebar-shell`);
      if (!panel?.contains(globalThis.document?.activeElement)) [...(panel?.querySelectorAll(`[data-action="toggle-${side}-sidebar"]`) || [])].find(visible)?.focus({preventScroll:true});
    } else if (!modal && this.side && !side && !navigated) {
      const opener = root.querySelector(`main [data-action="toggle-${this.side}-sidebar"]`);
      (visible(opener) ? opener : root.querySelector("main h1"))?.focus({preventScroll:true});
    }
    this.side = side;
  }
  keydown(event) {
    if (!this.side || this.app.root.querySelector("dialog[open]") || this.app.ui.menu || this.app.ui.settingsOpen) return false;
    if (event.key === "Escape") {
      event.preventDefault(); this.app.ui[`${this.side}SidebarOpen`] = false;
      this.app.persistUiPreferences(); this.app.render(); return true;
    }
    if (event.key !== "Tab") return false;
    const panel = this.app.root.querySelector(`.${this.side}-sidebar-shell`);
    const items = [...panel.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element=>visible(element) && !element.closest("[inert]"));
    const index = items.indexOf(event.target);
    if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1)?.focus(); return true; }
    if (!event.shiftKey && (index < 0 || index === items.length-1)) { event.preventDefault(); items[0]?.focus(); return true; }
    return false;
  }
  destroy() { this.media?.removeEventListener?.("change",this.onResize); }
}

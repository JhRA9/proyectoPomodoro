export function workspaceEnabled(storage = globalThis.localStorage, search = globalThis.location?.search || "") {
  const value = new URLSearchParams(search).get("workspaceV2");
  if (value !== null) return value === "1" || value === "true";
  try { return storage?.getItem("studyhub:workspaceV2") === "true"; } catch { return false; }
}

export class WorkspaceDrafts {
  constructor(storage, account = "local") { this.storage = storage; this.prefix = `studyhub:workspace-drafts:2:${encodeURIComponent(account)}:`; }
  key(form) { return `${form.dataset.form}:${form.dataset.projectId || form.dataset.exerciseId || form.dataset.attemptId || form.dataset.evidenceId || form.dataset.deliverableId || "global"}${form.dataset.planEntity ? ':' + form.dataset.planEntity : ''}`; }
  capture(form) {
    if (!form || form.dataset.areaSuggestions || !form.matches?.("[data-workspace-draft]")) return;
    const data = {};
    if (form.dataset.planRevision !== undefined) data.__planRevision = form.dataset.planRevision;
    for (const element of form.elements) {
      if (!element.name || ["password", "file", "submit"].includes(element.type)) continue;
      if (element.type === "checkbox") data[element.name] = element.checked;
      else if (element.multiple) data[element.name] = [...element.selectedOptions].map((x) => x.value);
      else data[element.name] = element.value;
    }
    try { this.storage?.setItem(this.prefix + this.key(form), JSON.stringify(data)); } catch { return false; }
    return true;
  }
  restore(root) {
    for (const form of root.querySelectorAll("[data-workspace-draft]")) {
      if (form.dataset.areaSuggestions) continue;
      let data; try { data = JSON.parse(this.storage?.getItem(this.prefix + this.key(form)) || "null"); } catch { continue; }
      if (!data) continue;
      if (data.__planRevision !== undefined) form.dataset.planRevision = data.__planRevision;
      for (const element of form.elements) {
        if (!(element.name in data)) continue;
        if (element.type === "checkbox") element.checked = data[element.name] === true;
        else if (element.multiple) for (const option of element.options) option.selected = data[element.name]?.includes(option.value);
        else if (element.type !== "file") element.value = data[element.name];
      }
    }
  }
  clear(form) { this.storage?.removeItem(this.prefix + this.key(form)); }
}

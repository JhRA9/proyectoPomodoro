export function parseRoute(hash = globalThis.location?.hash ?? "") {
  const cleaned = hash.replace(/^#\/?/, "").split("?")[0];
  let parts;
  try {
    parts = cleaned.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return { name: "projects" };
  }
  if (parts[0] !== "projects") return { name: "projects" };
  if (parts.length === 1) return { name: "projects" };
  if (parts.length === 2) return { name: "project", projectId: parts[1] };
  if (parts[2] === "tasks" && parts[3]) return { name: "focus", projectId: parts[1], taskId: parts[3] };
  return { name: "projects" };
}

export function createRouter() {
  const listeners = new Set();
  const notify = () => listeners.forEach((listener) => listener(parseRoute()));
  globalThis.addEventListener?.("hashchange", notify);
  if (!globalThis.location.hash) globalThis.history?.replaceState(null, "", "#/projects");
  return {
    current: () => parseRoute(),
    navigate(path) {
      const target = `#/${path.replace(/^\//, "")}`;
      if (globalThis.location.hash === target) notify();
      else globalThis.location.hash = target;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    destroy() { globalThis.removeEventListener?.("hashchange", notify); listeners.clear(); },
  };
}

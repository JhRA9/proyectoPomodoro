import { createDemoState, normalizeState } from "./schema.js";

const STORAGE_KEY = "studyhub:state:1";
const BACKUP_KEY = "studyhub:state:1:last-known-good";

export class LocalStorageAdapter {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  async load() {
    const primary = this.storage.getItem(STORAGE_KEY);
    if (!primary) return { data: createDemoState(), recovery: null, isNew: true };
    try {
      return { data: normalizeState(JSON.parse(primary)), recovery: null, isNew: false };
    } catch (primaryError) {
      const backup = this.storage.getItem(BACKUP_KEY);
      if (backup) {
        try {
          return { data: normalizeState(JSON.parse(backup)), recovery: "Se restauró la última copia local válida.", isNew: false };
        } catch {
          // Continue to a safe empty seed below.
        }
      }
      return { data: createDemoState(), recovery: "Los datos locales no se pudieron leer. Se abrió una copia segura de demostración.", isNew: true, error: primaryError };
    }
  }

  async save(nextState) {
    const serialized = JSON.stringify(nextState);
    const previous = this.storage.getItem(STORAGE_KEY);
    try {
      if (previous) this.storage.setItem(BACKUP_KEY, previous);
      this.storage.setItem(STORAGE_KEY, serialized);
    } catch (error) {
      throw new Error("No fue posible guardar los cambios en este navegador.", { cause: error });
    }
  }

  subscribe(listener) {
    if (!globalThis.addEventListener) return () => {};
    const handler = (event) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          listener(normalizeState(JSON.parse(event.newValue)));
        } catch {
          // Ignore malformed writes from other tabs.
        }
      }
    };
    globalThis.addEventListener("storage", handler);
    return () => globalThis.removeEventListener("storage", handler);
  }
}

export class MemoryAdapter {
  constructor(initialState) {
    this.data = structuredClone(initialState);
    this.writeCount = 0;
  }
  async load() { return { data: structuredClone(this.data), recovery: null, isNew: false }; }
  async save(nextState) { this.data = structuredClone(nextState); this.writeCount += 1; }
  subscribe() { return () => {}; }
}

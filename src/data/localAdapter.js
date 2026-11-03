import {PlanningArchiveStore} from './planningArchiveStore.js';
import { createDemoState, normalizeState } from "./schema.js";

export const PLANNING_STORAGE_KEY="studyhub:planning-storage:2";
export const STORAGE_KEY = "studyhub:state:1";
export const BACKUP_KEY = "studyhub:state:1:last-known-good";

export function readStoredState(storage = globalThis.localStorage, primaryKey = STORAGE_KEY, backupKey = BACKUP_KEY) {
  const primary = storage?.getItem(primaryKey);
  if (!primary) return { data: null, exists: false, recovery: null, error: null };
  try {
    return { data: normalizeState(JSON.parse(primary)), exists: true, recovery: null, error: null };
  } catch (primaryError) {
    const backup = storage?.getItem(backupKey);
    if (backup) {
      try {
        return {
          data: normalizeState(JSON.parse(backup)),
          exists: true,
          recovery: "Se restauró la última copia local válida.",
          error: primaryError,
        };
      } catch {
        // Continue with the invalid primary result below.
      }
    }
    return { data: null, exists: true, recovery: null, error: primaryError };
  }
}

export class LocalStorageAdapter {
  constructor(storage = globalThis.localStorage, archive = null) {
    this.storage = storage;
    this.archiveRevision=null;
    this.archive = archive || (storage===globalThis.localStorage&&globalThis.indexedDB ? new PlanningArchiveStore() : null);
  }

  async load() {
    if(this.storage?.getItem(PLANNING_STORAGE_KEY)){
      if(!this.archive)throw new Error("El historial requiere IndexedDB. No se sustituyeron tus datos.");
      try {const state=await this.archive.load();if(!state)throw new Error('Historial local ausente.');this.archiveRevision=state.revision;return {data:normalizeState(state),isNew:false,recovery:null};}
      catch(error){const backup=await this.archive.load('backup');if(!backup)throw error;return {data:normalizeState(backup),isNew:false,recovery:'Se recuperó el checkpoint local anterior; conserva una copia antes de continuar.'};}
    }
    const stored = readStoredState(this.storage);
    if (!stored.exists) return { data: createDemoState(), recovery: null, isNew: true };
    if (stored.data) return { data: stored.data, recovery: stored.recovery, isNew: false };
    return { data: createDemoState(), recovery: "Los datos locales no se pudieron leer. Se abrió una copia segura de demostración.", isNew: true, error: stored.error };
  }

  async save(nextState) {
    if(this.archive&&(this.storage.getItem(PLANNING_STORAGE_KEY)||nextState.projectPlans?.some(p=>p.modelVersion===2))){
      await this.archive.save(nextState,this.archiveRevision);
      this.archiveRevision=nextState.revision;
      this.storage.setItem(PLANNING_STORAGE_KEY,String(nextState.revision));return;
    }
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
      if(event.key===PLANNING_STORAGE_KEY&&this.archive){void this.load().then(result=>listener(result.data)).catch(()=>{});return;}
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

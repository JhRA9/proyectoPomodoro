import { createDemoState, createEmptyState, normalizeState } from "./schema.js";
import { readStoredState } from "./localAdapter.js";

const CACHE_PREFIX = "studyhub:cloud-cache:1:";
const PENDING_PREFIX = "studyhub:cloud-pending:1:";

export function cloudStorageKeys(userId) {
  const suffix = encodeURIComponent(String(userId));
  return {
    cache: `${CACHE_PREFIX}${suffix}`,
    backup: `${CACHE_PREFIX}${suffix}:last-known-good`,
    pending: `${PENDING_PREFIX}${suffix}`,
  };
}

function writeState(storage, key, state, backupKey = null) {
  const serialized = JSON.stringify(normalizeState(state));
  try {
    if (backupKey) {
      const previous = storage.getItem(key);
      if (previous) storage.setItem(backupKey, previous);
    }
    storage.setItem(key, serialized);
  } catch (error) {
    throw new Error("No fue posible guardar la copia local para trabajar sin conexión.", { cause: error });
  }
}

function readState(storage, key, backupKey = `${key}:unused-backup`) {
  return readStoredState(storage, key, backupKey);
}

function statusCode(error) {
  return Number(error?.status ?? error?.statusCode ?? error?.cause?.status ?? 0);
}

export function isRetryableCloudError(error) {
  const status = statusCode(error);
  if (status === 401 || status === 403) return false;
  if (status === 408 || status === 425 || status === 429 || status >= 500) return true;
  if (error?.code === "42501" || error?.code === "PGRST301") return false;
  return error instanceof TypeError || status === 0;
}

export class SupabaseStateGateway {
  constructor({ client, userId }) {
    if (!client || !userId) throw new Error("La conexión cloud no está configurada.");
    this.client = client;
    this.userId = userId;
  }

  async load() {
    const { data, error } = await this.client
      .from("studyhub_states")
      .select("state, revision, updated_at")
      .eq("user_id", this.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      data: normalizeState(data.state),
      revision: Number(data.revision ?? data.state?.revision ?? 0),
      updatedAt: data.updated_at ?? data.state?.updatedAt ?? null,
    };
  }

  async save(nextState) {
    const state = normalizeState(nextState);
    const row = {
      user_id: this.userId,
      state,
      revision: state.revision,
      updated_at: state.updatedAt,
    };
    const { data, error } = await this.client
      .from("studyhub_states")
      .upsert(row, { onConflict: "user_id" })
      .select("state, revision, updated_at")
      .single();
    if (error) throw error;
    return {
      data: normalizeState(data.state),
      revision: Number(data.revision ?? state.revision),
      updatedAt: data.updated_at ?? state.updatedAt,
    };
  }
}

export class CloudStorageAdapter {
  constructor({
    gateway,
    userId,
    storage = globalThis.localStorage,
    eventTarget = globalThis,
    isOnline = () => globalThis.navigator?.onLine !== false,
  }) {
    if (!gateway || !userId || !storage) throw new Error("La persistencia cloud no está configurada.");
    this.gateway = gateway;
    this.userId = userId;
    this.storage = storage;
    this.eventTarget = eventTarget;
    this.isOnline = isOnline;
    this.keys = cloudStorageKeys(userId);
    this.status = { state: "loading", pending: false, message: "Conectando con la nube…" };
    this.statusListeners = new Set();
  }

  setStatus(state, pending, message) {
    this.status = { state, pending, message };
    this.statusListeners.forEach((listener) => listener(this.status));
  }

  subscribeStatus(listener) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  getStatus() {
    return this.status;
  }

  readCache() {
    return readState(this.storage, this.keys.cache, this.keys.backup);
  }

  readPending() {
    return readState(this.storage, this.keys.pending);
  }

  cache(nextState) {
    writeState(this.storage, this.keys.cache, nextState, this.keys.backup);
  }

  queue(nextState) {
    writeState(this.storage, this.keys.pending, nextState);
  }

  clearPending() {
    this.storage.removeItem(this.keys.pending);
  }

  async load() {
    const cached = this.readCache();
    const pending = this.readPending();
    if (this.isOnline()) {
      try {
        if (pending.data) {
          const uploaded = await this.gateway.save(pending.data);
          this.cache(uploaded.data);
          this.clearPending();
        }
        const remote = await this.gateway.load();
        if (remote) {
          this.cache(remote.data);
          this.setStatus("synced", false, "Sincronizado con la nube");
          return { data: remote.data, recovery: null, isNew: false, source: "cloud" };
        }

        const legacy = readStoredState(this.storage);
        const migrationCandidate = legacy.data ?? cached.data ?? null;
        if (migrationCandidate) {
          this.setStatus("synced", false, "Cuenta conectada · migración pendiente");
          return {
            data: createEmptyState(),
            recovery: legacy.recovery,
            isNew: false,
            source: "cloud-empty",
            migrationCandidate,
            migrationRequired: true,
          };
        }

        const initial = createDemoState();
        this.cache(initial);
        this.setStatus("synced", false, "Cuenta conectada · preparando la nube");
        return { data: initial, recovery: null, isNew: true, source: "cloud-new" };
      } catch (error) {
        const fallback = pending.data ?? cached.data;
        if (fallback) {
          const retryable = isRetryableCloudError(error);
          this.setStatus(retryable ? "offline" : "error", Boolean(pending.data), retryable ? "Sin conexión · cambios guardados localmente" : "No se pudo autorizar la sincronización");
          return {
            data: fallback,
            recovery: retryable ? "No se pudo contactar la nube. Se abrió la copia local de esta cuenta." : "La sesión cloud necesita volver a validarse.",
            isNew: false,
            source: "cache",
            offline: retryable,
            error,
          };
        }
        const safeFallback = createEmptyState();
        this.setStatus("offline", false, "Sin conexión · usando datos locales");
        return {
          data: safeFallback,
          recovery: "StudyHub está sin conexión. Tus datos locales anteriores se mantendrán separados hasta poder verificar la cuenta en la nube.",
          isNew: false,
          source: "offline-empty",
          offline: true,
          error,
        };
      }
    }

    const fallback = pending.data ?? cached.data ?? createEmptyState();
    const source = pending.data ? "pending" : cached.data ? "cache" : "offline-empty";
    this.setStatus("offline", Boolean(pending.data), pending.data ? "Sin conexión · sincronización pendiente" : "Sin conexión · usando la copia local");
    return { data: fallback, recovery: "StudyHub está sin conexión. Tus cambios se conservarán localmente.", isNew: false, source, offline: true };
  }

  async save(nextState) {
    const state = normalizeState(nextState);
    this.cache(state);
    this.queue(state);
    if (!this.isOnline()) {
      this.setStatus("offline", true, "Sin conexión · sincronización pendiente");
      return { data: state, synced: false };
    }
    this.setStatus("syncing", true, "Guardando en la nube…");
    try {
      const saved = await this.gateway.save(state);
      this.cache(saved.data);
      this.clearPending();
      this.setStatus("synced", false, "Sincronizado con la nube");
      return { ...saved, synced: true };
    } catch (error) {
      const retryable = isRetryableCloudError(error);
      this.setStatus(retryable ? "offline" : "error", true, retryable ? "Sin conexión · sincronización pendiente" : "No se pudo guardar en la nube");
      return { data: state, synced: false, retryable, error };
    }
  }

  async flush() {
    const pending = this.readPending();
    if (!pending.data) {
      this.setStatus("synced", false, "Sincronizado con la nube");
      return { data: null, synced: true };
    }
    if (!this.isOnline()) {
      this.setStatus("offline", true, "Sin conexión · sincronización pendiente");
      return { data: pending.data, synced: false };
    }
    this.setStatus("syncing", true, "Sincronizando cambios pendientes…");
    try {
      const saved = await this.gateway.save(pending.data);
      this.cache(saved.data);
      this.clearPending();
      this.setStatus("synced", false, "Sincronizado con la nube");
      return { ...saved, synced: true };
    } catch (error) {
      const retryable = isRetryableCloudError(error);
      this.setStatus(retryable ? "offline" : "error", true, retryable ? "Sin conexión · sincronización pendiente" : "No se pudo sincronizar la cuenta");
      return { data: pending.data, synced: false, retryable, error };
    }
  }

  subscribe(listener) {
    const onStorage = (event) => {
      if (event.key !== this.keys.cache || !event.newValue) return;
      try {
        listener(normalizeState(JSON.parse(event.newValue)));
      } catch {
        // Ignore malformed or partial writes from another tab.
      }
    };
    const onOnline = () => {
      void this.flush().then((result) => {
        if (result.synced && result.data) listener(result.data);
      });
    };
    this.eventTarget?.addEventListener?.("storage", onStorage);
    this.eventTarget?.addEventListener?.("online", onOnline);
    return () => {
      this.eventTarget?.removeEventListener?.("storage", onStorage);
      this.eventTarget?.removeEventListener?.("online", onOnline);
    };
  }
}

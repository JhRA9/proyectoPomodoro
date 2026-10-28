import { createDemoState, createEmptyState, normalizeState } from "./schema.js";
import { readStoredState } from "./localAdapter.js";

const CACHE_PREFIX = "studyhub:cloud-cache:1:";
const PENDING_PREFIX = "studyhub:cloud-pending:1:";
const MIGRATION_DECISION_PREFIX = "studyhub:cloud-migration-decision:1:";

export function cloudStorageKeys(userId) {
  const suffix = encodeURIComponent(String(userId));
  return {
    cache: `${CACHE_PREFIX}${suffix}`,
    backup: `${CACHE_PREFIX}${suffix}:last-known-good`,
    pending: `${PENDING_PREFIX}${suffix}`,
    migrationDecision: `${MIGRATION_DECISION_PREFIX}${suffix}`,
    remoteRevision: `${CACHE_PREFIX}${suffix}:remote-revision`,
    conflictBackup: `${CACHE_PREFIX}${suffix}:conflict`,
  };
}

function hasStudyData(state) {
  return [state?.projects, state?.tasks, state?.focusSessions, state?.learningEntries]
    .some((records) => Array.isArray(records) && records.length > 0);
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
  if (error?.code === "STUDYHUB_CONFLICT") return false;
  const status = statusCode(error);
  if (status === 401 || status === 403) return false;
  if (status === 408 || status === 425 || status === 429 || status >= 500) return true;
  if (error?.code === "42501" || error?.code === "PGRST301") return false;
  return error instanceof TypeError || status === 0;
}

function conflictError() {
  return Object.assign(new Error("Hay cambios en otro dispositivo. Tu copia local está conservada; guarda una copia y carga la nube antes de continuar."), { code: "STUDYHUB_CONFLICT", status: 409 });
}

function sameSnapshot(a, b) {
  const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  return stable(a) === stable(b);
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

  async save(nextState, { expectedRevision } = {}) {
    if (expectedRevision !== null && !Number.isSafeInteger(expectedRevision)) throw conflictError();
    const state = normalizeState(nextState);
    if (expectedRevision !== null && state.revision <= expectedRevision) {
      const remote = await this.load();
      if (remote && sameSnapshot(remote.data, state)) return remote;
      throw conflictError();
    }
    const row = {
      user_id: this.userId,
      state,
      revision: state.revision,
      updated_at: state.updatedAt,
    };
    const query = expectedRevision === null
      ? this.client.from("studyhub_states").insert(row)
      : this.client.from("studyhub_states").update(row).eq("user_id", this.userId).eq("revision", expectedRevision);
    const { data, error } = await query.select("state, revision, updated_at").maybeSingle();
    if (error && error.code !== "23505") throw error;
    if (!data) {
      // An acknowledged write may have lost its response. Recover only an exact match.
      const remote = await this.load();
      if (remote && sameSnapshot(remote.data, state)) return remote;
      throw conflictError();
    }
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
    try { this.remoteRevision = JSON.parse(storage.getItem(this.keys.remoteRevision) ?? '"unknown"'); }
    catch { this.remoteRevision = "unknown"; }
    this.status = { state: "loading", pending: false, message: "Conectando con la nube…" };
    this.statusListeners = new Set();
    this.uploadTail = Promise.resolve();
    this.writerId = globalThis.crypto.randomUUID();
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
    try {
      const raw = this.storage.getItem(this.keys.pending);
      if (!raw) return { data: null };
      const parsed = JSON.parse(raw);
      if (parsed.queueVersion === 2) return { data: normalizeState(parsed.state), expectedRevision: parsed.expectedRevision, writerId: parsed.writerId };
      // Old queues have no trustworthy base; never guess from their final revision.
      return { ...readState(this.storage, this.keys.pending), expectedRevision: "unknown" };
    } catch (error) { return { data: null, error }; }
  }

  cache(nextState) {
    writeState(this.storage, this.keys.cache, nextState, this.keys.backup);
  }

  queue(nextState) {
    this.writePending(nextState, this.remoteRevision, this.writerId);
  }

  writePending(state, expectedRevision, writerId) {
    this.storage.setItem(this.keys.pending, JSON.stringify({ queueVersion: 2, state: normalizeState(state), expectedRevision, writerId }));
  }

  clearPending() {
    this.storage.removeItem(this.keys.pending);
  }

  rememberRevision(revision) {
    this.storage.setItem(this.keys.remoteRevision, JSON.stringify(revision));
    this.remoteRevision = revision;
  }

  upload(state) {
    const job = this.uploadTail.then(async () => {
      const before = this.readPending();
      const expectedRevision = sameSnapshot(before.data, state) ? before.expectedRevision : this.remoteRevision;
      const saved = await this.gateway.save(state, { expectedRevision });
      this.rememberRevision(saved.revision);
      // A newer local edit can enter the queue while this request is in flight.
      const pending = this.readPending();
      if (sameSnapshot(pending.data, state)) {
        this.clearPending();
        this.cache(saved.data);
      } else if (pending.data && pending.writerId === this.writerId && pending.expectedRevision === expectedRevision) {
        this.writePending(pending.data, saved.revision, pending.writerId);
      }
      return saved;
    });
    this.uploadTail = job.catch(() => {});
    return job;
  }

  reportFailure(error, pending) {
    if (error?.code === "STUDYHUB_CONFLICT") this.setStatus("conflict", pending, error.message);
    else this.setStatus(isRetryableCloudError(error) ? "offline" : "error", pending,
      isRetryableCloudError(error) ? "Sin conexión · cambios guardados localmente" : "No se pudo autorizar la sincronización");
  }

  async useRemoteAfterConflict() {
    if (!this.isOnline()) throw new Error("Conéctate para cargar los cambios de la nube.");
    await this.uploadTail;
    const remote = await this.gateway.load();
    if (!remote) throw new Error("No se encontró la copia remota. La copia local sigue conservada.");
    const pending = this.readPending().data;
    if (pending) writeState(this.storage, `${this.keys.conflictBackup}:${Date.now()}:${Math.random()}`, pending);
    this.rememberRevision(remote.revision);
    this.cache(remote.data);
    this.clearPending();
    this.setStatus("synced", false, "Copia local conservada · nube cargada");
    return remote.data;
  }

  acknowledgeMigration(decision) {
    this.storage.setItem(this.keys.migrationDecision, decision);
  }

  async load() {
    const cached = this.readCache();
    const pending = this.readPending();
    if (pending.data) this.remoteRevision = pending.expectedRevision;
    if (this.isOnline()) {
      try {
        if (pending.data) {
          await this.upload(pending.data);
        }
        const remote = await this.gateway.load();
        if (remote) {
          this.rememberRevision(remote.revision);
          this.cache(remote.data);
          const legacy = readStoredState(this.storage);
          const migrationDecided = Boolean(this.storage.getItem(this.keys.migrationDecision));
          if (!migrationDecided && !hasStudyData(remote.data) && hasStudyData(legacy.data)) {
            this.setStatus("synced", false, "Cuenta conectada · migración pendiente");
            return {
              data: remote.data,
              recovery: legacy.recovery,
              isNew: false,
              source: "cloud-empty",
              migrationCandidate: legacy.data,
              migrationRequired: true,
            };
          }
          this.setStatus("synced", false, "Sincronizado con la nube");
          return { data: remote.data, recovery: null, isNew: false, source: "cloud" };
        }

        this.rememberRevision(null);
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
          this.reportFailure(error, Boolean(pending.data));
          return {
            data: fallback,
            recovery: error?.code === "STUDYHUB_CONFLICT" ? error.message : retryable ? "No se pudo contactar la nube. Se abrió la copia local de esta cuenta." : "La sesión cloud necesita volver a validarse.",
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
    this.queue(state);
    this.cache(state);
    if (!this.isOnline()) {
      this.setStatus("offline", true, "Sin conexión · sincronización pendiente");
      return { data: state, synced: false };
    }
    this.setStatus("syncing", true, "Guardando en la nube…");
    try {
      const saved = await this.upload(state);
      const pending = Boolean(this.readPending().data);
      this.setStatus(pending ? "syncing" : "synced", pending, pending ? "Hay cambios locales pendientes" : "Sincronizado con la nube");
      return { ...saved, synced: !pending };
    } catch (error) {
      const retryable = isRetryableCloudError(error);
      this.reportFailure(error, true);
      return { data: state, synced: false, retryable, error };
    }
  }

  async flush() {
    const pending = this.readPending();
    if (!pending.data) {
      if (!this.isOnline()) {
        this.setStatus("offline", false, "Sin conexión · usando la copia local");
        return { data: null, synced: false };
      }
      try {
        const remote = await this.gateway.load();
        if (this.readPending().data) return { data: null, synced: false };
        if (remote) { this.rememberRevision(remote.revision); this.cache(remote.data); }
        this.setStatus("synced", false, "Sincronizado con la nube");
        return { data: remote?.data ?? null, synced: true };
      } catch (error) {
        this.reportFailure(error, false);
        return { data: null, synced: false, error };
      }
    }
    if (!this.isOnline()) {
      this.setStatus("offline", true, "Sin conexión · sincronización pendiente");
      return { data: pending.data, synced: false };
    }
    this.setStatus("syncing", true, "Sincronizando cambios pendientes…");
    try {
      const saved = await this.upload(pending.data);
      const stillPending = Boolean(this.readPending().data);
      this.setStatus(stillPending ? "syncing" : "synced", stillPending, stillPending ? "Hay cambios locales pendientes" : "Sincronizado con la nube");
      return { ...saved, synced: !stillPending };
    } catch (error) {
      const retryable = isRetryableCloudError(error);
      this.reportFailure(error, true);
      return { data: pending.data, synced: false, retryable, error };
    }
  }

  subscribe(listener) {
    const onStorage = (event) => {
      const acknowledged = event.key === this.keys.pending && event.newValue === null;
      if (!acknowledged && (event.key !== this.keys.cache || !event.newValue)) return;
      if (this.readPending().data) return;
      try {
        const next = acknowledged ? this.readCache().data : normalizeState(JSON.parse(event.newValue));
        if (!next) return;
        this.rememberRevision(next.revision);
        listener(next);
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

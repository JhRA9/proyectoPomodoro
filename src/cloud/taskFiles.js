import {sha256} from '../utils/integrity.js';
export const TASK_FILES_BUCKET = "studyhub-task-files";
export const MAX_TASK_FILE_BYTES = 20 * 1024 * 1024;

const PAGE_SIZE = 100;
const CLEANUP_PREFIX = "studyhub:task-file-cleanup:1:";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const FILE_KEY = /^[0-9a-f]{64}$/;

function assertId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) {
    throw new Error(`${label} no válido.`);
  }
  return value;
}

function assertKey(value) {
  if (typeof value !== "string" || !FILE_KEY.test(value)) {
    throw new Error("El identificador del archivo no es válido.");
  }
  return value;
}

function normalizedName(value) {
  if (typeof value !== "string") throw new Error("Selecciona un archivo válido.");
  const name = value.trim().normalize("NFC");
  if (!name || name.length > 255 || name === "." || name === ".." || /[\\/\x00-\x1f\x7f]/u.test(name)) {
    throw new Error("El nombre del archivo no es válido.");
  }
  return name;
}

async function keyForName(name) {
  const canonical = normalizedName(name).toLowerCase();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertFile(file) {
  const name = normalizedName(file?.name);
  if (!Number.isSafeInteger(file?.size) || file.size <= 0 || file.size > MAX_TASK_FILE_BYTES) {
    throw new Error("El archivo debe tener contenido y pesar como máximo 20 MB.");
  }
  return name;
}

function storageFailure(message, error) {
  return new Error(message, { cause: error });
}

export class TaskFileStore {
  constructor(client, userId, storage = globalThis.localStorage) {
    if (!client?.storage?.from) throw new Error("El almacenamiento de archivos no está configurado.");
    this.userId = assertId(userId, "El usuario");
    this.bucket = client.storage.from(TASK_FILES_BUCKET);
    this.storage = storage;
    this.cleanupKey = `${CLEANUP_PREFIX}${encodeURIComponent(this.userId)}`;
  }

  folder(taskId) {
    return `${this.userId}/${assertId(taskId, "La tarea")}`;
  }

  path(taskId, key) {
    return `${this.folder(taskId)}/${assertKey(key)}`;
  }

  async listEntries(taskId) {
    const folder = this.folder(taskId);
    const entries = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.bucket.list(folder, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw storageFailure("No se pudieron consultar los archivos de la tarea.", error);
      if (!Array.isArray(data)) throw new Error("La lista de archivos no es válida.");
      entries.push(...data.filter((entry) => entry?.id != null && FILE_KEY.test(entry.name)));
      if (data.length < PAGE_SIZE) break;
    }
    return entries;
  }

  async list(taskId, { versions = false } = {}) {
    const entries = await this.listEntries(taskId);
    const result = await Promise.all(entries.map(async (entry) => {
      const { data: info, error } = await this.bucket.info(this.path(taskId, entry.name));
      if (error) throw storageFailure("No se pudo consultar la información del archivo.", error);
      const metadata = info?.metadata ?? {};
      const custom = info?.user_metadata ?? info?.userMetadata ?? metadata.user_metadata ?? metadata;
      const originalName = custom?.originalName;
      return {
        key: entry.name,
        name: typeof originalName === "string" ? originalName : entry.name,
        sizeBytes: Number(info?.size ?? metadata.size ?? entry.metadata?.size ?? 0),
        updatedAt: info?.last_modified ?? info?.lastModified ?? entry.updated_at ?? null,
        contentType: info?.content_type ?? info?.contentType ?? metadata.mimetype ?? entry.metadata?.mimetype ?? "application/octet-stream",
      };
    }));
    if(versions)return result;
    const latest=new Map();
    for(const item of result){const name=item.name.normalize('NFC').toLowerCase(),old=latest.get(name);if(!old||String(item.updatedAt)>String(old.updatedAt))latest.set(name,item);}
    return [...latest.values()];
  }

  async upload(taskId, file) {
    const name = assertFile(file);
    const key = await keyForName(name);
    const existing = (await this.listEntries(taskId)).some((entry) => entry.name === key);
    const contentType = file.type || "application/octet-stream";
    const { error } = await this.bucket.upload(this.path(taskId, key), file, {
      upsert: true,
      cacheControl: "0",
      contentType,
      metadata: { originalName: name },
    });
    if (error) throw storageFailure("No se pudo subir el archivo. Inténtalo de nuevo.", error);
    const { data: info, error: infoError } = await this.bucket.info(this.path(taskId, key));
    if (infoError) throw storageFailure("El archivo se subió, pero no se pudo confirmar su información.", infoError);
    return {
      kind: existing ? "updated" : "created",
      file: {
        key,
        name,
        sizeBytes: file.size,
        updatedAt: info?.last_modified ?? info?.lastModified ?? new Date().toISOString(),
        contentType,
      },
    };
  }

  async download(taskId, key, cacheNonce = Date.now()) {
    const { data, error } = await this.bucket.download(this.path(taskId, key), {
      cacheNonce: String(cacheNonce),
    });
    if (error) throw storageFailure("No se pudo descargar el archivo.", error);
    if (!(data instanceof Blob)) throw new Error("La descarga no devolvió un archivo válido.");
    return data;
  }

  // Explicit fidelity-preserving path. Legacy attachments remain readable.
  pendingOriginals(requestId) {
    if(!this.storage)return [];
    const rows=JSON.parse(this.storage.getItem(`studyhub:original-uploads:1:${this.userId}`)||'[]');
    if(!Array.isArray(rows)||rows.some(row=>row.file?.path!==this.path(row.file?.taskId,row.file?.key)))throw new Error('Registro de originales pendiente inválido. Conserva una copia antes de recuperarlo.');
    return requestId ? rows.filter(row=>row.requestId===requestId) : rows;
  }

  recordOriginal(requestId,file,status) {
    if(!this.storage||!requestId)return;
    const rows=this.pendingOriginals().filter(row=>!(row.requestId===requestId&&row.file.path===file.path));
    rows.push({requestId,file,status,at:new Date().toISOString()});
    this.storage.setItem(`studyhub:original-uploads:1:${this.userId}`,JSON.stringify(rows));
  }

  acknowledgeOriginals(requestId) {
    if(this.storage)this.storage.setItem(`studyhub:original-uploads:1:${this.userId}`,JSON.stringify(this.pendingOriginals().filter(row=>row.requestId!==requestId)));
  }

  async recoverOriginals(requestId) {
    const recovered=[];
    const latest=new Map(this.pendingOriginals(requestId).map(row=>[row.file.taskId+'/'+row.file.name.normalize('NFC').toLowerCase(),row]));
    for(const row of latest.values()) {
      const file=row.file;await this.downloadOriginal(file);
      const {data,error}=await this.bucket.info(file.path);if(error)throw storageFailure('Vuelve a seleccionar el original pendiente para recuperarlo.',error);
      recovered.push({...file,version:data.last_modified??data.lastModified});
    }
    return recovered;
  }

  async uploadOriginal(taskId, file, {requestId} = {}) {
    const name=assertFile(file);this.folder(taskId);
    const contentHash=await sha256(file);
    const key=await sha256(`${normalizedName(name).toLowerCase()}\u0000${contentHash}`);
    const path=this.path(taskId,key),contentType=file.type||'application/octet-stream';
    const reference={taskId,key,path,name,sizeBytes:file.size,contentType,sha256:contentHash,representation:'original'};
    this.recordOriginal(requestId,reference,'uploading');
    const existing=await this.bucket.info(path);
    if(existing.error){
      const {error}=await this.bucket.upload(path,file,{upsert:false,cacheControl:'0',contentType,metadata:{originalName:name,contentHash,immutable:true,representation:'original'}});
      // A concurrent identical upload can win; verify the bytes before accepting.
      if(error){const recovered=await this.bucket.info(path);if(recovered.error)throw storageFailure('No se pudo conservar el original.',error);}
    }
    const bytes=await this.download(taskId,key);
    if(bytes.size!==file.size||await sha256(bytes)!==contentHash)throw new Error('El original recibido no coincide. No se vinculó a la entrega.');
    const {data:info,error}=await this.bucket.info(path);
    if(error)throw storageFailure('No se pudo confirmar la versión del original.',error);
    const confirmed={...reference,version:info.last_modified??info.lastModified};
    this.recordOriginal(requestId,confirmed,'verified');
    return confirmed;
  }

  async downloadOriginal(reference) {
    if(reference.path!==this.path(reference.taskId,reference.key))throw new Error('Referencia de archivo inválida.');
    const bytes=await this.download(reference.taskId,reference.key,reference.version);
    if(bytes.size!==reference.sizeBytes||await sha256(bytes)!==reference.sha256)throw new Error('La integridad del original no coincide.');
    return bytes;
  }

  async removeTask(taskId) {
    const entries = await this.listEntries(taskId);
    for (let index = 0; index < entries.length; index += PAGE_SIZE) {
      const paths = entries.slice(index, index + PAGE_SIZE).map((entry) => this.path(taskId, entry.name));
      const { error } = await this.bucket.remove(paths);
      if (error) throw storageFailure("No se pudieron eliminar los archivos de la tarea.", error);
    }
    return entries.length;
  }

  async removeTasks(taskIds) {
    if (!Array.isArray(taskIds)) throw new Error("La lista de tareas no es válida.");
    const uniqueTaskIds = [...new Set(taskIds.map((taskId) => assertId(taskId, "La tarea")))];
    let removed = 0;
    for (const taskId of uniqueTaskIds) removed += await this.removeTask(taskId);
    return removed;
  }

  readCleanupQueue() {
    if (!this.storage) throw new Error("No se puede guardar la limpieza de archivos en este navegador.");
    let parsed;
    try {
      parsed = JSON.parse(this.storage.getItem(this.cleanupKey) ?? "[]");
    } catch (error) {
      throw storageFailure("No se pudo leer la limpieza pendiente de archivos.", error);
    }
    if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string" || !SAFE_ID.test(id))) {
      throw new Error("La limpieza pendiente de archivos no es válida.");
    }
    return [...new Set(parsed)];
  }

  writeCleanupQueue(taskIds) {
    if (!this.storage) throw new Error("No se puede guardar la limpieza de archivos en este navegador.");
    try {
      if (taskIds.length) this.storage.setItem(this.cleanupKey, JSON.stringify(taskIds));
      else this.storage.removeItem(this.cleanupKey);
    } catch (error) {
      throw storageFailure("No se pudo guardar la limpieza pendiente de archivos.", error);
    }
  }

  queueCleanup(taskIds) {
    if (!Array.isArray(taskIds)) throw new Error("La lista de tareas no es válida.");
    const ids = taskIds.map((id) => assertId(id, "La tarea"));
    const pending = [...new Set([...this.readCleanupQueue(), ...ids])];
    this.writeCleanupQueue(pending);
    return pending.length;
  }

  async flushCleanup(activeTaskIds) {
    if (!Array.isArray(activeTaskIds)) throw new Error("Se necesita la lista de tareas existentes para limpiar archivos.");
    const active = new Set(activeTaskIds.map((id) => assertId(id, "La tarea")));
    const pending = this.readCleanupQueue().filter((id) => !active.has(id));
    // Persist cancellation first: a restored task must never be deleted by a later retry.
    this.writeCleanupQueue(pending);
    let removed = 0;
    const failed = [];
    for (const taskId of pending) {
      try {
        removed += await this.removeTask(taskId);
        this.writeCleanupQueue(this.readCleanupQueue().filter((id) => id !== taskId));
      } catch {
        failed.push(taskId);
      }
    }
    return { removed, pending: this.readCleanupQueue().length, failed };
  }
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_TASK_FILE_BYTES, TASK_FILES_BUCKET, TaskFileStore } from "../src/cloud/taskFiles.js";

function file(name, contents = "datos", type = "application/pdf") {
  return new File([contents], name, { type });
}

function fakeStorage() {
  const objects = new Map();
  const calls = [];
  const failures = new Map();
  let sequence = 0;

  function client(userId) {
    const allowed = (path) => path.startsWith(`${userId}/`);
    const result = (operation, path, value) => {
      calls.push({ operation, path, value });
      if (failures.has(operation)) return { data: null, error: failures.get(operation) };
      if (!allowed(path)) return { data: null, error: new Error("RLS") };
      return null;
    };
    return {
      storage: {
        from(bucket) {
          expect(bucket).toBe(TASK_FILES_BUCKET);
          return {
            async list(folder, options) {
              const denied = result("list", folder, options);
              if (denied) return denied;
              const prefix = `${folder}/`;
              const entries = [...objects.entries()]
                .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
                .map(([path, object]) => ({
                  id: object.id,
                  name: path.slice(prefix.length),
                  updated_at: object.updatedAt,
                  metadata: { size: object.file.size, mimetype: object.file.type },
                }))
                .sort((a, b) => a.name.localeCompare(b.name));
              return { data: entries.slice(options.offset, options.offset + options.limit), error: null };
            },
            async upload(path, body, options) {
              const denied = result("upload", path, options);
              if (denied) return denied;
              const prior = objects.get(path);
              if (prior && !options.upsert) return { data: null, error: new Error("Already exists") };
              sequence += 1;
              objects.set(path, {
                id: prior?.id ?? String(sequence),
                file: body,
                originalName: options.metadata.originalName,
                updatedAt: `2026-09-21T00:00:${String(sequence).padStart(2, "0")}.000Z`,
              });
              return { data: { path }, error: null };
            },
            async info(path) {
              const denied = result("info", path);
              if (denied) return denied;
              const object = objects.get(path);
              if (!object) return { data: null, error: new Error("Not found") };
              return {
                data: {
                  size: object.file.size,
                  content_type: object.file.type,
                  last_modified: object.updatedAt,
                  metadata: { originalName: object.originalName },
                },
                error: null,
              };
            },
            async download(path, options) {
              const denied = result("download", path, options);
              if (denied) return denied;
              const object = objects.get(path);
              return object
                ? { data: object.file, error: null }
                : { data: null, error: new Error("Not found") };
            },
            async remove(paths) {
              const denied = result("remove", paths[0], paths);
              if (denied) return denied;
              for (const path of paths) objects.delete(path);
              return { data: paths, error: null };
            },
          };
        },
      },
    };
  }

  return { client, objects, calls, failures };
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

describe("TaskFileStore", () => {
  it("permite tareas sin adjuntos y lista por páginas sin perder archivos", async () => {
    const fake = fakeStorage();
    const store = new TaskFileStore(fake.client("user-a"), "user-a");
    expect(await store.list("task-a")).toEqual([]);
    expect(fake.calls.some((call) => call.operation === "upload")).toBe(false);

    for (let index = 0; index < 105; index += 1) {
      await store.upload("task-a", file(`doc-${index}.pdf`));
    }
    const listed = await store.list("task-a");
    expect(listed).toHaveLength(105);
    expect(listed.every((item) => item.name.startsWith("doc-") && item.sizeBytes > 0)).toBe(true);
    expect(fake.calls.some((call) => call.operation === "list" && call.value.offset === 100)).toBe(true);
  });

  it("reemplaza el mismo nombre con otra capitalización o forma Unicode", async () => {
    const fake = fakeStorage();
    const store = new TaskFileStore(fake.client("user-a"), "user-a");
    const first = await store.upload("task-a", file("Café.pdf", "antes"));
    const second = await store.upload("task-a", file("CAFE\u0301.PDF", "después"));
    expect(first.kind).toBe("created");
    expect(second.kind).toBe("updated");
    expect(second.file.key).toBe(first.file.key);
    expect(fake.objects.size).toBe(1);
    expect((await store.list("task-a"))[0].name).toBe("CAFÉ.PDF");
    expect(fake.calls.filter((call) => call.operation === "upload").every((call) => call.value.upsert)).toBe(true);
  });

  it("mantiene aisladas las tareas y cuentas y descarga con cacheNonce", async () => {
    const fake = fakeStorage();
    const a = new TaskFileStore(fake.client("user-a"), "user-a");
    const b = new TaskFileStore(fake.client("user-b"), "user-b");
    const { file: attachment } = await a.upload("task-a", file("Guía.pdf"));
    expect(await a.list("task-b")).toEqual([]);
    expect(await b.list("task-a")).toEqual([]);
    await expect(b.download("task-a", attachment.key)).rejects.toThrow("No se pudo descargar");
    const blob = await a.download("task-a", attachment.key, attachment.updatedAt);
    expect(await blob.text()).toBe("datos");
    expect(fake.calls.at(-1).value.cacheNonce).toBe(attachment.updatedAt);
  });

  it("rechaza entradas inválidas antes de enviar datos y propaga fallos", async () => {
    const fake = fakeStorage();
    const store = new TaskFileStore(fake.client("user-a"), "user-a");
    await expect(store.upload("../otro", file("doc.pdf"))).rejects.toThrow("tarea");
    await expect(store.upload("task-a", file("../doc.pdf"))).rejects.toThrow("nombre");
    await expect(store.upload("task-a", { name: "grande.pdf", size: MAX_TASK_FILE_BYTES + 1 })).rejects.toThrow("20 MB");
    await expect(store.download("task-a", "../otro")).rejects.toThrow("identificador");
    expect(fake.calls).toHaveLength(0);

    fake.failures.set("upload", new Error("network"));
    await expect(store.upload("task-a", file("doc.pdf"))).rejects.toThrow("No se pudo subir");
    expect(fake.objects.size).toBe(0);
    fake.failures.delete("upload");
    fake.failures.set("list", new Error("network"));
    await expect(store.list("task-a")).rejects.toThrow("No se pudieron consultar");
  });

  it("elimina sólo los archivos de las tareas indicadas", async () => {
    const fake = fakeStorage();
    const store = new TaskFileStore(fake.client("user-a"), "user-a");
    await store.upload("task-a", file("uno.pdf"));
    await store.upload("task-a", file("dos.pdf"));
    await store.upload("task-b", file("tres.pdf"));
    await expect(store.removeTasks(["task-a", "../otra"])).rejects.toThrow("tarea");
    expect(await store.list("task-a")).toHaveLength(2);
    expect(await store.removeTasks(["task-a", "task-a"])).toBe(2);
    expect(await store.list("task-a")).toEqual([]);
    expect(await store.list("task-b")).toHaveLength(1);
  });

  it("conserva la limpieza pendiente tras fallos y la reintenta al remontar", async () => {
    const fake = fakeStorage();
    const storage = memoryStorage();
    const store = new TaskFileStore(fake.client("user-a"), "user-a", storage);
    await store.upload("task-a", file("uno.pdf"));
    expect(store.queueCleanup(["task-a"])).toBe(1);
    fake.failures.set("remove", new Error("offline"));
    expect(await store.flushCleanup([])).toEqual({ removed: 0, pending: 1, failed: ["task-a"] });
    expect(await store.list("task-a")).toHaveLength(1);
    fake.failures.delete("remove");
    const remounted = new TaskFileStore(fake.client("user-a"), "user-a", storage);
    expect(await remounted.flushCleanup([])).toEqual({ removed: 1, pending: 0, failed: [] });
    expect(await remounted.list("task-a")).toEqual([]);
  });

  it("cancela la eliminación de tareas restauradas y separa las colas por cuenta", async () => {
    const fake = fakeStorage();
    const storage = memoryStorage();
    const a = new TaskFileStore(fake.client("user-a"), "user-a", storage);
    const b = new TaskFileStore(fake.client("user-b"), "user-b", storage);
    await a.upload("task-a", file("uno.pdf"));
    a.queueCleanup(["task-a"]);
    expect(await b.flushCleanup([])).toEqual({ removed: 0, pending: 0, failed: [] });
    expect(await a.flushCleanup(["task-a"])).toEqual({ removed: 0, pending: 0, failed: [] });
    expect(await a.list("task-a")).toHaveLength(1);
    expect(await a.flushCleanup([])).toEqual({ removed: 0, pending: 0, failed: [] });
  });

  it("valida toda la cola antes de cambiarla o borrar archivos", async () => {
    const fake = fakeStorage();
    const storage = memoryStorage();
    const store = new TaskFileStore(fake.client("user-a"), "user-a", storage);
    await store.upload("task-a", file("uno.pdf"));
    expect(() => store.queueCleanup(["task-a", "../otra"])).toThrow("tarea");
    await expect(store.flushCleanup()).rejects.toThrow("lista de tareas existentes");
    expect(await store.list("task-a")).toHaveLength(1);
  });
});

describe("migración de archivos", () => {
  it("crea bucket privado con límite y políticas por usuario", () => {
    const sql = readFileSync(new URL("../supabase/migrations/202609210001_create_task_files_bucket.sql", import.meta.url), "utf8");
    expect(sql).toContain("'studyhub-task-files', 'studyhub-task-files', false, 20971520");
    for (const operation of ["select", "insert", "update", "delete"]) {
      expect(sql).toContain(`on storage.objects for ${operation} to authenticated`);
    }
    expect(sql.match(/\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/g)).toHaveLength(5);
  });
});

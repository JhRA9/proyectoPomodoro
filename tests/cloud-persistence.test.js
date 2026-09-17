import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudStorageKeys } from "../src/data/cloudAdapter.js";
import { STORAGE_KEY } from "../src/data/localAdapter.js";
import { createEmptyState } from "../src/data/schema.js";
import { TimerController } from "../src/timer/timerController.js";
import {
  FakeCloudBackend,
  FakeEventTarget,
  MemoryStorage,
  createCloudContext,
  createMutableClock,
} from "./helpers/cloudHarness.js";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const FIXED_NOW = new Date("2026-09-15T12:00:00.000Z");

function emptyState() {
  return createEmptyState(FIXED_NOW);
}

function stateWithProject(name, projectId) {
  const state = emptyState();
  state.projects.push({
    id: projectId,
    name,
    description: "",
    icon: "code",
    color: "#7657ff",
    createdAt: FIXED_NOW.toISOString(),
  });
  return state;
}

async function addProject(repository, name) {
  return repository.createProject({
    name,
    description: "",
    icon: "code",
    color: "#7657ff",
  });
}

async function addTask(repository, projectId, title = "Practicar arrays") {
  return repository.createTask(projectId, {
    title,
    description: "",
    dueDate: null,
    status: "pending",
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("cloud persistence across contexts", () => {
  it("shares sequential project and task changes between two clean contexts of the same user", async () => {
    const backend = new FakeCloudBackend();
    backend.seed(USER_A, emptyState());

    const browserA = await createCloudContext({ backend, userId: USER_A });
    const project = await addProject(browserA.repository, "Proyecto desde A");
    browserA.repository.destroy();

    const browserB = await createCloudContext({ backend, userId: USER_A });
    expect(browserB.repository.getState().projects.map((item) => item.name)).toContain("Proyecto desde A");
    await addTask(browserB.repository, project.id, "Tarea desde B");
    browserB.repository.destroy();

    const refreshedA = await createCloudContext({ backend, userId: USER_A });
    expect(refreshedA.repository.getState().tasks).toEqual([
      expect.objectContaining({ projectId: project.id, title: "Tarea desde B" }),
    ]);
    expect(backend.callsFor("save", USER_A)).toHaveLength(2);
  });

  it("persists two timed sessions and their reflections for a second context without double counting", async () => {
    const backend = new FakeCloudBackend();
    backend.seed(USER_A, emptyState());
    const time = createMutableClock();
    const browserA = await createCloudContext({ backend, userId: USER_A, clock: time.clock });
    const project = await addProject(browserA.repository, "Programación");
    const task = await addTask(browserA.repository, project.id);

    await browserA.repository.startTimer(task.id);
    time.advance(600);
    expect(await browserA.repository.stopTimer()).toBe(600);
    await browserA.repository.saveReflection({
      learned: "Aprendizaje 1",
      unresolved: "",
      nextSession: "",
      learnedImages: [{
        id: "note-image-cloud",
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        alt: "Apunte visual",
        width: 1,
        height: 1,
      }],
    });

    await browserA.repository.startTimer(task.id);
    time.advance(300);
    expect(await browserA.repository.stopTimer()).toBe(300);
    await browserA.repository.saveReflection({
      learned: "Aprendizaje 2",
      unresolved: "Duda 2",
      nextSession: "Paso 3",
    });
    browserA.repository.destroy();

    const browserB = await createCloudContext({ backend, userId: USER_A, clock: time.clock });
    const state = browserB.repository.getState();
    expect(state.focusSessions.map((session) => session.durationSeconds)).toEqual([600, 300]);
    expect(state.learningEntries.map((entry) => entry.learned)).toEqual(["Aprendizaje 1", "Aprendizaje 2"]);
    expect(state.learningEntries[0]).toMatchObject({
      unresolved: "",
      nextSession: "",
      learnedImages: [expect.objectContaining({ id: "note-image-cloud", alt: "Apunte visual" })],
    });
    expect(new Set(state.learningEntries.map((entry) => entry.focusSessionId)).size).toBe(2);
    expect(state.tasks.find((item) => item.id === task.id).accumulatedSeconds).toBe(900);
    expect(state.focusSessions.reduce((total, session) => total + session.durationSeconds, 0)).toBe(900);
  });

  it("persists task deletion and JSON import to cloud", async () => {
    const backend = new FakeCloudBackend();
    backend.seed(USER_A, emptyState());
    const browserA = await createCloudContext({ backend, userId: USER_A });
    const project = await addProject(browserA.repository, "Backup");
    const deletedTask = await addTask(browserA.repository, project.id, "Eliminarme");
    const keptTask = await addTask(browserA.repository, project.id, "Conservarme");

    await browserA.repository.deleteTask(deletedTask.id);
    let browserB = await createCloudContext({ backend, userId: USER_A });
    expect(browserB.repository.getState().tasks.map((task) => task.id)).toEqual([keptTask.id]);
    browserB.repository.destroy();

    const backup = browserA.repository.exportEnvelope();
    await browserA.repository.resetAll();
    expect(backend.stateFor(USER_A).projects).toHaveLength(0);
    await browserA.repository.importEnvelope(backup);

    browserB = await createCloudContext({ backend, userId: USER_A });
    expect(browserB.repository.getState().projects).toEqual([
      expect.objectContaining({ id: project.id, name: "Backup" }),
    ]);
    expect(browserB.repository.getState().tasks).toEqual([
      expect.objectContaining({ id: keptTask.id, title: "Conservarme" }),
    ]);
  });

  it("keeps different users isolated even when they share the same fake backend", async () => {
    const backend = new FakeCloudBackend();
    backend.seed(USER_A, emptyState());
    backend.seed(USER_B, emptyState());

    const userA = await createCloudContext({ backend, userId: USER_A });
    await addProject(userA.repository, "Privado de A");

    const userB = await createCloudContext({ backend, userId: USER_B });
    expect(userB.repository.getState().projects).toHaveLength(0);
    await addProject(userB.repository, "Privado de B");

    const refreshedA = await createCloudContext({ backend, userId: USER_A });
    expect(refreshedA.repository.getState().projects.map((project) => project.name)).toEqual(["Privado de A"]);
    expect(backend.stateFor(USER_B).projects.map((project) => project.name)).toEqual(["Privado de B"]);
    expect(backend.callsFor("save", USER_A).every((call) => call.userId === USER_A)).toBe(true);
    expect(backend.callsFor("save", USER_B).every((call) => call.userId === USER_B)).toBe(true);
  });
});

describe("migration and user-scoped cache", () => {
  it("does not write an empty cloud account before the legacy migration decision", async () => {
    const backend = new FakeCloudBackend();
    const legacy = stateWithProject("Proyecto local", "project-local");
    const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacy)]]);
    const original = storage.getItem(STORAGE_KEY);

    const context = await createCloudContext({ backend, userId: USER_A, storage });

    expect(context.initialization).toMatchObject({
      source: "cloud-empty",
      migrationRequired: true,
    });
    expect(context.initialization.migrationCandidate.projects[0].name).toBe("Proyecto local");
    expect(context.repository.getState().projects).toHaveLength(0);
    expect(backend.callsFor("save", USER_A)).toHaveLength(0);
    expect(backend.stateFor(USER_A)).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBe(original);
  });

  it("accepts migration once and preserves the untouched legacy copy", async () => {
    const backend = new FakeCloudBackend();
    const legacy = stateWithProject("Migrado", "project-migrated");
    const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacy)]]);
    const original = storage.getItem(STORAGE_KEY);
    const context = await createCloudContext({ backend, userId: USER_A, storage });

    await context.repository.replaceFromMigration(context.initialization.migrationCandidate);

    expect(backend.callsFor("save", USER_A)).toHaveLength(1);
    expect(backend.stateFor(USER_A).projects[0]).toMatchObject({ id: "project-migrated", name: "Migrado" });
    expect(storage.getItem(STORAGE_KEY)).toBe(original);

    const cleanBrowser = await createCloudContext({ backend, userId: USER_A });
    expect(cleanBrowser.initialization.migrationRequired).not.toBe(true);
    expect(cleanBrowser.repository.getState().projects[0].name).toBe("Migrado");
  });

  it("offers recovery when an existing cloud row is empty and legacy data remains", async () => {
    const backend = new FakeCloudBackend();
    backend.seed(USER_A, emptyState());
    const legacy = stateWithProject("Recuperable", "project-recoverable");
    const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacy)]]);

    const context = await createCloudContext({ backend, userId: USER_A, storage });

    expect(context.initialization).toMatchObject({
      source: "cloud-empty",
      migrationRequired: true,
    });
    expect(context.initialization.migrationCandidate.projects[0].name).toBe("Recuperable");

    await context.repository.replaceFromMigration(context.initialization.migrationCandidate);
    expect(backend.stateFor(USER_A).projects[0].name).toBe("Recuperable");
    expect(storage.getItem(cloudStorageKeys(USER_A).migrationDecision)).toBe("migrated");
  });

  it("omits migration by creating a new empty cloud space without deleting legacy data", async () => {
    const backend = new FakeCloudBackend();
    const legacy = stateWithProject("Solo local", "project-local-only");
    const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacy)]]);
    const original = storage.getItem(STORAGE_KEY);
    const context = await createCloudContext({ backend, userId: USER_A, storage });

    await context.repository.persistCurrentState();

    expect(backend.callsFor("save", USER_A)).toHaveLength(1);
    expect(backend.stateFor(USER_A).projects).toHaveLength(0);
    expect(storage.getItem(STORAGE_KEY)).toBe(original);
    expect(storage.getItem(cloudStorageKeys(USER_A).migrationDecision)).toBe("skipped");

    const refreshed = await createCloudContext({ backend, userId: USER_A, storage });
    expect(refreshed.initialization.migrationRequired).not.toBe(true);
  });

  it("partitions cache and pending keys by authenticated user", async () => {
    const backend = new FakeCloudBackend();
    backend.seed(USER_A, stateWithProject("Cache A", "project-cache-a"));
    backend.seed(USER_B, stateWithProject("Cache B", "project-cache-b"));
    const sharedStorage = new MemoryStorage();

    await createCloudContext({ backend, userId: USER_A, storage: sharedStorage });
    await createCloudContext({ backend, userId: USER_B, storage: sharedStorage });

    const keysA = cloudStorageKeys(USER_A);
    const keysB = cloudStorageKeys(USER_B);
    expect(keysA.cache).not.toBe(keysB.cache);
    expect(JSON.parse(sharedStorage.getItem(keysA.cache)).projects[0].name).toBe("Cache A");
    expect(JSON.parse(sharedStorage.getItem(keysB.cache)).projects[0].name).toBe("Cache B");

    backend.online = false;
    const offlineA = await createCloudContext({
      backend,
      userId: USER_A,
      storage: sharedStorage,
      connectivity: { online: false },
    });
    const offlineB = await createCloudContext({
      backend,
      userId: USER_B,
      storage: sharedStorage,
      connectivity: { online: false },
    });
    expect(offlineA.repository.getState().projects[0].name).toBe("Cache A");
    expect(offlineB.repository.getState().projects[0].name).toBe("Cache B");
  });

  it("never exposes unscoped legacy data to a cloud account while offline", async () => {
    const backend = new FakeCloudBackend();
    backend.online = false;
    const legacy = stateWithProject("Datos locales sin migrar", "project-legacy-private");
    const storage = new MemoryStorage([[STORAGE_KEY, JSON.stringify(legacy)]]);

    const account = await createCloudContext({
      backend,
      userId: USER_B,
      storage,
      connectivity: { online: false },
    });

    expect(account.repository.getState().projects).toHaveLength(0);
    expect(account.initialization.source).toBe("offline-empty");
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).projects[0].name).toBe("Datos locales sin migrar");
  });
});

describe("offline outbox and timer traffic", () => {
  it("keeps an offline change across reload and flushes it when the online event fires", async () => {
    const backend = new FakeCloudBackend();
    backend.seed(USER_A, emptyState());
    const storage = new MemoryStorage();
    const events = new FakeEventTarget();
    const connectivity = { online: true };
    const first = await createCloudContext({ backend, userId: USER_A, storage, eventTarget: events, connectivity });

    connectivity.online = false;
    backend.online = false;
    const project = await addProject(first.repository, "Creado offline");
    const keys = cloudStorageKeys(USER_A);
    expect(JSON.parse(storage.getItem(keys.pending)).projects[0].id).toBe(project.id);
    expect(backend.stateFor(USER_A).projects).toHaveLength(0);
    first.repository.destroy();

    const reloaded = await createCloudContext({ backend, userId: USER_A, storage, eventTarget: events, connectivity });
    expect(reloaded.repository.getState().projects[0].name).toBe("Creado offline");
    expect(reloaded.adapter.getStatus()).toMatchObject({ state: "offline", pending: true });

    const synchronized = new Promise((resolve) => {
      const unsubscribe = reloaded.adapter.subscribeStatus((status) => {
        if (status.state === "synced" && !status.pending) {
          unsubscribe();
          resolve(status);
        }
      });
    });
    connectivity.online = true;
    backend.online = true;
    events.dispatch("online");
    await synchronized;

    expect(storage.getItem(keys.pending)).toBeNull();
    expect(backend.stateFor(USER_A).projects[0].name).toBe("Creado offline");

    const cleanDevice = await createCloudContext({ backend, userId: USER_A });
    expect(cleanDevice.repository.getState().projects[0].name).toBe("Creado offline");
  });

  it("does not write cloud state on timer render ticks", async () => {
    const backend = new FakeCloudBackend();
    backend.seed(USER_A, emptyState());
    const time = createMutableClock();
    const context = await createCloudContext({ backend, userId: USER_A, clock: time.clock });
    const project = await addProject(context.repository, "Temporizador");
    const task = await addTask(context.repository, project.id, "Enfoque");
    await context.repository.startTimer(task.id);
    const writesAfterStart = backend.callsFor("save", USER_A).length;

    vi.useFakeTimers();
    vi.setSystemTime(time.clock());
    const onTick = vi.fn();
    const timer = new TimerController(context.repository, onTick);
    timer.start();
    await vi.advanceTimersByTimeAsync(10_000);
    timer.stop();

    expect(onTick.mock.calls.length).toBeGreaterThanOrEqual(20);
    expect(backend.callsFor("save", USER_A)).toHaveLength(writesAfterStart);
  });
});

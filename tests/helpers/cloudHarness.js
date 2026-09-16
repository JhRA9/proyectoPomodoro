import { CloudStorageAdapter } from "../../src/data/cloudAdapter.js";
import { StudyHubRepository } from "../../src/data/repository.js";
import { createStore } from "../../src/state/store.js";

export class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
}
export class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type, ...event });
  }
}

export class FakeCloudBackend {
  constructor() {
    this.online = true;
    this.rows = new Map();
    this.calls = [];
  }

  seed(userId, state) {
    this.rows.set(userId, structuredClone(state));
  }

  stateFor(userId) {
    const state = this.rows.get(userId);
    return state ? structuredClone(state) : null;
  }

  callsFor(operation, userId) {
    return this.calls.filter((call) => call.operation === operation && call.userId === userId);
  }

  gateway(userId) {
    const backend = this;
    return {
      async load() {
        backend.calls.push({ operation: "load", userId });
        if (!backend.online) throw new TypeError("Failed to fetch cloud state");
        const state = backend.rows.get(userId);
        if (!state) return null;
        return {
          data: structuredClone(state),
          revision: state.revision,
          updatedAt: state.updatedAt,
        };
      },

      async save(nextState) {
        backend.calls.push({ operation: "save", userId, data: structuredClone(nextState) });
        if (!backend.online) throw new TypeError("Failed to fetch cloud state");
        backend.rows.set(userId, structuredClone(nextState));
        return {
          data: structuredClone(nextState),
          revision: nextState.revision,
          updatedAt: nextState.updatedAt,
        };
      },
    };
  }
}

export function createMutableClock(initial = "2026-09-15T12:00:00.000Z") {
  let nowMs = new Date(initial).getTime();
  return {
    clock: () => new Date(nowMs),
    advance(seconds) {
      nowMs += seconds * 1000;
    },
  };
}

export async function createCloudContext({
  backend,
  userId,
  storage = new MemoryStorage(),
  eventTarget = new FakeEventTarget(),
  connectivity = { online: true },
  clock = () => new Date("2026-09-15T12:00:00.000Z"),
} = {}) {
  const adapter = new CloudStorageAdapter({
    gateway: backend.gateway(userId),
    userId,
    storage,
    eventTarget,
    isOnline: () => connectivity.online,
  });
  const store = createStore(null);
  const repository = new StudyHubRepository({ adapter, store, clock });
  const initialization = await repository.initialize();
  return {
    adapter,
    connectivity,
    eventTarget,
    initialization,
    repository,
    storage,
    store,
  };
}

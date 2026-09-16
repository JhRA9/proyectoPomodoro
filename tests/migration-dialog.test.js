import { describe, expect, it, vi } from "vitest";
import { StudyHubApp } from "../src/ui/app.js";

function createMigrationApp() {
  const repository = {
    adapter: null,
    getState: () => ({}),
    persistCurrentState: vi.fn(async () => {}),
    replaceFromMigration: vi.fn(async () => {}),
  };
  const router = { current: () => ({ name: "projects" }) };
  const app = new StudyHubApp({}, repository, {}, router);
  app.render = vi.fn();
  app.addToast = vi.fn();
  return { app, repository };
}

describe("migration dialog actions", () => {
  it("closes and rerenders after migrating local data", async () => {
    const { app, repository } = createMigrationApp();
    const candidate = { projects: [{ id: "local-project" }], tasks: [] };
    app.migrationCandidate = candidate;

    await app.runAction("migrate-local", { dataset: {} });

    expect(repository.replaceFromMigration).toHaveBeenCalledWith(candidate);
    expect(app.migrationCandidate).toBeNull();
    expect(app.render).toHaveBeenCalledOnce();
    expect(app.addToast).toHaveBeenCalledWith("Tus datos locales se migraron a la nube.");
  });

  it("closes and rerenders after keeping a new cloud space", async () => {
    const { app, repository } = createMigrationApp();
    app.migrationCandidate = { projects: [], tasks: [] };

    await app.runAction("skip-migration", { dataset: {} });

    expect(repository.persistCurrentState).toHaveBeenCalledOnce();
    expect(app.migrationCandidate).toBeNull();
    expect(app.render).toHaveBeenCalledOnce();
    expect(app.addToast).toHaveBeenCalledWith("Se creó un espacio nuevo. La copia local anterior se conservó.");
  });
});

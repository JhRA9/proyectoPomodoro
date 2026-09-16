import { describe, expect, it, vi } from "vitest";
import { StudyHubApp } from "../src/ui/app.js";

function createApp({ auth = null, account = null } = {}) {
  const repository = {
    adapter: null,
    getState: () => ({}),
  };
  const router = { current: () => ({ name: "projects" }) };
  const app = new StudyHubApp({}, repository, {}, router, { auth, account });
  app.render = vi.fn();
  app.addToast = vi.fn();
  return app;
}

describe("settings menu", () => {
  it("opens beside the profile gear and closes from the same trigger", async () => {
    const app = createApp();
    const target = { dataset: { settingsAnchor: "sidebar" } };

    await app.runAction("open-settings", target);
    expect(app.ui.settingsOpen).toBe(true);
    expect(app.ui.settingsAnchor).toBe("sidebar");

    await app.runAction("open-settings", target);
    expect(app.ui.settingsOpen).toBe(false);
    expect(app.ui.settingsAnchor).toBeNull();
    expect(app.render).toHaveBeenCalledTimes(2);
  });

  it("signs out through the authenticated settings menu", async () => {
    const auth = { signOut: vi.fn(async () => {}) };
    const app = createApp({ auth, account: { id: "user-a", email: "student@example.com" } });

    await app.runAction("sign-out", { dataset: {} });

    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});

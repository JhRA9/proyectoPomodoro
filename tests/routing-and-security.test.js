import { describe, expect, it } from "vitest";
import { assertBackupEnvelope, createDemoState, createExportEnvelope } from "../src/data/schema.js";
import { parseRoute } from "../src/router.js";
import { normalizeForSearch } from "../src/utils/text.js";

describe("search and routing hardening", () => {
  it("matches project text independently of accents and case", () => {
    expect(normalizeForSearch("Estudios de CÁLCULO")).toContain(normalizeForSearch("cal"));
    expect(normalizeForSearch("Programación")).toBe("programacion");
  });

  it("falls back safely when a hash contains malformed encoding", () => {
    expect(parseRoute("#/projects/%E0%A4%A")).toEqual({ name: "projects" });
  });

  it("rejects unsafe identifiers in imported backups", () => {
    const envelope = createExportEnvelope(createDemoState(new Date("2026-09-15T12:00:00.000Z")));
    envelope.data.projects[0].id = 'project" onmouseover="alert(1)';
    expect(() => assertBackupEnvelope(envelope)).toThrow(/identificadores inválidos/i);
  });
});

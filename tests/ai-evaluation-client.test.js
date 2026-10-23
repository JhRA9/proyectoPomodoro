import { describe, expect, it, vi } from "vitest";
import { AiEvaluationClient } from "../src/cloud/aiEvaluation.js";
import { defaultEvaluationConfig } from "../src/evaluation/constants.js";

function project(privacy = "personal") { return { evaluationConfig: { ...defaultEvaluationConfig(), privacy } }; }
const exercise = { title: "Ejercicio", description: "", objective: "", difficulty: 3, code: "const a = 1", expectedResult: "1", actualResult: "1", tests: {}, helpLevel: "none", independenceDeclared: true, files: [] };

describe("AI evaluation client", () => {
  it("invokes only the authenticated Supabase Edge Function", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { status: "completed", results: [{ provider: "gemini" }] }, error: null });
    const client = new AiEvaluationClient({ functions: { invoke } });
    await client.evaluate({ project: project(), exercise, competencies: [], provider: "gemini", profile: "fast" });
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke.mock.calls[0][0]).toBe("studyhub-evaluate");
    expect(invoke.mock.calls[0][1].body).not.toHaveProperty("apiKey");
  });

  it("blocks code transmission in private mode before any network call", async () => {
    const invoke = vi.fn();
    const client = new AiEvaluationClient({ functions: { invoke } });
    await expect(client.evaluate({ project: project("private"), exercise, competencies: [], provider: "both", profile: "deep" })).rejects.toThrow(/privado/i);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reports invalid or failed Edge Function responses", async () => {
    const client = new AiEvaluationClient({ functions: { invoke: vi.fn().mockResolvedValue({ data: { status: "error", message: "Cuota agotada" }, error: null }) } });
    await expect(client.evaluate({ project: project(), exercise: { ...exercise, code: "" }, competencies: [], provider: "gemini", profile: "complete" })).rejects.toThrow(/cuota agotada/i);
  });

  it("preserves a successful provider result when the other provider fails", async () => {
    const data = { status: "partial", results: [{ provider: "gemini" }], errors: [{ provider: "cloudflare", code: "quota_exhausted" }] };
    const client = new AiEvaluationClient({ functions: { invoke: vi.fn().mockResolvedValue({ data, error: null }) } });
    await expect(client.evaluate({ project: project(), exercise: { ...exercise, code: "" }, competencies: [], provider: "both", profile: "complete" })).resolves.toEqual(data);
  });
});

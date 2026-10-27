import { afterEach, describe, expect, it, vi } from "vitest";
import { claimEvaluation } from "../supabase/functions/studyhub-evaluate/requestStore.ts";

afterEach(() => vi.unstubAllGlobals());
function setup(state = "claimed", options = {}) {
  vi.stubGlobal("Deno", { env: { get: (name) => name === "SUPABASE_URL" ? "https://test.invalid" : "test-service-key" } });
  const cached = { status: "completed", results: [{ provider: "gemini", scores: [] }] };
  const fetch = vi.fn(async (url) => {
    if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "verified-user" }), { status: options.unauthorized ? 401 : 200 });
    if (url.includes("/rpc/")) return new Response(JSON.stringify({ state, response: cached }), { status: options.missingStore ? 404 : 200 });
    return new Response(null, { status: options.saveFailure ? 500 : 204 });
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, cached, request: new Request("https://test.invalid", { headers: { Authorization: "Bearer test-user" } }), payload: { requestId: "attempt:gemini", requestVersion: 2, provider: "gemini", exercise: { code: "test" } } };
}
describe("durable evaluation request gateway (simulated HTTP, no remote calls)", () => {
  it("uses the authenticated identity and saves the response privately", async () => {
    const t = setup(); const claim = await claimEvaluation(t.request, { ...t.payload, userId: "untrusted-user" });
    const body = JSON.parse(t.fetch.mock.calls[1][1].body); expect(body.p_user_id).toBe("verified-user"); expect(body.p_hash).toMatch(/^[a-f0-9]{64}$/);
    await claim.finish(t.cached); expect(t.fetch.mock.calls[2][0]).toContain("user_id=eq.verified-user"); expect(JSON.parse(t.fetch.mock.calls[2][1].body).state).toBe("completed");
  });
  it("returns the cached result without starting another request", async () => { const t=setup("completed"); const claim=await claimEvaluation(t.request,t.payload); expect(claim.cached).toEqual(t.cached); expect(t.fetch).toHaveBeenCalledTimes(2); });
  it("rejects requests already being processed", async () => { const t=setup("processing");await expect(claimEvaluation(t.request,t.payload)).rejects.toThrow(/sigue procesándose/); });
  it("rejects an unknown claim state before any provider call", async () => { const t=setup("unknown");await expect(claimEvaluation(t.request,t.payload)).rejects.toThrow(/estado inválido/); });
  it("rejects an identifier reused for a different solution", async () => { const t=setup("conflict");await expect(claimEvaluation(t.request,t.payload)).rejects.toThrow(/otra solución/); });
  it("fails before inference when remote migration is missing", async () => { const t=setup("claimed",{missingStore:true});await expect(claimEvaluation(t.request,t.payload)).rejects.toThrow(/No se envió/); });
  it("rejects invalid authentication without claiming storage", async () => { const t=setup("claimed",{unauthorized:true});await expect(claimEvaluation(t.request,t.payload)).rejects.toThrow(/sesión/);expect(t.fetch).toHaveBeenCalledTimes(1); });
  it("does not claim success if persisting a response fails", async () => { const t=setup("claimed",{saveFailure:true});const claim=await claimEvaluation(t.request,t.payload);await expect(claim.finish(t.cached)).rejects.toThrow(/bloqueado/); });
  it("retains the same content hash for explicit retry and honors quota", async () => { const t=setup("quota");await expect(claimEvaluation(t.request,t.payload)).rejects.toThrow(/límite/);const original=JSON.parse(t.fetch.mock.calls[1][1].body).p_hash;await expect(claimEvaluation(t.request,{...t.payload,retry:true})).rejects.toThrow();expect(JSON.parse(t.fetch.mock.calls[3][1].body)).toMatchObject({p_hash:original,p_retry:true}); });
});

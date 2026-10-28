// TEST ONLY. Copied as index.ts ONLY inside the disposable local staging folder.
// The application entrypoint is copied unchanged to actual.ts beside this file.
const nativeFetch = globalThis.fetch;
const localOrigin = new URL(Deno.env.get("SUPABASE_URL")!).origin;
if (!/^http:\/\/(kong|supabase_kong_studyhub-staging)(:8000)?$/.test(localOrigin)) {
  throw new Error("Synthetic transport requires the isolated local Kong service.");
}
if (Deno.env.get("GEMINI_API_KEY") !== "synthetic-no-provider-key" || Deno.env.get("CLOUDFLARE_API_TOKEN") !== "synthetic-no-provider-token") throw new Error("Synthetic credentials required");
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === localOrigin) return nativeFetch(input, init);
  if (!["generativelanguage.googleapis.com", "api.cloudflare.com"].includes(url.hostname)) throw new Error("External network forbidden in synthetic staging");
  const body = String(init?.body || "");
  await new Promise(resolve => setTimeout(resolve, body.includes("STAGING_SLOW") ? 1200 : 150));
  if (url.hostname === "api.cloudflare.com" && body.includes("STAGING_PARTIAL")) return Response.json({error:{message:"Synthetic quota"}}, {status:429});
  const areas = Boolean(body && JSON.parse(body).generationConfig?.responseJsonSchema?.properties?.areas);
  const result = areas ? { areas: [{ name: "Synthetic accessible forms", description: "Fixture only", objectives: ["Label controls"] }] }
    : {summary:"Synthetic staging review",provisionalLevel:null,scores:[{criterionId:"correctness",score:2,justification:"Synthetic fixture"}],strengths:[],weaknesses:[],recommendations:[],demonstratedCompetencyIds:[],notDemonstratedCompetencyIds:[]};
  if (!areas && body.includes("STAGING_INVALID_RESPONSE")) result.scores[0].score = 99;
  return Response.json(url.hostname === "generativelanguage.googleapis.com"
    ? {modelVersion:"synthetic-gemini",candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]}
    : {choices:[{message:{content:JSON.stringify(result)}}]});
};
await import("./actual.ts");

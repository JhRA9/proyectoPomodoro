// Durable idempotency is required for workspace requests. Missing infrastructure
// fails before any paid provider call; legacy callers keep the response contract
// but also pass the durable account quota, using a server-generated request ID.
export async function authenticateRequest(request: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw Object.assign(new Error("El registro seguro de solicitudes no está configurado."), { code: "not_configured" });
  const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: request.headers.get("Authorization") || "" }, signal: AbortSignal.timeout(10000) });
  if (!userResponse.ok) throw Object.assign(new Error("La sesión no es válida. Vuelve a iniciar sesión."), { code: "permission_error" });
  const user = await userResponse.json();
  if (typeof user.id !== "string" || !user.id) throw Object.assign(new Error("No se pudo identificar la cuenta."), { code: "permission_error" });
  return { url, key, user };
}

export async function claimEvaluation(request: Request, payload: any, identity?: Awaited<ReturnType<typeof authenticateRequest>>) {
  if (typeof payload.requestId !== "string" || !/^[a-zA-Z0-9:_-]{1,200}$/.test(payload.requestId)) throw Object.assign(new Error("Identificador de solicitud inválido."), { code: "invalid_request" });
  const { url, key, user } = identity || await authenticateRequest(request);
  const { requestId, retry: _retry, ...content } = payload;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(content)));
  const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const response = await fetch(`${url}/rest/v1/rpc/studyhub_claim_evaluation`, { method: "POST", headers,
    body: JSON.stringify({ p_user_id: user.id, p_request_id: requestId, p_hash: hash, p_retry: payload.retry === true }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Object.assign(new Error("Falta preparar el registro de solicitudes de StudyHub 2.0. No se envió contenido a la IA."), { code: "not_configured" });
  const claim = await response.json();
  if (claim.state === "conflict") throw new Error("Este identificador ya corresponde a otra solución. Crea un intento nuevo.");
  if (claim.state === "quota") throw Object.assign(new Error("Se alcanzó el límite de solicitudes del servidor."), { code: "quota_exhausted" });
  if (claim.state === "processing") throw new Error("Este intento sigue procesándose. Espera antes de reintentar; no se inició otra evaluación.");
  if (!["claimed", "completed", "failed"].includes(claim.state) || (claim.state !== "claimed" && !claim.response)) throw new Error("El registro de solicitudes devolvió un estado inválido. No se inició otra evaluación.");
  return {
    cached: claim.state === "completed" || claim.state === "failed" ? claim.response : null,
    async finish(result: any) {
      const target = `${url}/rest/v1/studyhub_evaluation_requests?user_id=eq.${encodeURIComponent(user.id)}&request_id=eq.${encodeURIComponent(requestId)}`;
      const saved = await fetch(target, { method: "PATCH", headers, body: JSON.stringify({ state: result.results?.length || (result.status === "completed" && result.areas?.length) ? "completed" : "failed", response: result, finished_at: new Date().toISOString() }), signal: AbortSignal.timeout(10000) });
      if (!saved.ok) throw new Error("La IA respondió pero no se pudo confirmar su registro seguro. El intento queda bloqueado para evitar cobros duplicados.");
    },
  };
}

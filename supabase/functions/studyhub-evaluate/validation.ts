// Keep network failures separate from invalid input and invalid provider output.
export function invalid(message: string, code = "invalid_request") {
  return Object.assign(new Error(message), { code });
}

export async function readPayload(request: Request, limit = 262144) {
  const reader = request.body?.getReader();
  if (!reader) throw invalid("Falta el contenido de la solicitud.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw invalid("La solicitud supera el límite de 256 KiB.", "payload_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw invalid("El contenido no es JSON válido."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw invalid("La solicitud debe ser un objeto.");
  if (payload.action !== undefined && !["evaluate", "check", "suggest-areas"].includes(payload.action)) throw invalid("Acción no reconocida.");
  if (payload.provider !== undefined && !["gemini", "cloudflare", "both"].includes(payload.provider)) throw invalid("Proveedor no reconocido.");
  if (payload.profile !== undefined && !["fast", "complete", "deep"].includes(payload.profile)) throw invalid("Perfil no reconocido.");
  return payload;
}

export function validateEvaluationInput(payload: any, maxChars: number) {
  if (!payload.exercise || typeof payload.exercise !== "object" || Array.isArray(payload.exercise) || !Array.isArray(payload.rubric?.criteria)) throw invalid("Faltan el ejercicio o los criterios de la rúbrica.");
  const ids = payload.rubric.criteria.map((criterion: any) => criterion?.id);
  if (!ids.length || ids.some((id: any) => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) throw invalid("La rúbrica contiene criterios inválidos o repetidos.");
  if (JSON.stringify({ rubric: payload.rubric, exercise: payload.exercise }).length > maxChars) throw invalid(`La evidencia supera el límite de ${maxChars} caracteres para este perfil.`, "payload_too_large");
}

export function parseReview(text: string, payload: any) {
  let result;
  try { result = JSON.parse(text); } catch { throw invalid("El proveedor devolvió JSON inválido.", "invalid_response"); }
  const fail = () => { throw invalid("El proveedor devolvió criterios o puntuaciones inválidos.", "invalid_response"); };
  if (!result || typeof result.summary !== "string" || !(result.provisionalLevel === null || typeof result.provisionalLevel === "string") || !Array.isArray(result.scores)) fail();
  const expected = new Set(payload.rubric.criteria.map((criterion: any) => criterion.id));
  const seen = new Set();
  for (const item of result.scores) {
    if (!item || !expected.has(item.criterionId) || seen.has(item.criterionId) || typeof item.score !== "number" || !Number.isFinite(item.score) || item.score < 0 || item.score > 4 || typeof item.justification !== "string") fail();
    seen.add(item.criterionId);
  }
  if (seen.size !== expected.size) fail();
  for (const field of ["strengths", "weaknesses", "recommendations", "demonstratedCompetencyIds", "notDemonstratedCompetencyIds"]) {
    if (!Array.isArray(result[field]) || result[field].some((value: any) => typeof value !== "string")) fail();
  }
  // Preserve the original fields and scores; never repair or average AI results.
  return result;
}

// Preserve useful failure evidence without persisting prompts, private code or
// an arbitrary provider response in error messages. Never repair partial JSON.
export function parseProviderReview(text: string, payload: any, metadata: any) {
  const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const reason = typeof metadata.finishReason === "string" && /^[a-zA-Z_]{1,40}$/.test(metadata.finishReason) ? metadata.finishReason : null;
  const diagnostics = { finishReason: reason, responseCharacters: typeof text === "string" ? text.length : 0,
    inputTokens: count(metadata.inputTokens), outputTokens: count(metadata.outputTokens), reasoningTokens: count(metadata.reasoningTokens) };
  try {
    if (["length", "MAX_TOKENS"].includes(reason || "")) throw invalid("El proveedor alcanzó el límite de salida. La respuesta está incompleta y no se guardó como evaluación. No se reintentó automáticamente.", "response_truncated");
    if (["content_filter", "SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(reason || "")) throw invalid("El proveedor bloqueó la respuesta. No se guardó como evaluación.", "response_blocked");
    return parseReview(text, payload);
  } catch (error) { throw Object.assign(error instanceof Error ? error : new Error("Respuesta inválida."), { diagnostics }); }
}

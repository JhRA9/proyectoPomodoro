// Transport diagnostics only: no inference, retries or changes to prompts.
export function providerStatusCode(status: number) {
  if (status === 400 || status === 422) return "provider_contract_error";
  if (status === 401 || status === 403) return "permission_error";
  if (status === 402) return "billing_required";
  if (status === 404) return "model_unavailable";
  if (status === 429) return "quota_exhausted";
  if (status === 503) return "provider_busy";
  if (status === 408 || status === 504) return "provider_timeout";
  return "connection_error";
}

export async function readProviderJson(response: Response, provider: string) {
  if (!response.ok) {
    const code = providerStatusCode(response.status);
    const reasons: Record<string, string> = {
      provider_contract_error: "rechazó los parámetros o el contrato de la solicitud",
      permission_error: "rechazó la autorización", billing_required: "requiere una configuración de facturación que no se modificará automáticamente",
      model_unavailable: "no encontró el modelo solicitado", quota_exhausted: "no tiene cuota disponible",
      provider_busy: "está temporalmente no disponible", provider_timeout: "agotó el tiempo de respuesta",
    };
    // Never parse or expose an arbitrary error body (which may be HTML, private
    // prompt echoes or gateway diagnostics). HTTP status survives every format.
    throw Object.assign(new Error(`${provider} ${reasons[code] || "no pudo responder"}. Puedes continuar manualmente. No se reintentó automáticamente.`), {code, status: response.status});
  }
  try { return await response.json(); }
  catch { throw Object.assign(new Error(`${provider} devolvió un cuerpo que no es JSON válido.`), {code:"invalid_response",status:response.status,diagnostics:{bodyFormat:"non_json"}}); }
}

export function geminiFinalText(body: any) {
  const parts = body?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts) ? parts.filter((part: any) => part?.thought !== true && typeof part?.text === "string").map((part: any) => part.text).join("") : "";
}

export function geminiSampling(model: string, temperature: number) {
  // Gemini 3.8 ignores temperature today and documents future rejection.
  // Retain existing behavior for other configured models; never change model.
  return /^gemini-3\.8-flash(?:$|-)/.test(model) ? {} : { temperature };
}

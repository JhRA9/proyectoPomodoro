import { cleanText, cleanMultilineText, normalizeForSearch } from "../utils/text.js";

export function normalizeAreaSuggestions(value) {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw new Error("Gemini debe devolver entre 1 y 12 áreas revisables.");
  const names = new Set();
  return value.map((item) => {
    if (!item || typeof item.name !== "string" || typeof item.description !== "string" || !Array.isArray(item.objectives) || item.objectives.some((x) => typeof x !== "string")) throw new Error("La propuesta de áreas tiene un formato inválido.");
    const name = cleanText(item.name, 100), key = normalizeForSearch(name);
    if (!name || names.has(key)) throw new Error("La propuesta contiene nombres vacíos o repetidos.");
    names.add(key);
    return { name, description: cleanMultilineText(item.description, 500), objectives: item.objectives.slice(0, 8).map((x) => cleanText(x, 150)).filter(Boolean) };
  });
}

export function areaContext(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new Error("Describe qué quieres estudiar en un máximo de 2000 caracteres.");
  return value.trim();
}

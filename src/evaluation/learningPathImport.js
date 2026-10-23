function values(value) { return Array.isArray(value) ? value : value == null ? [] : [value]; }
function first(object, keys, fallback = undefined) { for (const key of keys) if (object?.[key] !== undefined) return object[key]; return fallback; }
function text(value, limit = 2000) { return String(value ?? "").trim().slice(0, limit); }
function key(value, fallback) { return text(value || fallback, 128).replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || fallback; }
function date(value) { const candidate = text(value, 32).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T12:00:00`)) ? candidate : null; }
function links(item) {
  return values(first(item, ["links", "enlaces", "resources", "recursos", "link", "enlace", "url"], [])).map((entry) => typeof entry === "string" ? { label: entry, url: entry } : { label: text(first(entry, ["label", "title", "nombre", "titulo", "name"]), 160), url: text(first(entry, ["url", "href", "enlace", "link"]), 1000) }).filter((entry) => entry.url);
}
function ids(item, names) { return values(first(item, names, [])).map((value) => key(typeof value === "object" ? first(value, ["id", "key", "slug", "name", "nombre"]) : value, "reference")).filter(Boolean); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((name) => [name, canonical(value[name])]));
  return value;
}
function fingerprint(value) {
  const source = JSON.stringify(canonical(value));
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `route-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function collect(root, english, spanish) {
  const direct = values(first(root, [english, spanish], []));
  const modules = values(first(root, ["modules", "modulos", "sections", "secciones"], []));
  return [...direct, ...modules.flatMap((module) => values(first(module, [english, spanish], [])))];
}
function normalizeItem(item, index, kind) {
  const source = typeof item === "string" ? { title: item } : item ?? {};
  const title = text(first(source, ["title", "titulo", "name", "nombre"]), 180);
  return {
    sourceId: key(first(source, ["id", "key", "slug", "codigo"]), `${kind}-${index + 1}`),
    title,
    description: text(first(source, ["description", "descripcion", "objective", "objetivo"]), 3000),
    competencyIds: ids(source, ["competencyIds", "competencies", "competencias"]),
    dependencyIds: ids(source, ["dependencyIds", "dependencies", "dependencias", "dependsOn", "dependeDe"]),
    links: links(source),
    dueDate: date(first(source, ["dueDate", "fecha", "fechaLimite", "date"])),
    difficulty: Math.max(1, Math.min(5, Number(first(source, ["difficulty", "dificultad"], 1)) || 1)),
  };
}

export function prepareLearningPathImport(document, sourceName = "ruta-educativa.json") {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("La ruta educativa debe ser un objeto JSON.");
  if (document.app === "StudyHub" || document.kind === "studyhub-evaluation-report") throw new Error("Este archivo pertenece al importador de copias o evaluaciones, no al importador de rutas.");
  const root = first(document, ["route", "ruta", "learningPath", "rutaFormacion"], document);
  const title = text(first(root, ["title", "titulo", "name", "nombre"]), 80);
  if (!title) throw new Error("La ruta educativa no contiene un nombre reconocible.");
  const rawCompetencies = collect(root, "competencies", "competencias");
  const normalizedCompetencies = rawCompetencies.map((item, index) => {
    const normalized = normalizeItem(item, index, "competency");
    const source = typeof item === "string" ? {} : item;
    return { ...normalized, name: normalized.title, objectives: values(first(source, ["objectives", "objetivos"], [])).map((value) => text(value, 500)).filter(Boolean) };
  }).filter((item) => item.name);
  const competencyMap = new Map();
  for (const item of normalizedCompetencies) {
    const current = competencyMap.get(item.sourceId);
    competencyMap.set(item.sourceId, current ? { ...current, objectives: [...new Set([...current.objectives, ...item.objectives])], dependencyIds: [...new Set([...current.dependencyIds, ...item.dependencyIds])], links: [...current.links, ...item.links] } : item);
  }
  const competencies = [...competencyMap.values()];
  const normalizeCollection = (english, spanish, kind) => collect(root, english, spanish).map((item, index) => normalizeItem(item, index, kind)).filter((item) => item.title);
  const classes = [...normalizeCollection("classes", "clases", "class"), ...normalizeCollection("lessons", "lecciones", "lesson")];
  const tasks = [...normalizeCollection("tasks", "tareas", "task"), ...normalizeCollection("activities", "actividades", "activity")];
  const exercises = [...normalizeCollection("exercises", "ejercicios", "exercise"), ...normalizeCollection("practice", "practicas", "practice")];
  const plannedEvaluations = [...normalizeCollection("plannedEvaluations", "evaluacionesPrevistas", "evaluation"), ...normalizeCollection("assessments", "evaluaciones", "assessment")];
  const ignoredProgressFields = ["completed", "completado", "progress", "progreso", "percentage", "porcentaje", "certificate", "certificado", "score", "calificacion"];
  const sourceText = JSON.stringify(document).toLowerCase();
  const ignoredDetected = ignoredProgressFields.filter((name) => sourceText.includes(`"${name.toLowerCase()}"`));
  const description = text(first(root, ["description", "descripcion", "summary", "resumen"]), 300);
  const preview = {
    title, description, sourceName: text(sourceName, 240),
    fingerprint: fingerprint({ title, description, competencies, classes, tasks, exercises, plannedEvaluations }), competencies, classes, tasks, exercises, plannedEvaluations,
    warnings: [
      "Todas las competencias se importarán como Sin evaluar.",
      "No se importarán porcentajes, certificados, estados completados ni calificaciones externas.",
      ...(ignoredDetected.length ? [`Se detectaron y se ignorarán campos de progreso externo: ${ignoredDetected.join(", ")}.`] : []),
    ],
  };
  preview.counts = { competencies: competencies.length, classes: classes.length, tasks: tasks.length, exercises: exercises.length, plannedEvaluations: plannedEvaluations.length, links: [...competencies, ...classes, ...tasks, ...exercises, ...plannedEvaluations].reduce((sum, item) => sum + item.links.length, 0) };
  if (!Object.values(preview.counts).some(Boolean)) throw new Error("La ruta no contiene competencias, clases, tareas, ejercicios ni evaluaciones reconocibles.");
  return preview;
}

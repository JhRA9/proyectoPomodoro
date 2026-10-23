export const PROJECT_TYPES = ["general", "studies", "deliverables"];
export const PROJECT_TYPE_LABELS = {
  general: "General",
  studies: "Estudios",
  deliverables: "Entregables",
};

export const PRIVACY_MODES = ["personal", "private", "practice"];
export const PRIVACY_LABELS = {
  personal: "Personal",
  private: "Privado",
  practice: "Ejercicios ficticios",
};

export const AI_PROVIDERS = ["gemini", "cloudflare", "both"];
export const AI_PROFILES = ["fast", "complete", "deep"];
export const AI_PROFILE_LABELS = { fast: "Rápido", complete: "Completo", deep: "Profundo" };
export const HELP_LEVELS = ["none", "conceptual_hints", "partial_help", "generated_solution", "copied_solution", "unverified_help"];
export const HELP_LABELS = {
  none: "Ninguna ayuda",
  conceptual_hints: "Pistas conceptuales",
  partial_help: "Ayuda parcial",
  generated_solution: "Solución generada",
  copied_solution: "Solución copiada",
  unverified_help: "Ayuda no verificable",
};
export const DIFFICULTY_LABELS = { 1: "Introductorio", 2: "Básico", 3: "Intermedio", 4: "Avanzado", 5: "Integrador" };
export const VALIDATION_STATES = ["unassessed", "insufficient", "provisional", "validated"];
export const VALIDATION_LABELS = {
  unassessed: "Sin evaluar",
  insufficient: "Evidencia insuficiente",
  provisional: "Nivel provisional",
  validated: "Nivel validado",
};
export const LEVEL_LABELS = ["Inicial", "Básico", "En desarrollo", "Funcional", "Autónomo", "Sólido"];
export const DELIVERABLE_STATUSES = ["pending", "in_progress", "blocked", "completed_unverified", "verified"];
export const DELIVERABLE_STATUS_LABELS = {
  pending: "Pendiente",
  in_progress: "En proceso",
  blocked: "Bloqueado",
  completed_unverified: "Completado sin verificar",
  verified: "Verificado",
};

export const DEFAULT_RUBRIC = {
  id: "rubric-default-v1",
  version: 1,
  name: "Rúbrica técnica predeterminada",
  criteria: [
    { id: "understanding", name: "Comprensión", weight: 20, descriptions: ["No demuestra comprensión.", "Reconoce ideas aisladas.", "Explica lo esencial con vacíos.", "Explica y aplica correctamente.", "Justifica decisiones y límites con precisión."] },
    { id: "independent_implementation", name: "Implementación independiente", weight: 40, descriptions: ["No existe implementación propia.", "Necesita una solución casi completa.", "Implementa parcialmente con ayuda.", "Implementa de forma funcional con ayuda menor.", "Implementa y adapta de forma autónoma."] },
    { id: "integration", name: "Integración de conocimientos", weight: 25, descriptions: ["No conecta los conocimientos.", "Conecta elementos solo con guía.", "Integra algunos conceptos.", "Integra correctamente varios conceptos.", "Integra conocimientos en problemas nuevos y complejos."] },
    { id: "debugging_quality", name: "Depuración y buenas prácticas", weight: 15, descriptions: ["No verifica ni depura.", "Detecta fallos evidentes con ayuda.", "Prueba casos básicos.", "Depura y mantiene una solución clara.", "Diseña pruebas, maneja errores y mejora mantenibilidad."] },
  ],
  thresholds: [0, 20, 40, 60, 78, 90],
};

export function defaultEvaluationConfig() {
  return {
    privacy: "personal",
    provider: "gemini",
    profile: "complete",
    geminiModel: "gemini-3.8-flash",
    cloudflareModel: "@cf/openai/gpt-oss-120b",
    maxRequestsPerDay: 10,
    rubric: structuredClone(DEFAULT_RUBRIC),
  };
}

const FUNCTION_NAME = "studyhub-evaluate";

export class AiEvaluationClient {
  constructor(client) {
    this.client = client;
    this.supportsAttemptRequests = import.meta.env.VITE_WORKSPACE_AI_V2_READY === "true";
  }

  async check(provider = "both") {
    const { data, error } = await this.client.functions.invoke(FUNCTION_NAME, { body: { action: "check", provider } });
    if (error) throw new Error(error.message || "No se pudo comprobar la configuración de IA.");
    return data;
  }

  async evaluate({ project, exercise, competencies, provider, profile, requestId, retry = false, signal, onState = () => {} }) {
    if (project.evaluationConfig.privacy === "private" && (exercise.code || exercise.files?.length)) {
      throw new Error("Este proyecto es privado. Quita el código y los archivos o cambia explícitamente la privacidad antes de usar IA.");
    }
    const payload = {
      action: "evaluate",
      ...(requestId ? { requestId, requestVersion: 2, retry } : {}),
      provider,
      profile,
      models: { gemini: project.evaluationConfig.geminiModel, cloudflare: project.evaluationConfig.cloudflareModel },
      privacy: project.evaluationConfig.privacy,
      rubric: project.evaluationConfig.rubric,
      exercise: {
        title: exercise.title, description: exercise.description, objective: exercise.objective,
        difficulty: exercise.difficulty, code: exercise.code, expectedResult: exercise.expectedResult,
        actualResult: exercise.actualResult, tests: exercise.tests, helpLevel: exercise.helpLevel,
        independenceDeclared: exercise.independenceDeclared,
        competencies: competencies.map((item) => ({ id: item.id, name: item.name, objectives: item.objectives })),
      },
    };
    if (signal?.aborted) throw new Error("Solicitud cancelada.");
    const response = this.client.functions.invoke(FUNCTION_NAME, { body: payload, signal, timeout: 120000 });
    onState("waiting");
    const { data, error } = await response;
    if (signal?.aborted) throw new Error("Solicitud cancelada.");
    if (error) throw new Error(error.message || "El proveedor de IA no respondió correctamente.");
    if (!data || !["completed", "partial"].includes(data.status)) throw new Error(data?.message || "La evaluación no pudo completarse.");
    if (!Array.isArray(data.results) || (!data.results.length && !data.errors?.length)) throw new Error("No se recibió ninguna revisión ni un motivo de error del proveedor.");
    onState("received");
    return data;
  }
}

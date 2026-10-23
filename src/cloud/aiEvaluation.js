const FUNCTION_NAME = "studyhub-evaluate";

export class AiEvaluationClient {
  constructor(client) { this.client = client; }

  async check(provider = "both") {
    const { data, error } = await this.client.functions.invoke(FUNCTION_NAME, { body: { action: "check", provider } });
    if (error) throw new Error(error.message || "No se pudo comprobar la configuración de IA.");
    return data;
  }

  async evaluate({ project, exercise, competencies, provider, profile }) {
    if (project.evaluationConfig.privacy === "private" && (exercise.code || exercise.files?.length)) {
      throw new Error("Este proyecto es privado. Quita el código y los archivos o cambia explícitamente la privacidad antes de usar IA.");
    }
    const payload = {
      action: "evaluate",
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
    const { data, error } = await this.client.functions.invoke(FUNCTION_NAME, { body: payload });
    if (error) throw new Error(error.message || "El proveedor de IA no respondió correctamente.");
    if (!data || !["completed", "partial"].includes(data.status)) throw new Error(data?.message || "La evaluación no pudo completarse.");
    return data;
  }
}

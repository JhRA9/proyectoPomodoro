export function registerStudyHubTools(repository, router, notify) {
  const context = globalThis.document?.modelContext;
  if (!context?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const register = (tool) => {
    try {
      void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
    } catch {
      // WebMCP is progressive enhancement only.
    }
  };

  register({
    name: "list_studyhub_projects",
    title: "Listar proyectos",
    description: "Devuelve los proyectos actuales de StudyHub y sus cantidades de tareas.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute() {
      const state = repository.getState();
      return state.projects.map((project) => ({
        id: project.id,
        name: project.name,
        pending: state.tasks.filter((task) => task.projectId === project.id && task.status !== "completed").length,
        completed: state.tasks.filter((task) => task.projectId === project.id && task.status === "completed").length,
      }));
    },
  });

  register({
    name: "create_studyhub_project",
    title: "Crear proyecto",
    description: "Crea un proyecto real en StudyHub con nombre y descripción opcional.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", minLength: 1, maxLength: 80 }, description: { type: "string", maxLength: 300 } },
      required: ["name"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      const project = await repository.createProject({ name: input?.name, description: input?.description ?? "", icon: "folder", color: "#7657ff" });
      router.navigate(`projects/${project.id}`);
      notify("Proyecto creado.");
      return { id: project.id, name: project.name };
    },
  });

  register({
    name: "create_studyhub_task",
    title: "Crear tarea",
    description: "Crea una tarea dentro de un proyecto existente. La fecha límite es opcional y usa YYYY-MM-DD.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" }, title: { type: "string", minLength: 1, maxLength: 100 }, description: { type: "string", maxLength: 500 }, dueDate: { type: "string" } },
      required: ["projectId", "title"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      const task = await repository.createTask(input.projectId, { title: input.title, description: input.description ?? "", dueDate: input.dueDate || null, status: "pending" });
      notify("Tarea creada.");
      return { id: task.id, projectId: task.projectId, title: task.title, status: task.status };
    },
  });

  return () => lifecycle.abort();
}

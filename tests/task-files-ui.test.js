import { describe, expect, it } from "vitest";
import { createDemoState } from "../src/data/schema.js";
import { focusView } from "../src/views/focusView.js";

function renderTaskFiles({ filesEnabled = true, taskFiles = null } = {}) {
  const state = createDemoState(new Date("2026-09-21T12:00:00.000Z"));
  const project = state.projects[0];
  const task = state.tasks.find((item) => item.projectId === project.id);
  const html = focusView(state, project, task, {
    animatePage: false,
    taskFilter: "all",
    menu: null,
    focusLearningTab: "draft",
    learningDrafts: {},
    filesEnabled,
    taskFiles: taskFiles && { taskId: task.id, ...taskFiles },
  });
  return { html, task };
}

describe("task attachments in the focus view", () => {
  it("shows the selected task deadline and optional time beside the Pomodoro", () => {
    const state = createDemoState(new Date("2026-09-21T12:00:00.000Z"));
    const project = state.projects[0];
    const task = state.tasks.find((item) => item.projectId === project.id);
    task.dueDate = "2026-09-24";
    task.dueTime = "16:20";
    const html = focusView(state, project, task, {
      animatePage: false, taskFilter: "all", menu: null, focusLearningTab: "draft", learningDrafts: {}, filesEnabled: false,
    });

    expect(html).toContain("Se entrega el 24 de septiembre de 2026 a las 16:20");
  });

  it("does not show the cloud-only attachments panel in local mode", () => {
    const { html } = renderTaskFiles({ filesEnabled: false });

    expect(html).not.toContain('class="task-files"');
    expect(html).not.toContain('data-input="task-files"');
    expect(html).not.toContain('data-action="download-task-file"');
  });

  it("offers an optional multiple-file picker while showing an empty task", () => {
    const { html, task } = renderTaskFiles({ taskFiles: { status: "ready", items: [] } });
    const picker = html.match(/<input[^>]*data-input="task-files"[^>]*>/)?.[0] ?? "";

    expect(html).toContain("Archivos adjuntos");
    expect(html).toContain("Todavía no hay archivos en esta tarea.");
    expect(html).toContain("Opcional");
    expect(picker).toContain('type="file"');
    expect(picker).toContain("multiple");
    expect(picker).toContain(`data-task-id="${task.id}"`);
    expect(picker).not.toMatch(/\brequired\b/);
    expect(html).not.toContain('class="task-files-list"');
    expect(html).not.toContain('data-action="download-task-file"');
  });

  it("lists available files with download controls and escapes untrusted names and keys", () => {
    const unsafeName = '<img src=x onerror="alert(1)">.docx';
    const unsafeKey = 'file" onclick="alert(1)';
    const { html, task } = renderTaskFiles({
      taskFiles: {
        status: "ready",
        items: [
          { name: unsafeName, key: unsafeKey, sizeBytes: 2048 },
          { name: "resumen.pdf", key: "resumen-key", sizeBytes: 1_048_576 },
        ],
      },
    });

    expect(html).toContain('class="task-files-list"');
    expect(html.match(/data-action="download-task-file"/g)).toHaveLength(2);
    expect(html).toContain(`data-task-id="${task.id}"`);
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;.docx');
    expect(html).toContain('data-file-key="file&quot; onclick=&quot;alert(1)"');
    expect(html).toContain("resumen.pdf");
    expect(html).toContain("2 KB");
    expect(html).toContain("1.0 MB");
    expect(html).not.toContain(unsafeName);
    expect(html).not.toContain(unsafeKey);
  });

  it("shows loading and retryable error states without download controls", () => {
    const { html: loading } = renderTaskFiles();
    const { html: error, task } = renderTaskFiles({ taskFiles: { status: "error", items: [] } });

    expect(loading).toContain("Cargando archivos…");
    expect(loading).not.toContain('data-action="download-task-file"');
    expect(error).toContain("No se pudieron cargar los archivos.");
    expect(error).toContain('data-action="retry-task-files"');
    expect(error).toContain(`data-task-id="${task.id}"`);
    expect(error).not.toContain('data-action="download-task-file"');
  });
});

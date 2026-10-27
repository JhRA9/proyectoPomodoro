import { describe, it, expect, vi } from "vitest";
import { agendaTasks, agendaGroups, agendaView } from "../src/workspace/agenda.js";
import { WorkspaceDrafts, workspaceEnabled } from "../src/workspace/preferences.js";
import { WorkspaceController } from "../src/workspace/controller.js";
import { workspaceProgress } from "../src/workspace/progressView.js";
import { workspaceHome, workspaceResults } from "../src/workspace/views.js";
import { createDemoState, createEmptyState } from "../src/data/schema.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { createStore } from "../src/state/store.js";
import { AiEvaluationClient } from "../src/cloud/aiEvaluation.js";
import { parseRoute } from "../src/router.js";
import { areaColor } from "../src/workspace/gauges.js";
import { overlaySide } from "../src/workspace/panels.js";

const storage = () => { const values = new Map(); return { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) }; };
const now = new Date(2026, 9, 25, 10);

describe("workspace navigation, agenda and drafts", () => {
  it("treats compact panels as overlays without affecting desktop or the stable experience",()=>{
    expect(overlaySide(true,true,{leftSidebarOpen:true})).toBe("left");
    expect(overlaySide(true,true,{leftSidebarOpen:true,rightSidebarOpen:true})).toBe("right");
    expect(overlaySide(false,true,{rightSidebarOpen:true})).toBeNull();
    expect(overlaySide(true,false,{rightSidebarOpen:true})).toBeNull();
  });
  it("gives each area a distinct color without changing earlier areas when adding one", () => {
    const ids = Array.from({length: 24}, (_, i) => `area-${i}`);
    const colors = ids.map((id) => areaColor(id, ids));
    expect(new Set(colors).size).toBe(ids.length);
    expect(ids.map((id) => areaColor(id, [...ids, "new-area"]))).toEqual(colors);
  });
  it("keeps workspace off by default and supports explicit reversible flags", () => {
    const s = storage(); expect(workspaceEnabled(s, "")).toBe(false); expect(workspaceEnabled(s, "?workspaceV2=1")).toBe(true);
    s.setItem("studyhub:workspaceV2", "true"); expect(workspaceEnabled(s, "")).toBe(true); expect(workspaceEnabled(s, "?workspaceV2=0")).toBe(false);
  });
  it("routes global views independently from project and focus routes", () => {
    for (const path of ["home", "results", "focus", "settings"]) expect(parseRoute(`#/${path}`).name).toBe(`workspace-${path}`);
    expect(parseRoute("#/projects/p/tasks/t")).toEqual({ name: "focus", projectId: "p", taskId: "t" });
  });
  it("moves dates dynamically through mutually exclusive buckets", () => {
    const tasks = ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-28", "2026-10-31", "2026-11-10", null].map((dueDate, id) => ({ id, dueDate }));
    const groups = agendaGroups(tasks, now); expect(groups.map((g) => g.tasks.length)).toEqual([1,1,1,1,1,1,1]);
    const later = agendaGroups(tasks, new Date(2026,9,27,10)); expect(later[0].tasks).toHaveLength(3); expect(later[2].tasks[0].dueDate).toBe("2026-10-28");
  });
  it("excludes completed tasks and completed projects from pending agenda", () => {
    const state = createDemoState(now); state.tasks[0].status = "completed"; state.projects.find((p) => p.id === state.tasks[1].projectId).status = "completed";
    expect(agendaTasks(state, {}, now).some((t) => t.id === state.tasks[0].id)).toBe(false);
    expect(agendaTasks(state, { completed: true }, now).some((t) => t.id === state.tasks[0].id)).toBe(true);
  });
  it("filters global calendar by both project and date", () => {
    const state = createDemoState(now), task = state.tasks.find((t) => t.dueDate && t.status !== "completed");
    const rows = agendaTasks(state, { projectId: task.projectId, date: task.dueDate }, now);
    expect(rows.length).toBeGreaterThan(0); expect(rows.every((r) => r.projectId === task.projectId && r.dueDate === task.dueDate)).toBe(true);
    const html = agendaView(state, { wsCalendar: { year:2026,month:9 }, wsCalendarOpen:true, wsAgendaDate:task.dueDate }, now);
    expect(html).toContain("Calendario global"); expect(html).toContain('data-action="ws-agenda-date"');
  });
  it("restores draft text and selections after reload, isolates accounts and clears explicitly", () => {
    const s = storage();
    const form = { dataset: { form:"exercise", projectId:"p" }, matches:()=>true, elements:[{ name:"title", type:"text", value:"Mi borrador" }, { name:"independenceDeclared", type:"checkbox", checked:true }, { name:"competencyIds", multiple:true, selectedOptions:[{ value:"a" }], options:[{ value:"a",selected:false }, { value:"b",selected:false }] }] };
    new WorkspaceDrafts(s,"a").capture(form); form.elements[0].value=""; form.elements[1].checked=false;
    new WorkspaceDrafts(s,"b").restore({ querySelectorAll:()=>[form] }); expect(form.elements[0].value).toBe("");
    const reloaded = new WorkspaceDrafts(s,"a"); reloaded.restore({ querySelectorAll:()=>[form] });
    expect(form.elements[0].value).toBe("Mi borrador"); expect(form.elements[1].checked).toBe(true); expect(form.elements[2].options[0].selected).toBe(true);
    reloaded.clear(form); form.elements[0].value=""; reloaded.restore({ querySelectorAll:()=>[form] }); expect(form.elements[0].value).toBe("");
  });
  it("escapes user content in new views and shows missing IA as a limitation", () => {
    const state = createDemoState(now); state.projects[0].name = '<img src=x onerror="bad()">';
    const ui = { wsProgressTab:"exercises", wsRequests:{} };
    const html = workspaceProgress(state, state.projects[0], ui);
    expect(html).not.toContain('<img src=x'); expect(html).toContain("Todavía no hay ejercicios");
  });
  it("renders every progress section and empty global views without fabricated metrics", () => {
    const state = createDemoState(now); const project = state.projects[0];
    for (const tab of ["areas","exercises","evidence","history","weekly","settings","reports"]) expect(workspaceProgress(state, project, { wsProgressTab:tab })).toContain(project.name);
    const empty = createEmptyState(); expect(workspaceHome(empty, {})).toContain("0"); expect(workspaceResults(empty)).toContain("No se asignan resultados");
  });
});

async function controllerSetup(evaluate) {
  const repo = new StudyHubRepository({ adapter:new MemoryAdapter(createEmptyState()), store:createStore(null) }); await repo.initialize();
  const project = await repo.createProject({ name:"Test",projectType:"studies" });
  const exercise = await repo.createExercise(project.id,{title:"Respuesta",code:"ok"});
  const app = { repository:repo, ui:{}, root:{querySelectorAll:()=>[]}, account:null, render:vi.fn(), addToast:vi.fn(), aiEvaluator:{ supportsAttemptRequests:true, evaluate }, router:{navigate:vi.fn()} };
  const controller = new WorkspaceController(app,{workspaceV2:true,layoutStorage:storage()});
  app.ui.wsPreview={exerciseId:exercise.id,provider:"both"};
  const scores=repo.getState().projects[0].evaluationConfig.rubric.criteria.map((c)=>({criterionId:c.id,score:3,justification:"ok"}));
  return {app,controller,repo,project,exercise,scores};
}

describe("workspace real request lifecycle", () => {
  it("keeps disclosures open across rerenders without reopening a different form", async()=>{
    const t=await controllerSetup(vi.fn());
    const form={dataset:{form:"manual-evaluation",exerciseId:"first"}};
    const detail={open:true,querySelector:selector=>selector==="form"?form:{textContent:"Evaluar"}};
    t.app.root.querySelectorAll=selector=>selector==="details"?[detail]:[];
    t.app.root.querySelector=()=>null;t.controller.lastPath="progress:p";
    t.controller.capture();detail.open=false;t.controller.restore();expect(detail.open).toBe(true);
    form.dataset.exerciseId="second";detail.open=false;t.controller.restore();expect(detail.open).toBe(false);
  });
  it("keeps a quota rejection recoverable without sending or locking the submission", async () => {
    const evaluate = vi.fn(); const t = await controllerSetup(evaluate);
    await t.repo.updateEvaluationSettings(t.project.id, { ...t.repo.getState().projects[0].evaluationConfig, maxRequestsPerDay: 1 });
    await t.controller.send();
    expect(evaluate).not.toHaveBeenCalled();
    expect(t.repo.getState().evaluations[0].status).toBe("failed");
    expect(t.repo.getState().evaluations[0].errors).toHaveLength(2);
  });
  it("receives both providers independently and counts one attempt", async () => {
    let t; t=await controllerSetup(vi.fn(async ({provider,onState})=> { onState("waiting");onState("received");return {status:"completed",results:[{provider,scores:t.scores}]}; }));
    await t.controller.send(); expect(t.repo.getState().evaluations).toHaveLength(1); expect(t.repo.getState().evaluations[0].reviews).toHaveLength(2); expect(t.app.aiEvaluator.evaluate).toHaveBeenCalledTimes(2);
  });
  it("keeps a successful review when another provider rejects", async () => {
    let t; t=await controllerSetup(async ({provider})=>{if(provider==="cloudflare")throw Error("Sin cuota");return {results:[{provider,scores:t.scores}]};});
    await t.controller.send(); expect(t.repo.getState().evaluations[0].reviews).toHaveLength(1); expect(t.repo.getState().evaluations[0].errors[0].message).toBe("Sin cuota");
  });
  it("does not send duplicate clicks or save late responses after cancellation", async () => {
    let finish; const promise=new Promise((r)=>{finish=r;}); const t=await controllerSetup(async()=>promise);
    const first=t.controller.send(); await vi.waitFor(()=>expect(t.controller.controllers.size).toBe(1));
    await t.controller.send(); const id=t.repo.getState().evaluations[0].id;
    await t.controller.action("ws-ai-cancel",{dataset:{requestId:id}});
    finish({status:"completed",results:[{provider:"gemini",scores:t.scores}]}); await first;
    expect(t.repo.getState().evaluations).toHaveLength(1); expect(t.repo.getState().evaluations[0].reviews).toHaveLength(0); expect(t.repo.getState().evaluations[0].status).toBe("failed");
  });
  it("does not call IA if deployment capability is unavailable", async () => {
    const fn=vi.fn();const t=await controllerSetup(fn);t.app.aiEvaluator.supportsAttemptRequests=false;await t.controller.send();expect(fn).not.toHaveBeenCalled();expect(t.repo.getState().evaluations).toHaveLength(0);
  });
  it("passes abort and idempotency keys to the authenticated transport", async () => {
    const t=await controllerSetup(()=>{}); const invoke=vi.fn().mockResolvedValue({data:{status:"completed",results:[{provider:"gemini",scores:t.scores}]},error:null});
    const client=new AiEvaluationClient({functions:{invoke}}), controller=new AbortController(), stages=[];
    await client.evaluate({project:t.repo.getState().projects[0],exercise:t.exercise,competencies:[],provider:"gemini",profile:"fast",requestId:"attempt:gemini",signal:controller.signal,onState:(s)=>stages.push(s)});
    expect(invoke.mock.calls[0][1]).toMatchObject({body:{requestId:"attempt:gemini",requestVersion:2},signal:controller.signal});expect(stages).toEqual(["waiting","received"]);
    controller.abort();await expect(client.evaluate({project:t.repo.getState().projects[0],exercise:t.exercise,competencies:[],signal:controller.signal})).rejects.toThrow(/cancelada/);expect(invoke).toHaveBeenCalledTimes(1);
  });
});

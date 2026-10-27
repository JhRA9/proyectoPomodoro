import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAreaSuggestions } from "../src/evaluation/areaSuggestions.js";
import { AreaSuggestionsController, areaSuggestionsView } from "../src/workspace/areaSuggestions.js";
import { AiEvaluationClient } from "../src/cloud/aiEvaluation.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { createEmptyState } from "../src/data/schema.js";
import { createStore } from "../src/state/store.js";
import { competencyProgress } from "../src/evaluation/progress.js";
import { suggestAreas } from "../supabase/functions/studyhub-evaluate/areaSuggestions.ts";

afterEach(() => vi.unstubAllGlobals());
const proposal = { name: "JavaScript", description: "Trabajar con datos", objectives: ["Filtrar una lista"] };
const response = { areas: [proposal], provider: "gemini", model: "test-model", promptVersion: "studyhub-areas-v1" };
async function setup(suggest = vi.fn(async () => response)) {
  const repo = new StudyHubRepository({ adapter: new MemoryAdapter(createEmptyState()), store: createStore(null) }); await repo.initialize();
  const project = await repo.createProject({name: "Prueba", projectType:"studies"});
  const values = new Map(), storage = {getItem:k=>values.get(k) || null,setItem:(k,v)=>values.set(k,v)};
  const app = {repository:repo,ui:{},render:vi.fn(),addToast:vi.fn(),aiEvaluator:{supportsAreaSuggestions:true,suggestAreas:suggest},safely:async fn=>{try{await fn();return true;}catch{return false;}}};
  const controller = new AreaSuggestionsController({app,storage,prefix:"test:account-a"});
  controller.draft(project.id).context="Aprender JavaScript sin datos personales";
  return {repo,project,app,controller,storage,suggest};
}
function acceptForm(projectId, rows) {
  return {dataset:{areaSuggestions:"true",projectId,form:"area-accept"}, elements:Object.fromEntries(rows.flatMap((r,i)=>[[`selected_${i}`,{checked:r.selected}],...["name","description","objectives"].map(k=>[`${k}_${i}`,{value:r[k]}])]))};
}
describe("area suggestions contract", () => {
  it("keeps proposals separate from levels and rejects invalid or repeated names", () => {
    expect(normalizeAreaSuggestions([{...proposal,percentage:100,validated:true}])).toEqual([proposal]);
    expect(()=>normalizeAreaSuggestions([proposal,{...proposal,name:"Javáscript"}])).toThrow(/repetidos/);
    expect(()=>normalizeAreaSuggestions([{name:"x",description:"x",objectives:[42]}])).toThrow();
  });
  it("uses one atomic batch, skips duplicates and never creates evaluations", async () => {
    const t=await setup(); const input={...proposal,objectives:"Filtrar"};
    await Promise.all([t.repo.createCompetencies(t.project.id,[input],{deduplicate:true}),t.repo.createCompetencies(t.project.id,[input],{deduplicate:true})]);
    expect(t.repo.getState().competencies).toHaveLength(1); expect(t.repo.getState().evaluations).toHaveLength(0);
    expect(competencyProgress(t.repo.getState(),t.repo.getState().competencies[0]).validationState).toBe("unassessed");
    const before=structuredClone(t.repo.getState());
    await expect(t.repo.createCompetencies(t.project.id,[{name:"CSS"},{name:"HTML",parentId:"missing"}],{deduplicate:true})).rejects.toThrow();
    expect(t.repo.getState()).toEqual(before);
  });
  it("requires selection and permits editing and adding a manual area in a mixed batch",async()=>{
    const t=await setup(); await t.controller.request(t.project.id);
    const d=t.controller.draft(t.project.id); expect(d.rows[0].selected).toBe(false); expect(t.repo.getState().competencies).toHaveLength(0);
    await t.controller.submit(acceptForm(t.project.id,d.rows)); expect(t.repo.getState().competencies).toHaveLength(0);
    d.mode="mixed";d.rows[0].name="JavaScript práctico";d.rows[0].selected=true;
    d.rows.push({name:"CSS",description:"Estilos",objectives:"Maquetar",selected:true,original:null});
    await t.controller.submit(acceptForm(t.project.id,d.rows));
    expect(t.repo.getState().competencies.map(x=>x.name)).toEqual(["JavaScript práctico","CSS"]);expect(d.rows).toHaveLength(0);
    expect(t.repo.getState().competencies[0].creationSource.original.name).toBe("JavaScript");
    expect(t.repo.getState().competencies[1].creationSource).toMatchObject({method:"manual",provider:null,requestId:null,original:null});
    expect(t.repo.getState().competencies[0].creationSource).toMatchObject({provider:"gemini",model:"test-model",requestId:t.suggest.mock.calls[0][0].requestId});
  });
  it("preserves editable drafts across reload and isolates accounts",async()=>{
    const t=await setup();await t.controller.request(t.project.id); const d=t.controller.draft(t.project.id);d.rows[0].name="Cambio sin guardar";t.controller.persist(t.project.id);
    const reload=new AreaSuggestionsController({app:{...t.app,ui:{}},storage:t.storage,prefix:"test:account-a"});expect(reload.draft(t.project.id).rows[0].name).toBe("Cambio sin guardar");
    const other=new AreaSuggestionsController({app:{...t.app,ui:{}},storage:t.storage,prefix:"test:account-b"});expect(other.draft(t.project.id).rows).toEqual([]);
  });
  it("does not duplicate a recovered response or overwrite edits",async()=>{
    const t=await setup();await t.controller.request(t.project.id);t.controller.draft(t.project.id).rows[0].name="Editado";await t.controller.request(t.project.id);
    expect(t.suggest.mock.calls[0][0].requestId).toBe(t.suggest.mock.calls[1][0].requestId);expect(t.suggest.mock.calls[1][0].retry).toBe(true);
    expect(t.controller.draft(t.project.id).rows.map(r=>r.name)).toEqual(["Editado"]);
  });
  it("keeps provenance from each proposal even after a later request", async()=>{
    const t=await setup();await t.controller.request(t.project.id);
    const d=t.controller.draft(t.project.id), first=d.rows[0].source.requestId;
    d.context="Otro contexto";t.suggest.mockResolvedValue({...response,model:"second-model",areas:[{...proposal,name:"CSS"}]});await t.controller.request(t.project.id);
    d.rows.forEach(row=>row.selected=true);await t.controller.submit(acceptForm(t.project.id,d.rows));
    expect(t.repo.getState().competencies[0].creationSource).toMatchObject({requestId:first,model:"test-model"});
    expect(t.repo.getState().competencies[1].creationSource.model).toBe("second-model");
  });
  it("does not send when persisting request identity fails",async()=>{
    const t=await setup();t.storage.setItem=()=>{throw Error("full");};await t.controller.request(t.project.id);
    expect(t.suggest).not.toHaveBeenCalled();expect(t.repo.getState().aiRequests).toHaveLength(0);
  });
  it("ignores a late result after cancellation and prevents duplicate sends",async()=>{
    let finish;const t=await setup(vi.fn(()=>new Promise(resolve=>{finish=resolve;})));
    const pending=t.controller.request(t.project.id);await vi.waitFor(()=>expect(t.suggest).toHaveBeenCalledTimes(1));await t.controller.request(t.project.id);
    await t.controller.action("area-cancel",{dataset:{projectId:t.project.id}});finish(response);await pending;
    expect(t.controller.draft(t.project.id).rows).toHaveLength(0);expect(t.repo.getState().aiRequests[0].status).toBe("failed");
  });
  it("keeps manual creation available when Gemini is unavailable",async()=>{
    const t=await setup();t.app.aiEvaluator.supportsAreaSuggestions=false;await t.controller.request(t.project.id);expect(t.suggest).not.toHaveBeenCalled();
    expect(areaSuggestionsView(t.project,{mode:"mixed",rows:[]},false)).toContain("Añadir área propia");
    expect(areaSuggestionsView(t.project,{mode:"gemini",context:'<img src=x onerror="bad">',rows:[]},false)).not.toContain('<img');
  });
  it("whitelists the client payload and requires a deliberate service flag",async()=>{
    const invoke=vi.fn(async()=>({data:{status:"completed",...response}})); const client=new AiEvaluationClient({functions:{invoke}});
    await expect(client.suggestAreas({context:"JS"})).rejects.toThrow(/habilitadas/);client.supportsAreaSuggestions=true;
    await client.suggestAreas({context:"JS",requestId:"request-test",email:"private",code:"secret"});
    expect(invoke.mock.calls[0][1].body).toEqual({action:"suggest-areas",requestVersion:2,requestId:"request-test",retry:false,provider:"gemini",context:"JS"});
  });
});
describe("Gemini suggestion endpoint with simulated network",()=>{
  it("never sends account history and strips scores from the response",async()=>{
    vi.stubGlobal("Deno",{env:{get:key=>key==="GEMINI_API_KEY"?"test-key":"test-model"}});
    const fetch=vi.fn(async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({areas:[{...proposal,percentage:100}]})}]}}]})));
    vi.stubGlobal("fetch",fetch);const result=await suggestAreas({context:"Frontend",email:"secret-email",history:[100],files:["private"]});
    expect(result.areas).toEqual([proposal]);const body=JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toBe('{"studyContext":"Frontend"}');
  });
  it("fails before inference without a key and rejects malformed responses",async()=>{
    vi.stubGlobal("Deno",{env:{get:()=>undefined}});const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
    await expect(suggestAreas({context:"CSS"})).rejects.toThrow(/configurado/);expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal("Deno",{env:{get:()=>"test-only"}});fetch.mockResolvedValue(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"areas":[{"name":"x"}]}'}]}}]})));
    await expect(suggestAreas({context:"CSS"})).rejects.toThrow(/inválidos/);
  });
});

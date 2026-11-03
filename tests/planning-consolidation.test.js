import {describe,it,expect,vi} from 'vitest';
import {planningFixture} from './helpers/planningFixture.js';
import {currentContent,canonical,validatePlanningTransition,planningCapacity,planMetrics} from '../src/planning/engine.js';
import {planningView} from '../src/planning/view.js';
import {StudyHubRepository} from '../src/data/repository.js';
import {MemoryAdapter} from '../src/data/localAdapter.js';
import {createEmptyState,createExportEnvelope,normalizeState} from '../src/data/schema.js';
import {createStore} from '../src/state/store.js';
import {measurePlanningCapacity} from '../scripts/measure-planning-capacity.mjs';
import {planningSources} from '../scripts/start-planning-edge.mjs';
import {planningStagingConfig} from '../scripts/verify-planning-staging.mjs';
import {deliverableProjectProgress} from '../src/evaluation/progress.js';
import {PlanningController} from '../src/planning/controller.js';

const repository=async(state,extra={})=>{const adapter=Object.assign(new MemoryAdapter(state),extra),repo=new StudyHubRepository({adapter,store:createStore(null)});await repo.initialize();return {repo,adapter};};
describe('planning consolidation and preservation',()=>{
  it('allows explicit recovery of a stale import draft, retaining its content',async()=>{
    const f=planningFixture(),{repo}=await repository(f.state);
    const errors=[],app={repository:repo,router:{current:()=>({projectId:'synthetic-cube'})},ui:{},render:vi.fn(),addToast:vi.fn(),safely:async fn=>{try{await fn();return true;}catch(error){errors.push(error.message);return false;}}};
    const workspace={app,drafts:{clear:vi.fn(),capture:vi.fn()}},controller=new PlanningController(workspace);
    const proposal={id:'import-ui',title:'Fixture',baseVersion:1,origin:'human',provider:'',model:'',questions:'',uncertainties:'',operations:[f.op('items','add','piece',f.item())]};
    const form={dataset:{form:'plan-import',planRevision:'0',projectId:'synthetic-cube'}},data={json:JSON.stringify({format:'studyhub-plan-proposal-1',proposal})};
    await controller.submit(form,data);expect(errors[0]).toMatch(/cambió/);expect(workspace.drafts.clear).not.toHaveBeenCalled();
    await controller.action('plan-refresh-draft',{closest:()=>form});expect(form.dataset.planRevision).toBe('1');
    await controller.submit(form,data);expect(repo.getState().projectPlans[0].proposals[0].id).toBe('import-ui');expect(currentContent(repo.getState().projectPlans[0]).items).toEqual([]);
    const html=planningView(repo.getState(),f.state.projects[0],{planTab:'proposals'});
    expect(html).toMatch(/data-form="plan-import"[^>]*>[\s\S]*?data-action="plan-refresh-draft"/);
    expect(html).toContain('data-form="plan-approval" data-workspace-draft data-plan-entity="import-ui"');
  });
  it('preserves selection and reason when recalculating partial approval',async()=>{
    const f=planningFixture(),{repo}=await repository(f.state),app={repository:repo,router:{current:()=>({projectId:'synthetic-cube'})},ui:{},render:vi.fn(),safely:async fn=>{await fn();return true;}};
    const workspace={app,drafts:{clear:vi.fn(),capture:vi.fn()}},controller=new PlanningController(workspace);
    const form={dataset:{form:'plan-approval',proposalId:'selection',planRevision:'1'},elements:[{name:'operation-one',checked:true},{name:'operation-two',checked:false},{name:'reason',value:'Mi decisión'}]};
    await controller.submit(form,{planIntent:'preview',reason:'Mi decisión'});
    expect(app.ui.planSelection).toEqual({id:'selection',ids:['one']});expect(workspace.drafts.capture).toHaveBeenCalledWith(form);expect(workspace.drafts.clear).not.toHaveBeenCalled();
  });
  it('records the actual deletion actor without rewriting original authors',async()=>{
    const f=planningFixture('original-author');f.add('items',f.item('piece',{taskId:'synthetic-task'}));
    const before=structuredClone(f.state),{repo}=await repository(f.state);
    await repo.deleteTask('synthetic-task','current-owner');
    const next=repo.getState(),plan=next.projectPlans[0];
    expect(plan.events.at(-1).actor).toBe('current-owner');expect(plan.events.slice(0,-1)).toEqual(before.projectPlans[0].events);
    expect(()=>validatePlanningTransition(before,next,'current-owner')).not.toThrow();
    expect(()=>validatePlanningTransition(before,next,'original-author')).toThrow(/Autor/);
  });
  it('does not assign a local history to an authenticated account or write a partial migration',async()=>{
    const f=planningFixture('local');f.add('items',f.item());f.verify();const original=canonical(f.state);
    const save=vi.fn(),acknowledgeMigration=vi.fn(),{repo}=await repository(createEmptyState(),{userId:'new-account',save,acknowledgeMigration});
    await expect(repo.replaceFromMigration(f.state)).rejects.toThrow(/procedencia/);
    expect(save).not.toHaveBeenCalled();expect(acknowledgeMigration).not.toHaveBeenCalled();expect(repo.getState().projects).toEqual([]);expect(canonical(f.state)).toBe(original);
    await expect(repo.importEnvelope(createExportEnvelope(f.state))).rejects.toThrow(/Autor/);expect(save).not.toHaveBeenCalled();
  });
  it('never announces a failed or offline migration as synchronized',async()=>{
    const f=planningFixture();delete f.state.projectPlans;
    const acknowledgeMigration=vi.fn(),{repo}=await repository(createEmptyState(),{save:vi.fn(async()=>({synced:false,error:new Error('Conflicto recuperable')})),acknowledgeMigration});
    await expect(repo.replaceFromMigration(f.state)).rejects.toThrow(/Conflicto/);
    expect(acknowledgeMigration).not.toHaveBeenCalled();expect(repo.getState().projects).toEqual([]);
  });
  it('retains old backup fields and supports the original migration without plans',async()=>{
    const f=planningFixture();delete f.state.projectPlans;f.state.customHistoricalField={untouched:true};
    const acknowledgeMigration=vi.fn(),{repo}=await repository(createEmptyState(),{userId:'new-account',acknowledgeMigration});
    await repo.replaceFromMigration(f.state);expect(repo.getState().customHistoricalField).toEqual({untouched:true});expect(repo.getState().projectPlans).toEqual([]);expect(acknowledgeMigration).toHaveBeenCalledWith('migrated');
  });
  it('rejects an older plan backup without changing the current history',async()=>{
    const f=planningFixture();const archive=createExportEnvelope(f.state);f.add('items',f.item());
    const {repo,adapter}=await repository(f.state,{userId:f.actor});const before=canonical(repo.getState());
    await expect(repo.importEnvelope(archive)).rejects.toThrow(/historial/);expect(adapter.writeCount).toBe(0);expect(canonical(repo.getState())).toBe(before);
  });
  it('keeps deleted file references as obsolete and refuses restoring missing live task links',()=>{
    const f=planningFixture();f.add('items',f.item('piece',{taskId:'synthetic-task'}));
    f.add('evidence',f.evidence('proof','piece',{file:{taskId:'synthetic-task',path:'synthetic-owner/synthetic-task/hash',version:f.at}}));
    f.apply({type:'evidence-review',evidenceId:'proof',status:'approved',reason:'Fixture'});f.apply({type:'status',itemId:'piece',status:'verified',reason:'Fixture'});
    const oldVersion=f.state.projectPlans[0].activeVersion;f.state.tasks=[];f.apply({type:'task-removed',taskId:'synthetic-task'});
    expect(currentContent(f.state.projectPlans[0]).evidence[0].review.status).toBe('obsolete');expect(normalizeState(f.state).projectPlans).toEqual(f.state.projectPlans);
    const before=canonical(f.state);expect(()=>f.apply({type:'restore',version:oldVersion,confirm:true,reason:'Fixture'})).toThrow(/tarea/);expect(canonical(f.state)).toBe(before);
  });
  it('invalidates a verified dependency chain after an unforeseen blocking risk',()=>{
    const f=planningFixture();f.add('items',f.item());f.add('items',f.item('dependent'));f.add('dependencies',{id:'dependency',from:'piece',to:'dependent',type:'blocking',critical:true,reason:'Base',sourceId:null,author:f.actor});f.verify();f.verify('dependent');
    const historic=structuredClone(f.state.projectPlans[0].versions);
    f.add('risks',{id:'risk',title:'Fallo sintético',probability:'high',impact:'high',mitigation:'Revisar',owner:'Fixture',closeCondition:'Nueva inspección',targetIds:['piece'],open:true,blocking:true});
    expect(currentContent(f.state.projectPlans[0]).items.map(i=>i.status)).toEqual(['correct','correct']);expect(planMetrics(currentContent(f.state.projectPlans[0])).advance).toBe(0);expect(f.state.projectPlans[0].versions.slice(0,historic.length)).toEqual(historic);
  });
  it('does not blend incompatible legacy partial progress and evidence-based progress',()=>{
    const f=planningFixture();f.add('items',f.item());f.state.deliveryStages=[{id:'stage',projectId:'synthetic-cube',title:'Antes',order:0}];f.state.deliverables=[{id:'old',projectId:'synthetic-cube',stageId:'stage',status:'in_progress',weight:2}];expect(()=>f.add('items',f.item('other'))).toThrow(/Adopta/);
    expect(deliverableProjectProgress(f.state,'synthetic-cube').stages[0].progress).toBe(35);expect(planMetrics(currentContent(f.state.projectPlans[0])).advance).toBe(0);
    expect(planningView(f.state,f.state.projects[0],{})).toContain('No se suman ni se sincronizan');expect(f.state.deliverables[0].status).toBe('in_progress');
  });
  it('measures a 300-item dependency chain and rejects excess history atomically',()=>{
    const result=measurePlanningCapacity();expect(result.items).toBe(300);expect(result.scenarioRows).toBe(300);expect(result.dependencies).toBe(299);expect(result.acceptedChanges).toBeGreaterThan(0);expect(result.rejectedChangePreservedHistory).toBe(true);expect(result.final.codeUnits).toBeLessThanOrEqual(3000000);
  },30000);
  it('retains 500 events, then refuses event 501 without trimming history',()=>{
    const f=planningFixture();f.add('items',f.item());
    while(f.state.projectPlans[0].events.length<500)f.apply({type:'status',itemId:'piece',status:'pending',reason:'Repetición sintética'});
    const before=canonical(f.state);expect(planningCapacity(f.state.projectPlans[0]).nearLimit).toBe(true);expect(()=>f.apply({type:'status',itemId:'piece',status:'pending',reason:'Exceso'})).toThrow(/límite/);expect(canonical(f.state)).toBe(before);
    expect(planningView(f.state,f.state.projects[0],{})).toContain('Exportar no libera espacio');
  },30000);
  it('measures UTF8 separately without changing the historical storage contract',()=>{
    const f=planningFixture();f.add('items',f.item('unicode',{title:'Medición sintética 🧪'}));const capacity=planningCapacity(f.state.projectPlans[0]);expect(capacity.utf8Bytes).toBeGreaterThan(capacity.codeUnits);
  });
  it('collects the real handler dependency graph and only allows fixed loopback endpoints',()=>{
    const sources=planningSources();expect(sources.has('src/data/schema.js')).toBe(true);expect(sources.has('src/planning/engine.js')).toBe(true);expect(sources.has('supabase/functions/studyhub-plan/index.ts')).toBe(true);expect([...sources.keys()].every(p=>!p.includes('.env'))).toBe(true);
    expect(()=>planningStagingConfig({STUDYHUB_PLANNING_EDGE:'https://example.test'})).toThrow(/local/);
  });
});

import {describe,it,expect,vi} from 'vitest';
import {planningFixture} from './helpers/planningFixture.js';
import {currentContent,planMetrics,proposalPreview,validatePlanningTransition,validatePlans,scenario} from '../src/planning/engine.js';
import {PlanningProvider,parseProposalFile} from '../src/planning/provider.js';
import {StudyHubRepository} from '../src/data/repository.js';
import {MemoryAdapter} from '../src/data/localAdapter.js';
import {createStore} from '../src/state/store.js';
import {normalizeState,createExportEnvelope,prepareImportedState} from '../src/data/schema.js';
import {planningView} from '../src/planning/view.js';
import {FakeCloudBackend,createCloudContext} from './helpers/cloudHarness.js';
import {planningStagingConfig} from '../scripts/verify-planning-staging.mjs';
const plan=f=>f.state.projectPlans[0], content=f=>currentContent(plan(f));
describe('evidence-based project planning',()=>{
  it('starts unestimated and does not turn time or completion into verification',()=>{
    const f=planningFixture();expect(planMetrics(content(f)).advance).toBeNull();
    f.add('items',f.item('piece',{weight:null,criteria:[]}));f.apply({type:'status',itemId:'piece',status:'completed',reason:'Declaración'});
    f.state.focusSessions.push({durationSeconds:3600});expect(planMetrics(content(f)).advance).toBeNull();expect(planMetrics(content(f)).verifiedIds).toEqual([]);
  });
  it('counts only verified weighted deliverables and freezes earlier metrics',()=>{
    const f=planningFixture();f.add('items',f.item());f.add('items',f.item('second',{weight:6}));const before=structuredClone(plan(f).versions);
    f.verify();expect(planMetrics(content(f)).advance).toBe(25);expect(plan(f).versions.slice(0,before.length)).toEqual(before);expect(plan(f).versions.at(-1).metrics.advance).toBe(25);
  });
  it('rejects external video frames and declarations as approved own evidence',()=>{
    for(const origin of ['external','declaration']){const f=planningFixture();f.add('items',f.item());f.add('evidence',f.evidence('proof','piece',{origin}));expect(()=>f.apply({type:'evidence-review',evidenceId:'proof',status:'approved',reason:'No es propio'})).toThrow(/propia/);}
  });
  it('requires every criterion and an identified human before verification',()=>{
    const f=planningFixture();f.add('items',f.item());expect(()=>f.apply({type:'status',itemId:'piece',status:'verified',reason:'Sin pruebas'})).toThrow();
    f.add('evidence',f.evidence());expect(()=>f.apply({type:'status',itemId:'piece',status:'verified',reason:'No revisada'})).toThrow();f.apply({type:'evidence-review',evidenceId:'proof',status:'approved',reason:'Medición revisada'});expect(planMetrics(content(f)).coverage).toBe(100);expect(planMetrics(content(f)).advance).toBe(0);
    f.apply({type:'status',itemId:'piece',status:'verified',reason:'Criterios satisfechos'});expect(content(f).items[0].verification.actor).toBe(f.actor);
  });
  it('invalidates a verified result after evidence becomes obsolete or is edited',()=>{
    const f=planningFixture();f.add('items',f.item());f.verify();f.apply({type:'evidence-review',evidenceId:'proof-piece',status:'obsolete',reason:'La pieza cambió'});expect(content(f).items[0].status).toBe('correct');expect(planMetrics(content(f)).advance).toBe(0);
  });
  it('keeps knowledge independent from product advancement',()=>{
    const f=planningFixture();f.add('items',f.item());f.add('items',f.item('python',{kind:'knowledge',weight:null,requiredLevel:'Funciones sin copiar'}));expect(planMetrics(content(f)).learning).toBe(0);f.verify('python');expect(planMetrics(content(f))).toMatchObject({learning:100,advance:0});
  });
  it('blocks dependents, detects hard cycles and permits informative relations',()=>{
    const f=planningFixture();f.add('items',f.item());f.add('items',f.item('base'));
    const edge={id:'dep',from:'piece',to:'base',type:'blocking',critical:true,reason:'Necesita pieza',sourceId:null,author:'Fixture'};f.add('dependencies',edge);
    expect(()=>f.apply({type:'status',itemId:'base',status:'in_progress',reason:'Intento'})).toThrow(/dependencias/);
    let p=f.propose([f.op('dependencies','add','cycle',{...edge,id:'cycle',from:'base',to:'piece'})]);expect(()=>f.approve(p)).toThrow(/Ciclo/);
    p=f.propose([f.op('dependencies','add','info',{...edge,id:'info',from:'base',to:'piece',type:'informative'})]);f.approve(p);f.verify('piece');f.apply({type:'status',itemId:'base',status:'in_progress',reason:'Requisito verificado'});
  });
  it('rejects hierarchy cycles and foreign project task references',()=>{
    const f=planningFixture();const p=f.propose([f.op('items','add','a',f.item('a',{kind:'phase',parentId:'b'})),f.op('items','add','b',f.item('b',{kind:'phase',parentId:'a'}))]);expect(()=>f.approve(p)).toThrow(/ciclo/);
    const q=f.propose([f.op('items','add','foreign',f.item('foreign',{taskId:'foreign-task'}))]);expect(()=>f.approve(q)).toThrow(/tarea/);
  });
  it('stages changes and supports partial acceptance with explicit reconciliation',()=>{
    const f=planningFixture();const p=f.propose([f.op('items','add','piece',f.item()),f.op('items','add','base',f.item('base'))]);expect(content(f).items).toHaveLength(0);
    const preview=proposalPreview(plan(f),p,[p.operations[0].id],f.state);expect(preview.content.items).toHaveLength(1);expect(content(f).items).toHaveLength(0);
    f.approve(p,[p.operations[0].id]);expect(plan(f).proposals[0].status).toBe('partial');f.apply({type:'rebase',proposalId:p.id,newProposalId:'rebased',reason:'Revisé la nueva versión'});f.approve(plan(f).proposals.at(-1));expect(content(f).items).toHaveLength(2);
  });
  it('rejects stale proposals and stale revisions without overwriting',()=>{
    const f=planningFixture();const p=f.propose([f.op('items','add','piece',f.item())]);const revision=plan(f).revision;f.add('items',f.item('base'));
    expect(()=>f.approve(p)).toThrow(/cambió/);expect(()=>f.apply({type:'reject',proposalId:p.id,reason:'Vieja',expectedRevision:revision})).toThrow(/cliente/);
  });
  it('requires explicit confirmation for an objective change',()=>{
    const f=planningFixture();const p=f.propose([f.op('brief','edit',null,{...content(f).brief,objective:'Otro objetivo'})]);expect(()=>f.apply({type:'approve',proposalId:p.id,selectedIds:p.operations.map(o=>o.id),reason:'Cambio'})).toThrow(/objetivo/);f.approve(p);
  });
  it('restores as a new version without truncating evidence or events',()=>{
    const f=planningFixture();f.add('items',f.item());f.verify();const old=structuredClone(plan(f));f.apply({type:'restore',version:2,reason:'Volver a base',confirm:true});expect(plan(f).versions.slice(0,old.versions.length)).toEqual(old.versions);expect(plan(f).events.slice(0,old.events.length)).toEqual(old.events);expect(planMetrics(content(f)).advance).toBe(0);
  });
  it('preserves contradictory sources rather than replacing the old claim',()=>{
    const f=planningFixture();f.add('sources',{id:'video',title:'Video externo',content:'Referencia sintética',origin:'external',version:'1',url:'https://example.test/video',date:'2026-10-31'});
    f.add('facts',{id:'old',title:'Medida antigua',content:'Supuesto',status:'assumed',sourceIds:['video'],contradicts:[]});f.add('facts',{id:'new',title:'Medida nueva',content:'Declaración',status:'contradicted',sourceIds:[],contradicts:['old']});expect(content(f).facts).toHaveLength(2);
  });
  it('scenarios remain estimates and never alter committed dates',()=>{
    const f=planningFixture();f.add('items',f.item('piece',{training:[2,4],construction:[2,6],deadline:'2026-11-01',targetDate:'2026-11-02'}));const before=structuredClone(content(f));const s=scenario(content(f),'2026-11-01');expect(s.rows[0]).toMatchObject({earliest:'2026-11-02',latest:'2026-11-05',deadline:'2026-11-01'});expect(content(f)).toEqual(before);
  });
  it('unknown training time is not assumed zero',()=>{const f=planningFixture();f.add('items',f.item('piece',{construction:[1,2]}));expect(scenario(content(f),'2026-11-01').rows[0].latest).toBeNull();});
  it('does not overlap sequential work in the same daily availability',()=>{
    const f=planningFixture();f.add('items',f.item('piece',{training:[1,1],construction:[1,1]}));f.add('items',f.item('next',{training:[1,1],construction:[1,1]}));f.add('dependencies',{id:'sequence',from:'piece',to:'next',type:'sequential',critical:false,reason:'Primero la pieza',sourceId:null,author:'Fixture'});
    expect(scenario(content(f),'2026-11-01').rows.find(r=>r.id==='next').earliest).toBe('2026-11-02');expect(content(f).items[1].targetDate).toBeNull();
  });
  it('validates server replay, ownership and immutable history',()=>{
    const f=planningFixture();const before=structuredClone(f.state);f.add('items',f.item());expect(()=>validatePlanningTransition(before,f.state,f.actor)).not.toThrow();
    expect(()=>validatePlanningTransition(before,f.state,'another-account')).toThrow(/Autor/);
    const forged=structuredClone(f.state);forged.projectPlans[0].versions.at(-1).content.items[0].weight=999;expect(()=>validatePlanningTransition(before,forged,f.actor)).toThrow(/comandos|Métricas/);
    const rewrite=structuredClone(f.state);rewrite.projectPlans[0].events[0].actor='someone';expect(()=>validatePlanningTransition(before,rewrite,f.actor)).toThrow(/historial/);
  });
  it('does not let a proposal forge verifications or introduce arbitrary fields',()=>{
    const f=planningFixture();expect(()=>f.propose([f.op('items','add','piece',f.item('piece',{status:'verified'}))])).toThrow(/verificaciones/);
    const p=f.propose([f.op('items','add','piece',{...f.item(),secretField:'not accepted'})]);expect(()=>f.approve(p)).toThrow(/campos/);
  });
  it('uses no provider network while disabled; imports are proposals not backups',async()=>{
    const transport=vi.fn();const f=planningFixture();await expect(new PlanningProvider({transport}).suggest({plan:plan(f)})).rejects.toThrow(/desactivada/);expect(transport).not.toHaveBeenCalled();
    expect(()=>parseProposalFile(JSON.stringify(createExportEnvelope(f.state)),plan(f))).toThrow(/copia/);
  });
  it('retains plans in backups and old states normalize additively',()=>{
    const f=planningFixture();f.add('items',f.item());expect(prepareImportedState(createExportEnvelope(f.state).data).projectPlans).toEqual(f.state.projectPlans);const old=structuredClone(f.state);delete old.projectPlans;expect(normalizeState(old).projectPlans).toEqual([]);validatePlans(f.state);
  });
  it('reuses repository commits and preserves unrelated timer data',async()=>{
    const f=planningFixture();const repo=new StudyHubRepository({adapter:new MemoryAdapter(f.state),store:createStore(null)});await repo.initialize();const original=structuredClone(repo.getState().tasks);
    await repo.planCommand('synthetic-cube',{id:'repo-command',type:'propose',expectedRevision:plan(f).revision,proposal:{id:'repo-proposal',title:'Scope',baseVersion:1,operations:[f.op('items','add','piece',f.item())],origin:'human',provider:'',model:'',questions:'',uncertainties:''}},f.actor);
    expect(repo.getState().tasks).toEqual(original);await repo.deleteProject('synthetic-cube');expect(repo.getState().projectPlans).toEqual([]);
  });
  it('removes a linked task without losing planning history',async()=>{
    const f=planningFixture();f.add('items',f.item('piece',{taskId:'synthetic-task'}));const repo=new StudyHubRepository({adapter:new MemoryAdapter(f.state),store:createStore(null)});await repo.initialize();await repo.deleteTask('synthetic-task');expect(currentContent(repo.getState().projectPlans[0]).items[0].taskId).toBeNull();expect(repo.getState().projectPlans[0].events.at(-1).type).toBe('task-removed');
  });
  it('renders escaped source text, labels, disabled cloud and no invented percentage',()=>{
    const f=planningFixture();const html=planningView(f.state,{...f.state.projects[0],name:'<script>unsafe</script>'},{},{cloud:true,cloudReady:false});expect(html).not.toContain('<script>');expect(html).toContain('Sin calcular');expect(html).toContain('falta instalar');expect(html).toContain('aria-label="Apartados del plan"');
  });
  it('requires new evidence review when acceptance criteria change, even with the same criterion ID',()=>{
    const f=planningFixture();f.add('items',f.item());f.verify();const p=f.propose([f.op('items','edit','piece',{...content(f).items[0],status:'correct',verification:null,criteria:[{id:'piece-criterion',text:'Otro umbral'}]})]);
    expect(proposalPreview(plan(f),p,p.operations.map(o=>o.id),f.state).afterMetrics.coverage).toBe(0);f.approve(p);expect(content(f).evidence[0].review).toBeNull();expect(()=>f.apply({type:'status',itemId:'piece',status:'verified',reason:'Reutilizar aprobación vieja'})).toThrow();
  });
  it('invalidates approval when its source version changes',()=>{
    const f=planningFixture();f.add('items',f.item());const source={id:'source',title:'Medición',content:'Versión sintética',origin:'own',version:'1',url:'',date:'2026-10-31'};f.add('sources',source);f.add('evidence',f.evidence('proof','piece',{sourceId:'source'}));f.apply({type:'evidence-review',evidenceId:'proof',status:'approved',reason:'Revisada'});f.apply({type:'status',itemId:'piece',status:'verified',reason:'Aceptada'});
    f.approve(f.propose([f.op('sources','edit','source',{...source,version:'2',content:'Medición corregida'})]));expect(planMetrics(content(f)).advance).toBe(0);expect(content(f).items[0].status).toBe('correct');
  });
  it('restoring a verified version keeps the historical result but requires new evidence review',()=>{
    const f=planningFixture();f.add('items',f.item());f.verify();const version=plan(f).activeVersion;f.apply({type:'restore',version,confirm:true,reason:'Recuperar estructura'});expect(plan(f).versions[version-1].metrics.advance).toBe(100);expect(planMetrics(content(f)).advance).toBe(0);expect(content(f).evidence[0].review.status).toBe('incomplete');
  });
  it('revises a pending proposal without erasing the original or applying it',()=>{
    const f=planningFixture();const p=f.propose([f.op('items','add','piece',f.item())]);f.apply({type:'revise-proposal',proposalId:p.id,reason:'Corregir peso',proposal:{...p,id:'revised',operations:[{...p.operations[0],value:{...f.item(),weight:5}}]}});expect(content(f).items).toHaveLength(0);expect(plan(f).proposals[0]).toMatchObject({status:'superseded',operations:p.operations});f.approve(plan(f).proposals[1]);expect(content(f).items[0].weight).toBe(5);validatePlanningTransition(null,f.state,f.actor);
  });
  it('marks replaced private files obsolete and preserves the accepted historical version',async()=>{
    const f=planningFixture();f.add('items',f.item());const path='synthetic-owner/synthetic-task/filehash';f.add('evidence',f.evidence('proof','piece',{file:{taskId:'synthetic-task',path,version:f.at}}));f.apply({type:'evidence-review',evidenceId:'proof',status:'approved',reason:'Revisada'});f.apply({type:'status',itemId:'piece',status:'verified',reason:'Verificada'});
    const repo=new StudyHubRepository({adapter:new MemoryAdapter(f.state),store:createStore(null)});await repo.initialize();await repo.invalidatePlanFile(path,f.actor);const updated=repo.getState().projectPlans[0];expect(currentContent(updated).evidence[0].review.status).toBe('obsolete');expect(updated.versions.at(-2).metrics.advance).toBe(100);expect(updated.versions.at(-1).metrics.advance).toBe(0);
  });
  it('preserves both concurrent planning decisions, exposes conflict and keeps the offline draft on reload',async()=>{
    const f=planningFixture();f.add('items',f.item());const backend=new FakeCloudBackend();backend.seed(f.actor,f.state);
    const a=await createCloudContext({backend,userId:f.actor}),b=await createCloudContext({backend,userId:f.actor});
    const revision=plan(f).revision;
    await a.repository.planCommand('synthetic-cube',{id:'client-a',type:'status',expectedRevision:revision,itemId:'piece',status:'in_progress',reason:'Cliente A'},f.actor);
    b.connectivity.online=false;
    await b.repository.planCommand('synthetic-cube',{id:'client-b',type:'status',expectedRevision:revision,itemId:'piece',status:'completed',reason:'Cliente B sin conexión'},f.actor);
    const reload=await createCloudContext({backend,userId:f.actor,storage:b.storage});expect(reload.adapter.getStatus().state).toBe('conflict');
    expect(currentContent(backend.stateFor(f.actor).projectPlans[0]).items[0].status).toBe('in_progress');expect(currentContent(reload.repository.getState().projectPlans[0]).items[0].status).toBe('completed');
    const remote=await reload.adapter.useRemoteAfterConflict();expect(currentContent(remote.projectPlans[0]).items[0].status).toBe('in_progress');expect([...b.storage.values.keys()].some(k=>k.startsWith(reload.adapter.keys.conflictBackup+':'))).toBe(true);
    for(const ctx of [a,b,reload])ctx.repository.destroy();
  });
  it('synchronizes a plan to another client without adding it to another account cache',async()=>{
    const f=planningFixture();const backend=new FakeCloudBackend();backend.seed(f.actor,f.state);
    const a=await createCloudContext({backend,userId:f.actor}),b=await createCloudContext({backend,userId:f.actor}),other=await createCloudContext({backend,userId:'other'});
    const proposal={id:'sync-proposal',title:'Synthetic sync',baseVersion:1,operations:[f.op('items','add','piece',f.item())],origin:'human',provider:'',model:'',questions:'',uncertainties:''};
    await a.repository.planCommand('synthetic-cube',{id:'sync-event',type:'propose',expectedRevision:1,proposal},f.actor);await b.repository.syncNow();
    expect(b.repository.getState().projectPlans[0].proposals[0].id).toBe('sync-proposal');expect(other.repository.getState().projectPlans).toEqual([]);
    for(const ctx of [a,b,other])ctx.repository.destroy();
  });
  it('refuses cloud or unconfirmed destinations in the new staging runner',()=>{
    expect(()=>planningStagingConfig({})).toThrow(/local/);
    expect(()=>planningStagingConfig({STUDYHUB_STAGING_CONFIRM:'disposable-local-only',STUDYHUB_STAGING_URL:'https://example.supabase.co'})).toThrow(/Solo/);
    expect(planningStagingConfig({STUDYHUB_STAGING_CONFIRM:'disposable-local-only',STUDYHUB_STAGING_URL:'http://127.0.0.1:54321',STUDYHUB_STAGING_ANON_KEY:'local-fixture',STUDYHUB_STAGING_SERVICE_KEY:'local-fixture'}).edge).toBe('http://127.0.0.1:54321/functions/v1/studyhub-plan');
  });
  it('limits provider context to selected sources and never applies the synthetic response',async()=>{
    const f=planningFixture();const source={id:'chosen',title:'Fixture',content:'Synthetic only',origin:'own',version:'1',url:'',date:null};f.add('sources',source);f.add('sources',{...source,id:'private',content:'Not selected'});
    const proposal={id:'ai-fixture',title:'Synthetic provider proposal',baseVersion:plan(f).activeVersion,operations:[f.op('items','add','piece',f.item())],origin:'ai',provider:'synthetic-only',model:'fixture',questions:'',uncertainties:'Synthetic'};
    const transport=vi.fn(async()=>proposal),provider=new PlanningProvider({enabled:true,transport});const before=structuredClone(plan(f));await provider.suggest({plan:plan(f),state:f.state,context:'Selected context',sourceIds:['chosen'],consent:true});
    expect(transport.mock.calls[0][0].sources.map(s=>s.id)).toEqual(['chosen']);expect(plan(f)).toEqual(before);
    const abort=new AbortController();abort.abort();await expect(provider.suggest({plan:plan(f),state:f.state,context:'',sourceIds:[],consent:true,signal:abort.signal})).rejects.toThrow(/cancelada/);expect(transport).toHaveBeenCalledTimes(1);
  });
});

import {describe,it,expect} from 'vitest';
import {planningFixture} from './helpers/planningFixture.js';
import {StudyHubRepository} from '../src/data/repository.js';
import {MemoryAdapter} from '../src/data/localAdapter.js';
import {createStore} from '../src/state/store.js';
import {validateState,normalizeState} from '../src/data/schema.js';
import {currentContent,validatePlanningTransition} from '../src/planning/engine.js';
import {projectWeekFacts} from '../src/planning/deliveries.js';
import {studyProjectProgress} from '../src/evaluation/progress.js';
import {reviseExercise} from '../src/evaluation/attempts.js';

async function fixture(){const f=planningFixture('local');f.add('items',f.item());const repo=new StudyHubRepository({adapter:new MemoryAdapter(f.state),store:createStore(null),clock:()=>new Date(f.at)});await repo.initialize();return {...f,repo};}
const input={requestId:'request-1',title:'Entrega sintética',purpose:'technical',itemIds:['piece'],competencyIds:[],files:[],code:'return 1',actualResult:'Una prueba declarada'};
describe('shared submissions',()=>{
  it('persists one immutable delivery on retry, then a distinct version without academic scores',async()=>{
    const {repo}=await fixture();const first=await repo.saveDelivery('synthetic-cube',input);
    await repo.saveDelivery('synthetic-cube',input);
    expect(repo.getState().exercises).toHaveLength(1);expect(repo.getState().evidence).toHaveLength(1);
    const original=structuredClone(repo.getState().exercises[0].submissionVersions[0]);
    await expect(repo.saveDelivery('synthetic-cube',{...input,title:'Changed'})).rejects.toThrow(/identificador/i);
    await repo.saveDelivery('synthetic-cube',{...input,requestId:'request-2',exerciseId:first.exerciseId,expectedVersion:1,purpose:'both',code:'return 2'});
    const state=normalizeState(JSON.parse(JSON.stringify(repo.getState())));
    expect(state.exercises[0].submissionVersions).toHaveLength(2);expect(state.exercises[0].submissionVersions[0]).toEqual(original);
    expect(state.evaluations).toEqual([]);expect(studyProjectProgress(state,'synthetic-cube').overall).toBeNull();
    expect(()=>validateState(state)).not.toThrow();
    await expect(repo.saveDelivery('synthetic-cube',{...input,requestId:'request-3',exerciseId:first.exerciseId,expectedVersion:1})).rejects.toThrow(/cambió/);
    await expect(reviseExercise(repo,first.exerciseId,{title:'overwrite'})).rejects.toThrow(/versiones compartidas/);
  });
  it('invalidates only linked technical verification and preserves the historical original',async()=>{
    const {repo,f:unused,...f}=await fixture();const result=await repo.saveDelivery('synthetic-cube',input);
    const run=command=>repo.planCommand('synthetic-cube',{id:crypto.randomUUID(),expectedRevision:repo.getState().projectPlans[0].revision,...command});
    const proof=f.evidence('linked','piece',{sharedEvidenceId:result.evidenceId});
    const proposal={id:'link',title:'Vincular',baseVersion:repo.getState().projectPlans[0].activeVersion,origin:'human',provider:'',model:'',questions:'',uncertainties:'',operations:[f.op('evidence','add','linked',proof)]};
    await run({type:'propose',proposal});await run({type:'approve',proposalId:'link',selectedIds:proposal.operations.map(o=>o.id),reason:'Revisado',confirmObjective:true});
    await run({type:'evidence-review',evidenceId:'linked',status:'approved',reason:'Revisión identificada'});await run({type:'status',itemId:'piece',status:'verified',reason:'Aceptación'});
    const before=structuredClone(repo.getState());
    await repo.saveDelivery('synthetic-cube',{...input,requestId:'request-2',exerciseId:result.exerciseId,expectedVersion:1,actualResult:'Cambió'});
    expect(currentContent(repo.getState().projectPlans[0]).evidence[0].review.status).toBe('obsolete');
    expect(repo.getState().projectPlans[0].versions.slice(0,-1)).toEqual(before.projectPlans[0].versions);
    expect(()=>validatePlanningTransition(before,repo.getState(),'local')).not.toThrow();
    const edited=structuredClone(repo.getState());edited.exercises[0].code='cambio sin nueva versión';
    expect(()=>validateState(edited)).toThrow(/última versión/);
    const tampered=structuredClone(repo.getState());tampered.exercises[0].submissionVersions[0].payload.code='tamper';
    expect(()=>validatePlanningTransition(before,tampered,'local')).toThrow(/inmutables/);
  });
  it('keeps state on write failure and weekly facts point to the actual submissions',async()=>{
    const {repo}=await fixture(),before=structuredClone(repo.getState());const save=repo.adapter.save.bind(repo.adapter);
    repo.adapter.save=async()=>{throw new Error('disk failure');};await expect(repo.saveDelivery('synthetic-cube',input)).rejects.toThrow('disk failure');expect(repo.getState()).toEqual(before);
    repo.adapter.save=save;const result=await repo.saveDelivery('synthetic-cube',input);
    const facts=projectWeekFacts(repo.getState(),'synthetic-cube','2026-10-26','2026-11-01');expect(facts.submissionIds).toEqual([result.submissionId]);expect(facts.evidenceIds).toEqual([result.evidenceId]);expect(facts.attemptIds).toEqual([]);
  });
});

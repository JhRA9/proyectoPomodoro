import {describe,it,expect} from 'vitest';
import {planningFixture} from './helpers/planningFixture.js';
import {StudyHubRepository} from '../src/data/repository.js';
import {MemoryAdapter} from '../src/data/localAdapter.js';
import {createStore} from '../src/state/store.js';
import {createEmptyState,normalizeState} from '../src/data/schema.js';
import {canonical,currentContent,planMetrics,validatePlanningTransition} from '../src/planning/engine.js';
import {sha256} from '../src/utils/integrity.js';

describe('explicit local history adoption',()=>{
  it('preserves the exact local archive and authors without accrediting imported verification',async()=>{
    const f=planningFixture('local');f.add('items',f.item());f.verify();const original=structuredClone(f.state.projectPlans[0]);
    const adapter=new MemoryAdapter(createEmptyState());adapter.userId='synthetic-account';const repo=new StudyHubRepository({adapter,store:createStore(null)});await repo.initialize();const empty=structuredClone(repo.getState());
    await repo.replaceFromMigration(f.state,{confirmPlanning:true});const result=repo.getState(),plan=result.projectPlans[0];
    expect(plan.events[0].actor).toBe('synthetic-account');expect(plan.events[0].command.archive).toEqual(original);expect(plan.provenance.sha256).toBe(await sha256(canonical(original)));
    expect(planMetrics(currentContent(plan)).advance).toBe(0);expect(plan.events[0].command.archive.versions.at(-1).metrics.advance).toBe(100);
    expect(()=>validatePlanningTransition(empty,result,'synthetic-account')).not.toThrow();expect(normalizeState(JSON.parse(JSON.stringify(result))).projectPlans).toEqual(result.projectPlans);
    await expect(repo.replaceFromMigration(f.state,{confirmPlanning:true})).rejects.toThrow(/vacía/);
  });
  it('does not transfer private references by inventing ownership',async()=>{
    const f=planningFixture('local');f.add('items',f.item());f.add('evidence',f.evidence('file','piece',{file:{taskId:'synthetic-task',path:'old-account/synthetic-task/file',version:'v1'}}));
    const adapter=new MemoryAdapter(createEmptyState());adapter.userId='synthetic-account';const repo=new StudyHubRepository({adapter,store:createStore(null)});await repo.initialize();
    await expect(repo.replaceFromMigration(f.state,{confirmPlanning:true})).rejects.toThrow(/archivos privados/);expect(repo.getState().projects).toEqual([]);expect(adapter.writeCount).toBe(0);
  });
});

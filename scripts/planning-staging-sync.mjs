import assert from 'node:assert/strict';
import {SupabaseStateGateway,CloudStorageAdapter} from '../src/data/cloudAdapter.js';
import {StudyHubRepository} from '../src/data/repository.js';
import {createStore} from '../src/state/store.js';
import {MemoryStorage,FakeEventTarget} from '../tests/helpers/cloudHarness.js';
import {canonical,currentContent} from '../src/planning/engine.js';

export async function verifyPlanningSync(client,secondClient,owner,edge) {
  const contexts=[],checks=[];
  const context=async(sdk,storage=new MemoryStorage())=>{
    // SDK Auth/PostgREST and the production gateway/adapter/repository are real.
    // Only the function URL is redirected to the isolated loopback Edge Runtime.
    const localClient={from:(...args)=>sdk.from(...args),functions:{invoke:async(name,{body})=>{
      assert.equal(name,'studyhub-plan');
      const {data}=await sdk.auth.getSession();
      const response=await fetch(edge,{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
      return response.ok?{data:await response.json(),error:null}:{data:null,error:{context:response}};
    }}};
    const gateway=new SupabaseStateGateway({client:localClient,userId:owner,planningReady:true});
    const connectivity={online:true},adapter=new CloudStorageAdapter({gateway,userId:owner,storage,eventTarget:new FakeEventTarget(),isOnline:()=>connectivity.online});
    const repo=new StudyHubRepository({adapter,store:createStore(null)});await repo.initialize();
    const result={repo,adapter,connectivity,storage};contexts.push(result);return result;
  };
  try {
    const a=await context(client),b=await context(secondClient);
    const before=a.repo.getState().projectPlans[0],command=(id,status)=>({id,type:'status',expectedRevision:before.revision,itemId:'piece',status,reason:'Cliente sintético'});
    await a.repo.planCommand('synthetic-cube',command('real-client-a','in_progress'),owner);
    assert.equal(a.adapter.getStatus().state,'synced');
    b.connectivity.online=false;
    await b.repo.planCommand('synthetic-cube',command('real-client-b','pending'),owner);
    const local=canonical(b.repo.getState().projectPlans);
    assert.ok(b.adapter.readPending().data);checks.push('Cola offline del plan con repositorio real');
    const reloaded=await context(secondClient,b.storage);
    assert.equal(reloaded.adapter.getStatus().state,'conflict');assert.equal(canonical(reloaded.repo.getState().projectPlans),local);
    assert.equal(currentContent(a.repo.getState().projectPlans[0]).items[0].status,'in_progress');checks.push('Recarga conserva conflicto y no sobrescribe otra sesión');
    const recovered=await reloaded.adapter.useRemoteAfterConflict();reloaded.repo.store.setState(recovered);
    assert.ok([...b.storage.values.keys()].some(key=>key.startsWith(reloaded.adapter.keys.conflictBackup+':')));assert.equal(currentContent(recovered.projectPlans[0]).items[0].status,'in_progress');checks.push('Recuperación explícita conserva copia divergente');
    const p=recovered.projectPlans[0];await reloaded.repo.planCommand('synthetic-cube',{...command('real-client-reconciled','completed'),expectedRevision:p.revision},owner);
    await a.repo.syncNow();assert.equal(canonical(a.repo.getState().projectPlans),canonical(reloaded.repo.getState().projectPlans));checks.push('Segundo cliente recibe plan e historial reconciliados');
    return checks;
  }finally{for(const {repo} of contexts)repo.destroy();}
}

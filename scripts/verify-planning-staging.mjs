import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {stagingConfig} from './verify-local-staging.mjs';
import {planningFixture} from '../tests/helpers/planningFixture.js';
import {currentContent,canonical} from '../src/planning/engine.js';

// Never reads .env, linked project IDs, cloud tokens or provider keys.
export function planningStagingConfig(env) {
  return {...stagingConfig(env),edge:'http://127.0.0.1:54321/functions/v1/studyhub-plan'};
}
const checked=result=>{if(result.error)throw Error(`Fallo de staging (${result.error.code||result.error.status||'sin código'})`);return result.data;};
export async function verifyPlanningStaging(config) {
  // Recheck the destination even if invoked as an imported function.
  assert.equal(config.url,'http://127.0.0.1:54321');
  assert.equal(config.edge,config.url+'/functions/v1/studyhub-plan');
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}},admin=createClient(config.url,config.service,options);
  const users=[],clients=[],tokens=[],checks=[];let privatePath;
  const pass=name=>checks.push(name);
  const post=(token,state,expectedRevision)=>fetch(config.edge,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:config.anon,'Content-Type':'application/json'},body:JSON.stringify({state,expectedRevision}),signal:AbortSignal.timeout(20000)});
  try {
    for(let n=0;n<2;n++) {
      const email=`planning-${randomUUID()}@example.test`,password=randomBytes(32).toString('hex');
      const {user}=checked(await admin.auth.admin.createUser({email,password,email_confirm:true}));users.push(user);
      const client=createClient(config.url,config.anon,options);clients.push(client);tokens.push(checked(await client.auth.signInWithPassword({email,password})).session.access_token);
    }
    const [a,b]=clients,[owner]=users;
    const f=planningFixture(owner.id),legacy=structuredClone(f.state);delete legacy.projectPlans;legacy.revision=0;
    checked(await a.from('studyhub_states').insert({user_id:owner.id,state:legacy,revision:0}));
    assert.equal((await post(tokens[0],f.state,0)).status,200);pass('Auth y creación por handler real');
    assert.equal(checked(await b.from('studyhub_states').select().eq('user_id',owner.id)).length,0);pass('RLS lectura entre cuentas');
    assert.notEqual((await post(tokens[1],f.state,null)).status,200);pass('Otra cuenta no puede reproducir eventos ajenos');
    const tampered=structuredClone(f.state);tampered.projectPlans[0].versions[0].content.brief.objective='Intrusión sintética';
    assert.ok((await a.from('studyhub_states').update({state:tampered}).eq('user_id',owner.id)).error);pass('Trigger rechaza escrituras directas');
    assert.ok((await a.rpc('studyhub_save_planned_snapshot',{p_owner:owner.id,p_state:tampered,p_expected_revision:f.state.revision})).error);pass('RPC privilegiado no accesible al cliente');
    const base=f.state.revision,old=structuredClone(f.state);f.add('items',f.item());
    const results=await Promise.all([post(tokens[0],f.state,base),post(tokens[0],{...old,revision:old.revision+1,updatedAt:new Date().toISOString()},base)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);pass('Dos escrituras simultáneas: una gana, otra recibe conflicto');
    let stored=checked(await a.from('studyhub_states').select().eq('user_id',owner.id).single());
    // Reconcile explicitly if the other valid snapshot won the race.
    if(stored.state.projectPlans[0].activeVersion===1){f.state.revision=stored.revision+1;assert.equal((await post(tokens[0],f.state,stored.revision)).status,200);}
    const remote=checked(await a.from('studyhub_states').select().eq('user_id',owner.id).single());assert.equal(canonical(remote.state.projectPlans),canonical(f.state.projectPlans));pass('Lectura del segundo cliente conserva historia exacta');
    privatePath=`${owner.id}/synthetic-task/fixture-${randomUUID()}`;
    checked(await a.storage.from('studyhub-task-files').upload(privatePath,new Blob(['synthetic evidence'],{type:'text/plain'})));
    const info=checked(await a.storage.from('studyhub-task-files').info(privatePath)),fileVersion=info.lastModified??info.last_modified;assert.ok(fileVersion);
    assert.ok((await b.storage.from('studyhub-task-files').download(privatePath)).error);pass('Storage privado entre cuentas');
    const revision=f.state.revision;f.add('evidence',f.evidence('proof','piece',{file:{taskId:'synthetic-task',path:privatePath,version:fileVersion}}));f.apply({type:'evidence-review',evidenceId:'proof',status:'approved',reason:'Revisión sintética'});f.apply({type:'status',itemId:'piece',status:'verified',reason:'Fixture, no montaje real'});
    assert.equal((await post(tokens[0],f.state,revision)).status,200);pass('Evidencia privada versionada y verificación humana');
    const prior=structuredClone(f.state),version=f.state.projectPlans[0].activeVersion;
    f.apply({type:'restore',version,confirm:true,reason:'Reversión sintética como nueva versión'});assert.equal((await post(tokens[0],f.state,prior.revision)).status,200);
    assert.equal(currentContent(f.state.projectPlans[0]).items[0].status,'correct');assert.deepEqual(f.state.projectPlans[0].events.slice(0,prior.projectPlans[0].events.length),prior.projectPlans[0].events);pass('Restauración conserva eventos y exige revisar evidencia');
    const before=canonical(f.state.projectPlans),again=await post(tokens[0],f.state,prior.revision);assert.equal(again.status,200);assert.equal(canonical((await again.json()).data.state.projectPlans),before);pass('Confirmación perdida no duplica comandos');
    assert.ok((await a.from('studyhub_states').delete().eq('user_id',owner.id)).error);pass('Cliente antiguo no elimina y recrea el snapshot');
    return {status:'passed',syntheticOnly:true,providerRequests:0,checks};
  } finally {
    if(privatePath)checked(await admin.storage.from('studyhub-task-files').remove([privatePath]));
    for(const user of users)checked(await admin.auth.admin.deleteUser(user.id));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {const config=planningStagingConfig(process.env);console.log(JSON.stringify(await verifyPlanningStaging(config),null,2));}
  catch(error){console.error('Planificación staging NO aprobada: '+error.message);process.exitCode=1;}
}

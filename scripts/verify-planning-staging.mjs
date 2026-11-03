import {cloudStagingConfig} from './cloud-staging.mjs';
import {rehearseCloudRestore} from './verify-planning-cloud-restore.mjs';
import {writeFileSync} from 'node:fs';
import {sha256} from '../src/utils/integrity.js';
import {packPlanningState} from '../src/planning/transport.js';
import {TaskFileStore} from '../src/cloud/taskFiles.js';
import {saveDelivery} from '../src/planning/deliveries.js';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {stagingConfig} from './verify-local-staging.mjs';
import {planningFixture} from '../tests/helpers/planningFixture.js';
import {currentContent,canonical,executePlan} from '../src/planning/engine.js';
import {verifyPlanningSql} from './planning-staging-sql.mjs';
import {verifyPlanningSync} from './planning-staging-sync.mjs';

// Never reads .env, linked project IDs, cloud tokens or provider keys.
export function planningStagingConfig(env) {
  const edge=env.STUDYHUB_PLANNING_EDGE||'http://127.0.0.1:54321/functions/v1/studyhub-plan';
  assert.ok(['http://127.0.0.1:54321/functions/v1/studyhub-plan','http://127.0.0.1:54329/functions/v1/studyhub-plan'].includes(edge),'Solo se acepta el handler local desechable');
  return {...stagingConfig(env),edge};
}
const checked=result=>{if(result.error)throw Error(`Fallo de staging (${result.error.code||result.error.status||'sin código'})`);return result.data;};
export async function verifyPlanningStaging(config) {
  // Recheck the destination even if invoked as an imported function.
  if(config.cloud){
    const allowed=cloudStagingConfig(process.env);assert.equal(config.url,allowed.url);assert.equal(config.edge,allowed.url+'/functions/v1/studyhub-plan');assert.ok(!config.sqlRehearsal);
  }else{assert.equal(config.url,'http://127.0.0.1:54321');
  assert.ok([config.url+'/functions/v1/studyhub-plan','http://127.0.0.1:54329/functions/v1/studyhub-plan'].includes(config.edge));}
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}},admin=createClient(config.url,config.service,options);
  const users=[],clients=[],tokens=[],checks=[];let privatePath,secondClient;const originals=[];
  let lastResponse;
  const pass=name=>checks.push(name);
  const post=async(token,state,expectedRevision)=>{const response=await fetch(config.edge,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:config.anon,'Content-Type':'application/json'},body:JSON.stringify({state,expectedRevision}),signal:AbortSignal.timeout(20000)});lastResponse={status:response.status,message:response.status>=400?(await response.clone().json()).message:null};return response;};
  try {
    for(let n=0;n<2;n++) {
      const email=`planning-${randomUUID()}@example.test`,password=randomBytes(32).toString('hex');
      const {user}=checked(await admin.auth.admin.createUser({email,password,email_confirm:true}));users.push(user);
      const client=createClient(config.url,config.anon,options);clients.push(client);tokens.push(checked(await client.auth.signInWithPassword({email,password})).session.access_token);
      if(n===0){secondClient=createClient(config.url,config.anon,options);checked(await secondClient.auth.signInWithPassword({email,password}));}
    }
    const [a,b]=clients,[owner]=users;
    const f=planningFixture(owner.id);
    f.state.legacyExtension={source:'synthetic-old-backup',preserved:true};
    f.state.deliveryStages=[{id:'legacy-stage',projectId:'synthetic-cube',title:'Etapa anterior',order:0,createdAt:f.at}];
    f.state.deliverables=[{id:'legacy-deliverable',projectId:'synthetic-cube',stageId:'legacy-stage',title:'Entregable anterior',description:'Fixture',status:'completed_unverified',dependencyIds:[],blockingReason:'',weight:3,dueDate:null,verifiedAt:null,createdAt:f.at,updatedAt:f.at}];
    const legacy=structuredClone(f.state);delete legacy.projectPlans;legacy.revision=0;
    if(config.cloud){assert.equal(checked(await a.rpc('studyhub_save_snapshot',{p_state:legacy,p_expected_revision:null})).length,1);}else checked(await a.from('studyhub_states').insert({user_id:owner.id,state:legacy,revision:0}));
    assert.equal((await post(tokens[0],f.state,0)).status,200);pass('Auth y creación por handler real');
    assert.equal(checked(await b.from('studyhub_states').select().eq('user_id',owner.id)).length,0);pass('RLS lectura entre cuentas');
    const foreignUpdate=await b.from('studyhub_states').update({state:legacy}).eq('user_id',owner.id).select();
    if(config.cloud)assert.equal(foreignUpdate.error?.code,'42501');else assert.equal(checked(foreignUpdate).length,0);pass('RLS escritura ajena no modifica filas');
    assert.notEqual((await post(tokens[1],f.state,null)).status,200);pass('Otra cuenta no puede reproducir eventos ajenos');
    const tampered=structuredClone(f.state);tampered.projectPlans[0].versions[0].content.brief.objective='Intrusión sintética';
    assert.ok((await a.from('studyhub_states').update({state:tampered}).eq('user_id',owner.id)).error);pass('Trigger rechaza escrituras directas');
    const dangling=structuredClone(f.state);dangling.tasks=[];
    assert.ok((await a.from('studyhub_states').update({state:dangling}).eq('user_id',owner.id)).error);pass('Cliente antiguo no altera referencias conservando el JSON del plan');
    assert.ok((await a.rpc('studyhub_save_planned_snapshot',{p_owner:owner.id,p_state:tampered,p_expected_revision:f.state.revision})).error);pass('RPC privilegiado no accesible al cliente');
    const base=f.state.revision,old=structuredClone(f.state);f.add('items',f.item('piece',{kind:'work'}));
    const results=await Promise.all([post(tokens[0],f.state,base),post(tokens[0],{...old,revision:old.revision+1,updatedAt:new Date().toISOString()},base)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);pass('Dos escrituras simultáneas: una gana, otra recibe conflicto');
    let stored=checked(await a.from('studyhub_states').select().eq('user_id',owner.id).single());
    // Reconcile explicitly if the other valid snapshot won the race.
    if(stored.state.projectPlans[0].activeVersion===1){f.state.revision=stored.revision+1;assert.equal((await post(tokens[0],f.state,stored.revision)).status,200);}
    const remote=checked(await secondClient.from('studyhub_states').select().eq('user_id',owner.id).single());assert.equal(canonical(remote.state.projectPlans),canonical(f.state.projectPlans));pass('Lectura del segundo cliente conserva historia exacta');
    privatePath=`${owner.id}/synthetic-task/fixture-${randomUUID()}`;
    checked(await a.storage.from('studyhub-task-files').upload(privatePath,new Blob(['synthetic evidence'],{type:'text/plain'})));
    const info=checked(await a.storage.from('studyhub-task-files').info(privatePath)),fileVersion=info.lastModified??info.last_modified;assert.ok(fileVersion);
    assert.ok((await b.storage.from('studyhub-task-files').download(privatePath)).error);pass('Storage privado entre cuentas');
    const revision=f.state.revision;f.add('evidence',f.evidence('proof','piece',{file:{taskId:'synthetic-task',path:privatePath,version:fileVersion}}));f.apply({type:'evidence-review',evidenceId:'proof',status:'approved',reason:'Revisión sintética'});f.apply({type:'status',itemId:'piece',status:'verified',reason:'Fixture, no montaje real'});
    assert.equal((await post(tokens[0],f.state,revision)).status,200);pass('Evidencia privada versionada y verificación humana');
    await new Promise(r=>setTimeout(r,1100));
    checked(await a.storage.from('studyhub-task-files').update(privatePath,new Blob(['replacement synthetic evidence'],{type:'text/plain'})));
    const staleRevision=f.state.revision;
    f.apply({type:'status',itemId:'piece',status:'verified',reason:'Intento con versión antigua'});
    assert.equal((await post(tokens[0],f.state,staleRevision)).status,422);pass('Sustituir archivo impide acreditar su versión anterior');
    f.apply({type:'file-changed',path:privatePath,reason:'Archivo sustituido en prueba'});
    assert.equal((await post(tokens[0],f.state,staleRevision)).status,200);
    assert.equal(currentContent(f.state.projectPlans[0]).items[0].status,'correct');pass('Invalidación conserva historial y retira verificación actual');
    const prior=structuredClone(f.state),version=f.state.projectPlans[0].activeVersion;
    f.apply({type:'restore',version,confirm:true,reason:'Reversión sintética como nueva versión'});assert.equal((await post(tokens[0],f.state,prior.revision)).status,200);
    assert.equal(currentContent(f.state.projectPlans[0]).items[0].status,'correct');assert.deepEqual(f.state.projectPlans[0].events.slice(0,prior.projectPlans[0].events.length),prior.projectPlans[0].events);pass('Restauración conserva eventos y exige revisar evidencia');
    const before=canonical(f.state.projectPlans),again=await post(tokens[0],f.state,prior.revision);assert.equal(again.status,200);assert.equal(canonical((await again.json()).data.state.projectPlans),before);pass('Confirmación perdida no duplica comandos');
    assert.ok((await a.from('studyhub_states').delete().eq('user_id',owner.id)).error);pass('Cliente antiguo no elimina y recrea el snapshot');
    checks.push(...await verifyPlanningSync(a,secondClient,owner.id,config.edge));
    const finalRow=checked(await a.from('studyhub_states').select().eq('user_id',owner.id).single());
    assert.deepEqual(finalRow.state.deliverables,legacy.deliverables);assert.deepEqual(finalRow.state.legacyExtension,legacy.legacyExtension);pass('Entregables anteriores y extensiones históricas intactos');
    assert.equal((await post(tokens[0],planningFixture('local').state,finalRow.revision)).status,400);
    assert.equal((await post(tokens[0],f.state,finalRow.revision)).status,400);
    assert.equal(canonical(checked(await a.from('studyhub_states').select().eq('user_id',owner.id).single())),canonical(finalRow));pass('Importación local sin procedencia y copia antigua rechazadas sin perder datos');
    const upgraded=structuredClone(finalRow.state);
    upgraded.projectPlans[0]=executePlan(upgraded.projectPlans[0],{id:'upgrade-staging-v2',type:'upgrade-history',expectedRevision:upgraded.projectPlans[0].revision,confirm:true,reason:'Ensayo de migración local'},upgraded,owner.id,new Date().toISOString());upgraded.revision++;
    assert.equal((await post(tokens[0],upgraded,finalRow.revision)).status,200);
    const descriptor=checked(await a.from('studyhub_states').select().eq('user_id',owner.id).single());assert.equal(descriptor.state.projectPlans[0].externalHistory,true);assert.equal(descriptor.state.projectPlans[0].events,undefined);
    const hydrated=checked(await a.rpc('studyhub_read_planned_snapshot',{}))[0];assert.equal(canonical(hydrated.state),canonical(upgraded));pass('Historial v2 normalizado recupera exactamente el snapshot');
    assert.equal(checked(await b.from('studyhub_plan_events').select()).length,0);assert.ok((await b.rpc('studyhub_read_planned_snapshot',{p_owner:owner.id})).error);pass('RLS y RPC protegen historia v2 entre cuentas');
    assert.ok((await a.from('studyhub_plan_events').delete().eq('user_id',owner.id)).error);pass('Eventos v2 sin escritura directa de cliente');
    const lost=await post(tokens[0],upgraded,finalRow.revision);assert.equal(lost.status,200);pass('Recuperación idempotente tras normalizar historia');
    checks.push(...await verifyPlanningSync(a,secondClient,owner.id,config.edge));
    const fileStore=new TaskFileStore(a,owner.id);
    const original=await fileStore.uploadOriginal('synthetic-task',new File(['original synthetic bytes'],'fixture.txt',{type:'text/plain'}));originals.push(original.path);
    const duplicate=await fileStore.uploadOriginal('synthetic-task',new File(['original synthetic bytes'],'fixture.txt',{type:'text/plain'}));assert.equal(duplicate.path,original.path);pass('Original privado verifica bytes y deduplica contenido idéntico');
    const blocked=await a.storage.from('studyhub-task-files').update(original.path,new Blob(['tampered']));assert.ok(blocked.error);assert.equal(await (await fileStore.downloadOriginal(original)).text(),'original synthetic bytes');pass('Storage impide sobrescribir un original inmutable');
    const shared=checked(await a.rpc('studyhub_read_planned_snapshot',{}))[0];const sharedState=structuredClone(shared.state);
    saveDelivery(sharedState,'synthetic-cube',{requestId:'staging-delivery',title:'Entrega de staging',purpose:'both',itemIds:['piece'],competencyIds:[],files:[original]},owner.id,new Date().toISOString());sharedState.revision++;
    const response=await post(tokens[0],sharedState,shared.revision);assert.equal(response.status,200);pass('Entrega compartida y original validados por handler real');
    await a.storage.from('studyhub-task-files').remove([original.path]);assert.equal(await (await fileStore.downloadOriginal(original)).text(),'original synthetic bytes');pass('Original referenciado no se elimina desde Storage');
    assert.ok((await b.storage.from('studyhub-task-files').download(original.path)).error);pass('Original compartido permanece privado entre cuentas');
    const localArchive=planningFixture('local');localArchive.add('items',localArchive.item());localArchive.verify();
    const archive=structuredClone(localArchive.state.projectPlans[0]);
    const imported=structuredClone(localArchive.state);imported.projectPlans=[executePlan(null,{id:'explicit-origin-import',type:'import-history',projectId:'synthetic-cube',archive,sha256:await sha256(canonical(archive)),confirm:true},imported,users[1].id,new Date().toISOString())];
    assert.equal((await post(tokens[1],imported,null)).status,200);const importedRead=checked(await b.rpc('studyhub_read_planned_snapshot',{}))[0];assert.deepEqual(importedRead.state.projectPlans[0].events[0].command.archive,archive);assert.equal(importedRead.state.projectPlans[0].versions[0].metrics.advance,0);pass('Importación explícita conserva autores locales y exige reverificación');
    const corrupt=structuredClone(imported);corrupt.projectPlans[0].events[0].command.sha256='0'.repeat(64);corrupt.revision++;
    assert.notEqual((await post(tokens[1],corrupt,imported.revision)).status,200);pass('Hash de archivo de origen manipulado rechazado');
    if(config.cloud){
      const snapshot=checked(await a.rpc('studyhub_read_planned_snapshot',{}))[0];
      const state=structuredClone(snapshot.state);
      const apply=command=>{
        const old=state.projectPlans[0];
        state.projectPlans=[executePlan(old,{id:randomUUID(),expectedRevision:old.revision,...command},state,owner.id,f.at)];
        state.revision++;
      };
      apply({type:'adopt-catalog',confirm:true,reason:'Ensayo de conservación del catálogo'});
      assert.deepEqual(state.projectPlans[0].catalog.original.deliverables,legacy.deliverables);
      assert.equal((await post(tokens[0],await packPlanningState(state,snapshot.state.projectPlans),snapshot.revision)).status,200);
      pass('Adopción explícita del catálogo conserva los registros anteriores en cloud');
      for(let batch=0;batch<6;batch++){
        const before=structuredClone(state), ids=Array.from({length:50},(_,i)=>'load-'+(batch*50+i));
        const proposal={id:randomUUID(),title:'Escenario de software aislado',baseVersion:state.projectPlans[0].activeVersion,operations:ids.map(id=>f.op('items','add',id,f.item(id))),origin:'human',provider:'',model:'',questions:'',uncertainties:''};
        apply({type:'propose',proposal});apply({type:'approve',proposalId:proposal.id,selectedIds:proposal.operations.map(op=>op.id),reason:'Fixture de capacidad'});
        assert.equal((await post(tokens[0],await packPlanningState(state,before.projectPlans),before.revision)).status,200);
      }
      const restored=checked(await secondClient.rpc('studyhub_read_planned_snapshot',{}))[0];
      assert.equal(canonical(restored.state),canonical(state));
      pass('300 entregables adicionales por comandos CAS y rehidratación íntegra desde otro cliente');
      rehearseCloudRestore(owner.id);
      const afterRestore=checked(await a.rpc('studyhub_read_planned_snapshot',{}))[0];
      assert.deepEqual(afterRestore,restored);
      assert.equal(await sha256(await fileStore.downloadOriginal(original)),original.sha256);
      pass('Restauración SQL transaccional de snapshot, cabecera, eventos y versiones. Tras rollback el snapshot y el original privado conservan su integridad');
    }
    const sql=config.sqlRehearsal?verifyPlanningSql(owner.id):null;
    return {status:'passed',syntheticOnly:true,providerRequests:0,checks,sql};
  } catch(error){error.message+=` [after ${checks.length} checks: ${checks.at(-1)||"start"}; response ${lastResponse?.status}: ${lastResponse?.message||"none"}]`;error.checks=checks;throw error;
  } finally {
    // Synthetic account deletion releases its references before object cleanup.
    for(const user of users)checked(await admin.from('studyhub_states').delete().eq('user_id',user.id));
    if(originals.length)checked(await admin.storage.from('studyhub-task-files').remove(originals));
    if(privatePath)checked(await admin.storage.from('studyhub-task-files').remove([privatePath]));
    for(const user of users)checked(await admin.auth.admin.deleteUser(user.id));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {const cloud=process.argv.includes('--enrolled-cloud');const config=cloud?cloudStagingConfig(process.env):planningStagingConfig(process.env);if(cloud)config.edge=config.url+'/functions/v1/studyhub-plan';
    const result={at:new Date().toISOString(),environment:cloud?'isolated-cloud':'local',...await verifyPlanningStaging(config)};if(cloud)writeFileSync(new URL('../docs/planning/release-cloud.json',import.meta.url),JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result,null,2));}
  catch(error){console.error('Planificación staging NO aprobada: '+error.message);process.exitCode=1;}
}

// Deliberately run only the unused third slot after inspecting a failed first
// evaluation. This is not a retry of either review and cannot repeat the slot.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {cloudStagingConfig} from './cloud-staging.mjs';
import {validateFreePreflight} from './real-inference-plan.mjs';
import {StudyHubRepository} from '../src/data/repository.js';
import {MemoryAdapter} from '../src/data/localAdapter.js';
import {createEmptyState} from '../src/data/schema.js';
import {createStore} from '../src/state/store.js';

if(!process.argv.includes('--execute')) {
 console.log('No network: executes only the unused area-suggestion slot, after a partial evaluation. No review retries.');
} else {
 const config=cloudStagingConfig(process.env);
 validateFreePreflight(JSON.parse(readFileSync('.tmp/real-ai-preflight.json','utf8')));
 const ledger=JSON.parse(readFileSync('.tmp/real-ai-execution-ledger.json','utf8'));
 const first=JSON.parse(readFileSync('docs/studyhub2/cloud-real-inference-results.json','utf8'));
 assert.equal(first.run,ledger.run);assert.equal(first.requestsSent,1);assert.equal(first.evaluation.status,'partial');assert.equal(first.areas,undefined);
 const lock='.tmp/real-ai-areas-ledger.json';assert.equal(existsSync(lock),false,'Third slot already reserved; do not repeat');
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(config.url,config.service,options),client=createClient(config.url,config.anon,options);
 const report={at:new Date().toISOString(),projectRef:config.url,parentRun:ledger.run,maximumAdditionalInferences:1,inferenceRequests:0,checks:[],status:'pending'};
 let userId,uncertain=false;
 try {
  const email=`area-only-${randomUUID()}@example.test`,password=randomBytes(32).toString('hex');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);userId=created.data.user.id;
  const login=await client.auth.signInWithPassword({email,password});assert.equal(login.error,null);
  writeFileSync(lock,JSON.stringify({parentRun:ledger.run,userId,requestId:ledger.requests[1],reservedAt:new Date().toISOString()}),{flag:'wx'});
  uncertain=true;report.inferenceRequests=1;
  const response=await fetch(`${config.url}/functions/v1/studyhub-evaluate`,{method:'POST',headers:{apikey:config.anon,Authorization:`Bearer ${login.data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'suggest-areas',requestVersion:2,requestId:ledger.requests[1],context:'Proyecto ficticio para estudiar funciones JavaScript. Propón dos áreas con objetivos observables. No hay resultados reales del estudiante.'}),signal:AbortSignal.timeout(110000)});
  report.response=await response.json();uncertain=false;
  assert.equal(response.ok,true);assert.equal(report.response.status,'completed');assert.ok(report.response.areas.length>0);
  const repo=new StudyHubRepository({adapter:new MemoryAdapter(createEmptyState()),store:createStore(null)});await repo.initialize();
  const project=await repo.createProject({name:'Prueba de propuestas reales',projectType:'studies'});
  assert.equal(repo.getState().competencies.length,0);report.checks.push('no automatic acceptance');
  const original=report.response.areas[0];
  await repo.createCompetencies(project.id,[{...original,name:`Revisada: ${original.name}`.slice(0,100),objectives:original.objectives.join('\n'),original,source:{model:report.response.model,promptVersion:report.response.promptVersion,requestId:ledger.requests[1]}}],{deduplicate:true,provenance:{method:'mixed'}});
  const state=repo.getState();assert.equal(state.competencies.length,1);assert.equal(state.evaluations.length,0);assert.equal(state.exercises.length,0);
  assert.deepEqual(state.competencies[0].creationSource.original,original);
  assert.equal((await client.rpc('studyhub_save_snapshot',{p_state:state,p_expected_revision:null})).error,null);
  const reload=await client.from('studyhub_states').select('state').single();assert.equal(reload.error,null);assert.deepEqual(reload.data.state.competencies,state.competencies);
  report.checks.push('one explicitly selected and edited area through repository command','original proposal preserved','no fabricated exercise or grade','persisted and reloaded');
  report.status='passed';
 } catch(error) {report.status='failed';report.error=String(error.message).slice(0,300);process.exitCode=1;}
 finally {
  if(userId&&uncertain){report.cleanup='retained for durable request recovery';report.recoveryUserId=userId;}
  else if(userId){const removed=await admin.auth.admin.deleteUser(userId);report.cleanup=removed.error?'failed':'synthetic account and dependent rows removed';if(removed.error)process.exitCode=1;}
  writeFileSync('docs/studyhub2/cloud-real-area-results.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,inferenceRequests:report.inferenceRequests,checks:report.checks,error:report.error,cleanup:report.cleanup},null,2));
 }
}

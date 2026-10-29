import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {cloudStagingConfig,CLOUD_STAGING_REF} from './cloud-staging.mjs';
import {REAL_MODELS,REAL_PLAN,validateFreePreflight} from './real-inference-plan.mjs';
import {StudyHubRepository} from '../src/data/repository.js';
import {MemoryAdapter} from '../src/data/localAdapter.js';
import {createEmptyState} from '../src/data/schema.js';
import {createStore} from '../src/state/store.js';
import {beginAttempt,saveAttemptResponse} from '../src/evaluation/attempts.js';

if(!process.argv.includes('--execute')) {
 console.log(JSON.stringify({mode:'dry-run',networkCalls:0,plan:REAL_PLAN,models:REAL_MODELS,requires:'Fresh .tmp/real-ai-preflight.json and explicit --execute. Never delete a used ledger to retry.'},null,2));
} else {
 const config=cloudStagingConfig(process.env);
 validateFreePreflight(JSON.parse(readFileSync('.tmp/real-ai-preflight.json','utf8')));
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(config.url,config.service,options),client=createClient(config.url,config.anon,options);
 const run=randomUUID(),email=`real-ai-${run}@example.test`,password=randomBytes(32).toString('hex');
 let userId,uncertainRequest=false;
 const report={at:new Date().toISOString(),projectRef:CLOUD_STAGING_REF,plan:REAL_PLAN,run,inferenceSlotsReserved:0,status:'preflight',checks:[]};
 const ledger='.tmp/real-ai-execution-ledger.json';
 try {
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.equal(created.error,null);userId=created.data.user.id;
  assert.equal((await client.auth.signInWithPassword({email,password})).error,null);
  const token=(await client.auth.getSession()).data.session.access_token;
  const call=async(body)=>{
   const inference=body.action!=='check';
   if(inference){uncertainRequest=true;report.requestsSent=(report.requestsSent||0)+1;}
   const r=await fetch(`${config.url}/functions/v1/studyhub-evaluate`,{method:'POST',headers:{apikey:config.anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(110000)});
   const data=await r.json();if(inference)uncertainRequest=false;if(!r.ok)throw Error(`Handler HTTP ${r.status}; no automatic retry`);return data;
  };
  const probe=await call({action:'check',provider:'both'});
  for(const name of ['gemini','cloudflare'])assert.ok(probe.providers[name].configured&&probe.providers[name].connection==='success'&&probe.providers[name].model===REAL_MODELS[name],`${name} not available with approved model`);
  // Exclusive persistent lock BEFORE any inference. A crash or timeout keeps it.
  mkdirSync('.tmp',{recursive:true});writeFileSync(ledger,JSON.stringify({run,userId,reserved:3,requests:[`real:${run}:evaluate`,`real:${run}:areas`]}),{flag:'wx'});
  report.inferenceSlotsReserved=3;
  const repo=new StudyHubRepository({adapter:new MemoryAdapter(createEmptyState()),store:createStore(null)});await repo.initialize();
  const project=await repo.createProject({name:'Ensayo sintético de IA',projectType:'studies'});
  const area=await repo.createCompetency(project.id,{name:'Suma de números'});
  const exercise=await repo.createExercise(project.id,{title:'Sumar dos números',code:'export function sumar(a, b) { return a + b; }',expectedResult:'sumar(2,3)=5; sumar(-2,3)=1; sumar(0,0)=0',actualResult:'Resultados declarados por la fixture; no representan aprendizaje humano.',competencyIds:[area.id],difficulty:1,helpLevel:'none',independenceDeclared:false});
  const attempt=await beginAttempt(repo,exercise.id,'both');
  const body={action:'evaluate',requestVersion:2,requestId:`real:${run}:evaluate`,provider:'both',profile:'fast',privacy:'standard',exercise:attempt.evidenceSnapshot,rubric:attempt.rubric,models:REAL_MODELS};
  const response=await call(body);report.evaluation=response;
  // Preserve partial failures and stop. No retries and no model fallback.
  await saveAttemptResponse(repo,attempt.id,response);
  assert.equal(response.status,'completed');assert.equal(response.results?.length,2);assert.equal(response.errors?.length,0);
  await saveAttemptResponse(repo,attempt.id,response); // local replay, not another inference
  let state=repo.getState();assert.equal(state.exercises.length,1);assert.equal(state.evaluations.length,1);assert.equal(state.evaluations[0].reviews.length,2);assert.equal(state.evaluations[0].canonicalResult,null);
  report.checks.push('one attempt with two original reviews','local replay does not duplicate reviews','no canonical average');
  const saved=await client.rpc('studyhub_save_snapshot',{p_state:state,p_expected_revision:null});assert.equal(saved.error,null);
  const reload=await client.from('studyhub_states').select('state').single();assert.equal(reload.error,null);assert.deepEqual(reload.data.state.evaluations,state.evaluations);report.checks.push('attempt persisted and reloaded from staging');
  // Read the durable response through the database, not another provider request.
  const cached=await admin.from('studyhub_evaluation_requests').select('response').eq('user_id',userId).eq('request_id',body.requestId).single();assert.equal(cached.error,null);assert.deepEqual(cached.data.response,response);report.checks.push('durable response equals original');
  report.areas=await call({action:'suggest-areas',requestVersion:2,requestId:`real:${run}:areas`,context:'Proyecto ficticio para estudiar funciones JavaScript. Propón dos áreas con objetivos observables. No hay resultados reales del estudiante.'});
  assert.equal(report.areas.status,'completed');assert.ok(report.areas.areas.length>0);assert.equal(repo.getState().competencies.length,1);report.checks.push('area suggestions received without automatic acceptance');report.status='passed';
 } catch(error) {
  report.status='blocked-or-failed';report.error=String(error.message).slice(0,300);process.exitCode=1;
 } finally {
  if(userId&&uncertainRequest){report.cleanup='synthetic account retained: inspect durable request before cleanup or retry';report.recoveryUserId=userId;}
  else if(userId){const removed=await admin.auth.admin.deleteUser(userId);report.cleanup=removed.error?'failed':'synthetic account and dependent rows removed';if(removed.error)process.exitCode=1;}
  writeFileSync('docs/studyhub2/cloud-real-inference-results.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,inferenceSlotsReserved:report.inferenceSlotsReserved,checks:report.checks,error:report.error,cleanup:report.cleanup},null,2));
 }
}

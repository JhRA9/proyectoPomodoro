import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { cloudStagingConfig, CLOUD_STAGING_REF } from './cloud-staging.mjs';

// No synthetic network transport. Invalid requests cannot reach inference.
// No valid inference request is sent, even if keys change during the test.
const config=cloudStagingConfig(process.env);
const options={auth:{persistSession:false,autoRefreshToken:false}};
const admin=createClient(config.url,config.service,options);
const client=createClient(config.url,config.anon,options);
const email=`handler-${randomUUID()}@example.test`, password=randomBytes(32).toString('hex');
let userId;
const checks=[];
try {
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert.equal(created.error,null);userId=created.data.user.id;
 const login=await client.auth.signInWithPassword({email,password});assert.equal(login.error,null);
 const token=login.data.session.access_token;
 const call=async(body,authorization=`Bearer ${token}`,method='POST')=>{
  const response=await fetch(`${config.url}/functions/v1/studyhub-evaluate`,{method,headers:{apikey:config.anon,...(authorization?{Authorization:authorization}:{}),'Content-Type':'application/json'},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  return {status:response.status,body:await response.json()};
 };
 const test=async(name,body,expected,auth,method)=>{assert.equal((await call(body,auth,method)).status,expected,name);checks.push(name);};
 await test('missing authentication',{action:'check'},401,null);
 await test('forged JWT',{action:'check'},403,'Bearer invalid');
 await test('unsupported method',{},405,undefined,'GET');
 await test('invalid JSON','{',400);
 await test('unknown action',{action:'unknown'},400);
 await test('invalid provider',{provider:'invalid'},400);
 await test('empty rubric',{exercise:{title:'synthetic'},rubric:{criteria:[]}},400);
 await test('oversized input',{extra:'x'.repeat(262144)},413);
 await test('areas without context',{action:'suggest-areas',requestVersion:2,context:''},400);
 await test('private code blocked',{exercise:{code:'function sum(a,b){return a+b}'},rubric:{criteria:[{id:'correctness'}]},privacy:'private'},403);
 const status=await call({action:'check',provider:'both'});
 assert.equal(status.status,200);checks.push('authenticated configuration check');
 const configured=Object.values(status.body.providers).some(p=>p.configured);
 if(!configured) {
  assert.ok(Object.values(status.body.providers).every(p=>p.connection==='not_configured'));
  checks.push('explicit missing-provider state');
  // Deliberately do NOT send a valid inference: a concurrent secret update
  // could configure a provider after this check. No TOCTOU cost exposure.
 }
 const report={at:new Date().toISOString(),projectRef:CLOUD_STAGING_REF,transport:'real deployed handler; no fetch replacement',checks,passed:checks.length,inferenceRequests:0,providerConfiguration:status.body.providers,cleanup:'pending'};
 assert.equal((await admin.auth.admin.deleteUser(userId)).error,null);userId=null;report.cleanup='only this synthetic account removed';
 writeFileSync(new URL('../docs/studyhub2/cloud-real-handler-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
} finally {if(userId) {const r=await admin.auth.admin.deleteUser(userId);if(r.error)throw Error('Synthetic account cleanup failed');}}

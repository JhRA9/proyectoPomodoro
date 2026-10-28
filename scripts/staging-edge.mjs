import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export async function verifyEdge({config,client,admin,userId,run}) {
  const token = (await client.auth.getSession()).data.session.access_token;
  const url = `${config.url}/functions/v1/studyhub-evaluate`;
  const call = async (body, signal) => {
    const response = await fetch(url,{method:"POST",headers:{apikey:config.anon,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body),signal});
    return {status:response.status,body:await response.json()};
  };
  const payload = {action:"evaluate",requestVersion:2,requestId:`staging:edge:${run}`,provider:"both",privacy:"standard",exercise:{title:"Synthetic integration fixture"},rubric:{criteria:[]}};
  // Seed a response through the real durable contract, then recover via the actual deployed handler.
  const {requestId,...content}=payload;
  const hash=createHash("sha256").update(JSON.stringify(content)).digest("hex");
  const fixture={status:"completed",results:[{provider:"gemini",model:"synthetic-only"},{provider:"cloudflare",model:"synthetic-only"}]};
  const saved=await admin.from("studyhub_evaluation_requests").insert({user_id:userId,request_id:requestId,payload_hash:hash,state:"completed",response:fixture});
  assert.equal(saved.error,null);
  assert.deepEqual((await call(payload)).body,fixture,"Edge returns the real cached record");
  const denied=await fetch(url,{method:"POST",headers:{apikey:config.anon,"Content-Type":"application/json"},body:JSON.stringify(payload)});
  assert.ok([401,403].includes(denied.status),"Edge rejects unauthenticated calls");
  const configuration=(await call({action:"check",provider:"both"})).body;
  if (!configuration.providers?.gemini?.configured) {
    assert.equal(configuration.providers?.cloudflare?.configured,false);
    const unconfigured=(await call({...payload,requestId:`${requestId}:unconfigured`})).body;
    assert.equal(unconfigured.results.length,0);
    assert.ok(unconfigured.errors.every(e=>e.code==="not_configured"));
    return ["edge-JWT", "edge-real-auth-cache", "edge-no-provider-configuration"];
  }
  assert.equal(configuration.providers.gemini.model,"synthetic-gemini","Never permit real providers in this test");
  const concurrent={...payload,requestId:`${requestId}:concurrent`,exercise:{title:"STAGING_SLOW"}};
  const results=await Promise.all([call(concurrent),call(concurrent)]);
  assert.ok(results.some(r=>r.body.results?.length===2));
  assert.ok(results.every(r=>r.body.results?.length===2 || r.body.message?.includes("procesándose")));
  const final=(await call(concurrent)).body;
  assert.deepEqual(final.results.map(r=>r.provider),["gemini","cloudflare"]);
  assert.ok(final.results.every(r=>r.model.startsWith("synthetic-")));
  const stored=await admin.from("studyhub_evaluation_requests").select("response").eq("user_id",userId).eq("request_id",concurrent.requestId).single();
  assert.deepEqual(stored.data.response,final);
  const partial=(await call({...payload,requestId:`${requestId}:partial`,exercise:{title:"STAGING_PARTIAL"}})).body;
  assert.equal(partial.status,"partial");assert.equal(partial.results.length,1);assert.equal(partial.errors[0].code,"quota_exhausted");
  const cancellation=new AbortController();
  const delayed={...payload,requestId:`${requestId}:cancel`,exercise:{title:"STAGING_SLOW"}};
  const waiting=call(delayed,cancellation.signal);
  await new Promise(resolve=>setTimeout(resolve,300));cancellation.abort();
  await assert.rejects(waiting, error=>error.name==="AbortError");
  let recovered;
  for(let n=0;n<20;n++) {
    await new Promise(resolve=>setTimeout(resolve,200));
    const row=await admin.from("studyhub_evaluation_requests").select("state").eq("user_id",userId).eq("request_id",delayed.requestId).maybeSingle();
    if(row.data?.state==="completed") {recovered=(await call(delayed)).body;break;}
  }
  assert.equal(recovered?.results?.length,2,"Cancelled wait recovers late result without another attempt");
  const area=(await call({action:"suggest-areas",requestVersion:2,requestId:`${requestId}:areas`,context:"Synthetic studyhub CSS learning objectives"})).body;
  assert.equal(area.status,"completed");assert.equal(area.areas.length,1);
  return ["edge-JWT","edge-real-auth-cache","edge-two-reviews","edge-concurrent-idempotency","edge-partial-failure","edge-cancel-late-recovery","edge-synthetic-areas"];
}

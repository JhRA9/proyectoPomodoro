import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
const store=vi.hoisted(()=>({claim:vi.fn(),finish:vi.fn(),authenticate:vi.fn()}));
vi.mock("../supabase/functions/studyhub-evaluate/requestStore.ts",()=>({claimEvaluation:store.claim,authenticateRequest:store.authenticate}));
let handler, transport;
beforeEach(async()=>{
  vi.resetModules();store.claim.mockReset();store.finish.mockReset();store.claim.mockResolvedValue({cached:null,finish:store.finish});
  store.authenticate.mockReset();store.authenticate.mockResolvedValue({user:{id:"synthetic"}});
  vi.stubGlobal("Deno",{env:{get:()=>"synthetic-test-only"},serve:fn=>{handler=fn;}});
  transport=vi.fn();vi.stubGlobal("fetch",transport);
  await import("../supabase/functions/studyhub-evaluate/index.ts");
});
afterEach(()=>vi.unstubAllGlobals());
const payload={action:"evaluate",requestVersion:2,requestId:"test:both",provider:"both",privacy:"standard",exercise:{title:"Synthetic",code:"return 1"},rubric:{criteria:[{id:"correctness"}]}};
const send=body=>handler(new Request("http://localhost/test",{method:"POST",headers:{Authorization:"Bearer synthetic","Content-Type":"application/json"},body:JSON.stringify(body)}));
const review={summary:"Synthetic response",provisionalLevel:null,scores:[{criterionId:"correctness",score:2,justification:"Synthetic fixture"}],recommendations:[],strengths:[],weaknesses:[],demonstratedCompetencyIds:[],notDemonstratedCompetencyIds:[]};
describe("edge handler integration with simulated provider network",()=>{
  it('preserves a non-JSON HTTP failure and never exposes the raw body',async()=>{
    transport.mockResolvedValue(new Response('<html>PRIVATE upstream diagnostic</html>',{status:503}));
    const result=await(await send(payload)).json();
    for(const error of result.errors)expect(error).toMatchObject({code:'provider_busy',providerHttpStatus:503});
    expect(JSON.stringify(result)).not.toContain('PRIVATE');expect(transport).toHaveBeenCalledTimes(2);
  });
  it('distinguishes a provider contract error from a quota error',async()=>{
    transport.mockResolvedValue(Response.json({error:{message:'Untrusted request details'}},{status:400}));
    const result=await(await send({...payload,provider:'gemini'})).json();
    expect(result.errors[0]).toMatchObject({code:'provider_contract_error',providerHttpStatus:400});
    expect(JSON.stringify(result)).not.toContain('Untrusted request details');
  });
  it('rejects truncated area proposals even if the partial text parses',async()=>{
    transport.mockResolvedValue(Response.json({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:JSON.stringify({areas:[{name:'Functions',description:'Synthetic',objectives:[]}]})}]}}],usageMetadata:{candidatesTokenCount:2500}}));
    const result=await(await send({action:'suggest-areas',requestVersion:2,requestId:'area:truncated',context:'Synthetic'})).json();
    expect(result).toMatchObject({status:'error',code:'response_truncated',diagnostics:{finishReason:'MAX_TOKENS',outputTokens:2500}});expect(result.areas).toBeUndefined();
  });
  it('parses only final Gemini text, not thought parts',async()=>{
    transport.mockResolvedValue(Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'Private thought'},{text:JSON.stringify(review)}]}}]}));
    const result=await(await send({...payload,provider:'gemini'})).json();expect(result.status).toBe('completed');expect(result.results[0].summary).toBe(review.summary);expect(JSON.stringify(result)).not.toContain('Private thought');
  });
  it('does not report model access for an empty successful catalog response',async()=>{
    transport.mockResolvedValue(Response.json({success:true,result:[]}));
    const result=await(await send({action:'check',provider:'cloudflare'})).json();expect(result.providers.cloudflare.connection).toBe('model_unavailable');
  });
  it('omits the deprecated temperature on the configured Gemini 3.8 model',async()=>{
    transport.mockResolvedValue(Response.json({candidates:[{content:{parts:[{text:JSON.stringify(review)}]}}]}));
    await send({...payload,provider:'gemini',models:{gemini:'gemini-3.8-flash'}});
    const body=JSON.parse(transport.mock.calls[0][1].body);expect(body.generationConfig).not.toHaveProperty('temperature');expect(body.generationConfig.maxOutputTokens).toBe(3500);
  });
  it("does not let legacy payloads bypass the account quota",async()=>{
    store.claim.mockRejectedValue(Object.assign(new Error("Quota exhausted"),{code:"quota_exhausted"}));
    expect((await send({...payload,requestVersion:1,requestId:undefined})).status).toBe(429);
    expect(store.claim.mock.calls[0][1].requestId).toMatch(/^legacy:/);
    expect(transport).not.toHaveBeenCalled();
  });
  it("authenticates check and legacy calls before contacting any provider",async()=>{
    store.authenticate.mockRejectedValue(Object.assign(new Error("Invalid session"),{code:"permission_error"}));
    expect((await send({action:"check"})).status).toBe(403);
    expect((await send({...payload,requestVersion:1})).status).toBe(403);
    expect(transport).not.toHaveBeenCalled();expect(store.claim).not.toHaveBeenCalled();
  });
  it("rejects malformed, oversized and unknown requests before reserving or calling providers",async()=>{
    for(const body of [null,[],{...payload,action:"unknown"},{...payload,provider:"unknown"},{...payload,rubric:null},{...payload,rubric:{criteria:[]}}]) expect((await send(body)).status).toBe(400);
    expect((await send({...payload,exercise:{code:"x".repeat(61000)}})).status).toBe(413);
    expect((await send({...payload,extra:"x".repeat(262144)})).status).toBe(413);
    const malformed=new Request("http://localhost/test",{method:"POST",headers:{Authorization:"Bearer synthetic"},body:"{"});
    expect((await handler(malformed)).status).toBe(400);
    expect(transport).not.toHaveBeenCalled();expect(store.claim).not.toHaveBeenCalled();
  });
  it("stores a provider validation failure without treating invalid scores as success",async()=>{
    transport.mockResolvedValue(new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({...review,scores:[{criterionId:"correctness",score:99,justification:"Invalid"}]})}]}}]})));
    const result=await(await send({...payload,provider:"gemini",rubric:{criteria:[{id:"correctness"}]}})).json();
    expect(result.results).toHaveLength(0);expect(result.errors[0].code).toBe("invalid_response");expect(store.finish).toHaveBeenCalledTimes(1);
  });
  it("starts both transports concurrently, preserves separate results and stores once",async()=>{
    const pending=[];transport.mockImplementation(url=>new Promise(resolve=>pending.push({url,resolve})));
    const call=send(payload);await vi.waitFor(()=>expect(transport).toHaveBeenCalledTimes(2));
    for(const {url,resolve} of pending)resolve(new Response(JSON.stringify(url.includes("googleapis")?{modelVersion:"gemini-fixture",candidates:[{content:{parts:[{text:JSON.stringify(review)}]}}]}:{choices:[{message:{content:JSON.stringify(review)}}]})));
    const result=await(await call).json();expect(result.status).toBe("completed");expect(result.results.map(r=>r.provider)).toEqual(["gemini","cloudflare"]);expect(store.finish).toHaveBeenCalledTimes(1);
  });
  it("returns a partial result when one provider has no quota",async()=>{
    transport.mockImplementation(async url=>url.includes("googleapis")?new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(review)}]}}]})):new Response(JSON.stringify({error:{message:"Synthetic quota"}}),{status:429}));
    const result=await(await send(payload)).json();expect(result).toMatchObject({status:"partial",errors:[{provider:"cloudflare",code:"quota_exhausted"}]});expect(result.results).toHaveLength(1);expect(store.finish).toHaveBeenCalledTimes(1);
  });
  it("recovers a cached suggestion without another provider call",async()=>{
    const cached={status:"completed",areas:[{name:"CSS",description:"",objectives:[]}]};store.claim.mockResolvedValue({cached});
    expect(await(await send({action:"suggest-areas",requestVersion:2,requestId:"area:test",context:"CSS",history:[100],email:"private"})).json()).toEqual(cached);
    expect(transport).not.toHaveBeenCalled();expect(store.claim.mock.calls[0][1]).not.toHaveProperty("history");expect(store.claim.mock.calls[0][1]).not.toHaveProperty("email");
  });
  it("records truncation and usage without accepting or repairing incomplete output",async()=>{
    transport.mockResolvedValue(Response.json({choices:[{finish_reason:"length",message:{content:'{"summary":"unfinished private content'}}],usage:{prompt_tokens:123,completion_tokens:1800,completion_tokens_details:{reasoning_tokens:900}}}));
    const result=await(await send({...payload,provider:"cloudflare"})).json();
    expect(result.results).toEqual([]);expect(result.errors[0]).toMatchObject({code:"response_truncated",diagnostics:{finishReason:"length",inputTokens:123,outputTokens:1800,reasoningTokens:900}});
    expect(JSON.stringify(result)).not.toContain('unfinished private content');expect(transport).toHaveBeenCalledTimes(1);
  });
  it("keeps malformed JSON distinct from truncation and does not retry a busy provider",async()=>{
    transport.mockImplementation(async url=>url.includes('googleapis')?Response.json({error:{message:'High demand'}},{status:503}):Response.json({choices:[{finish_reason:'stop',message:{content:'not json'}}],usage:{completion_tokens:10}}));
    const result=await(await send(payload)).json();
    expect(result.errors).toMatchObject([{provider:'gemini',code:'provider_busy'},{provider:'cloudflare',code:'invalid_response',diagnostics:{finishReason:'stop',outputTokens:10}}]);
    expect(result.results).toEqual([]);expect(transport).toHaveBeenCalledTimes(2);
  });
  it("rejects a blocked provider response even if the text is valid JSON",async()=>{
    transport.mockResolvedValue(Response.json({candidates:[{finishReason:'SAFETY',content:{parts:[{text:JSON.stringify(review)}]}}]}));
    const result=await(await send({...payload,provider:'gemini'})).json();expect(result.results).toEqual([]);expect(result.errors[0].code).toBe('response_blocked');
  });
  it("distinguishes area-service overload from quota without leaking provider body or retrying",async()=>{
    transport.mockResolvedValue(Response.json({error:{message:'private provider body'}},{status:503}));
    const result=await(await send({action:'suggest-areas',requestVersion:2,requestId:'area:busy',context:'Synthetic study context'})).json();
    expect(result).toMatchObject({status:'error',code:'provider_busy',providerHttpStatus:503});expect(result.message).toContain('manualmente');
    expect(JSON.stringify(result)).not.toContain('private provider body');expect(transport).toHaveBeenCalledTimes(1);expect(store.finish).toHaveBeenCalledTimes(1);
  });
  it("does not send private code or unauthenticated requests",async()=>{
    expect((await send({...payload,privacy:"private"})).status).toBe(403);
    expect((await handler(new Request("http://localhost/test",{method:"POST",body:JSON.stringify(payload)}))).status).toBe(401);
    expect(transport).not.toHaveBeenCalled();expect(store.claim).not.toHaveBeenCalled();
  });
  it("refuses inference when the durable request store is unavailable",async()=>{
    store.claim.mockRejectedValue(Object.assign(new Error("Store unavailable"),{code:"not_configured"}));
    expect((await send(payload)).status).toBe(503);expect(transport).not.toHaveBeenCalled();
  });
});

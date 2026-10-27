import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
const store=vi.hoisted(()=>({claim:vi.fn(),finish:vi.fn()}));
vi.mock("../supabase/functions/studyhub-evaluate/requestStore.ts",()=>({claimEvaluation:store.claim}));
let handler, transport;
beforeEach(async()=>{
  vi.resetModules();store.claim.mockReset();store.finish.mockReset();store.claim.mockResolvedValue({cached:null,finish:store.finish});
  vi.stubGlobal("Deno",{env:{get:()=>"synthetic-test-only"},serve:fn=>{handler=fn;}});
  transport=vi.fn();vi.stubGlobal("fetch",transport);
  await import("../supabase/functions/studyhub-evaluate/index.ts");
});
afterEach(()=>vi.unstubAllGlobals());
const payload={action:"evaluate",requestVersion:2,requestId:"test:both",provider:"both",privacy:"standard",exercise:{title:"Synthetic",code:"return 1"},rubric:{criteria:[]}};
const send=body=>handler(new Request("http://localhost/test",{method:"POST",headers:{Authorization:"Bearer synthetic","Content-Type":"application/json"},body:JSON.stringify(body)}));
const review={summary:"Synthetic response",scores:[],recommendations:[]};
describe("edge handler integration with simulated provider network",()=>{
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

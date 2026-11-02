import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {planningFixture} from './helpers/planningFixture.js';
import {SupabaseStateGateway} from '../src/data/cloudAdapter.js';
const auth=vi.hoisted(()=>vi.fn());
vi.mock('../supabase/functions/studyhub-evaluate/requestStore.ts',()=>({authenticateRequest:auth}));
let handler,network;
beforeEach(async()=>{vi.resetModules();auth.mockReset();auth.mockResolvedValue({url:'https://synthetic.example.test',key:'fixture-only',user:{id:'synthetic-owner'}});vi.stubGlobal('Deno',{serve:fn=>handler=fn});network=vi.fn();vi.stubGlobal('fetch',network);await import('../supabase/functions/studyhub-plan/index.ts');});
afterEach(()=>vi.unstubAllGlobals());
const send=body=>handler(new Request('http://localhost/test',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify(body)}));
describe('planning authenticated server contract',()=>{
  it('rejects missing and forged authentication before reading or writing data',async()=>{
    expect((await handler(new Request('http://localhost/test',{method:'POST',body:'{}'}))).status).toBe(401);
    auth.mockRejectedValue(Object.assign(new Error('Sesión inválida'),{code:'permission_error'}));expect((await send({})).status).toBe(403);expect(network).not.toHaveBeenCalled();
  });
  it('replays real commands and writes only the authenticated owner through CAS',async()=>{
    const f=planningFixture();network.mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json([{state:f.state,revision:f.state.revision}]));
    const response=await send({state:f.state,expectedRevision:null});expect(response.status).toBe(200);
    expect(network.mock.calls[0][0]).toContain('user_id=eq.synthetic-owner');const write=JSON.parse(network.mock.calls[1][1].body);expect(write.p_owner).toBe('synthetic-owner');expect(write.p_expected_revision).toBeNull();expect(network.mock.calls[1][0]).toContain('/rpc/studyhub_save_planned_snapshot');
  });
  it('does not accept caller-controlled ownership',async()=>{expect((await send({owner:'victim',state:planningFixture().state,expectedRevision:null})).status).toBe(400);expect(network).not.toHaveBeenCalled();});
  it('rejects forged planning fields without sending a write',async()=>{
    const f=planningFixture();f.state.projectPlans[0].versions[0].content.brief.objective='Forged after event';network.mockResolvedValue(Response.json([]));expect((await send({state:f.state,expectedRevision:null})).status).toBe(400);expect(network).toHaveBeenCalledTimes(1);
  });
  it('protects against a read/write race and reports the conflict',async()=>{
    const f=planningFixture();const before=structuredClone(f.state);f.add('items',f.item());network.mockResolvedValueOnce(Response.json([{state:before,revision:before.revision}])).mockResolvedValueOnce(Response.json([]));
    const response=await send({state:f.state,expectedRevision:before.revision});expect(response.status).toBe(409);expect((await response.json()).code).toBe('STUDYHUB_CONFLICT');
  });
  it('recovers a lost acknowledgement without rewriting or duplicating events',async()=>{
    const f=planningFixture();// Reordered keys must not turn a lost acknowledgement into a duplicate write.
    const remote=Object.fromEntries(Object.entries(f.state).reverse());network.mockResolvedValueOnce(Response.json([{state:remote,revision:f.state.revision}]));
    const response=await send({state:f.state,expectedRevision:null});expect(response.status).toBe(200);expect(network).toHaveBeenCalledTimes(1);
  });
  it('rejects approval of a stale or missing private attachment',async()=>{
    const f=planningFixture();f.add('items',f.item());f.add('evidence',f.evidence('proof','piece',{file:{taskId:'synthetic-task',path:'synthetic-owner/synthetic-task/'+ 'a'.repeat(64),version:'old-version'}}));f.apply({type:'evidence-review',evidenceId:'proof',status:'approved',reason:'Fixture'});
    network.mockResolvedValueOnce(Response.json([])).mockResolvedValueOnce(Response.json({last_modified:'new-version'}));expect((await send({state:f.state,expectedRevision:null})).status).toBe(422);expect(network).toHaveBeenCalledTimes(2);
  });
  it('keeps the planning transport disabled until explicitly prepared',async()=>{
    const f=planningFixture(),client={functions:{invoke:vi.fn()},from:vi.fn()};const gateway=new SupabaseStateGateway({client,userId:'synthetic-owner'});
    await expect(gateway.save(f.state,{expectedRevision:null})).rejects.toThrow(/habilitar/);expect(client.functions.invoke).not.toHaveBeenCalled();expect(client.from).not.toHaveBeenCalled();
  });
  it('routes planning writes through the validated endpoint and preserves conflicts',async()=>{
    const f=planningFixture(),client={functions:{invoke:vi.fn(async()=>({data:{data:{state:f.state,revision:f.state.revision}},error:null}))},from:vi.fn()};const gateway=new SupabaseStateGateway({client,userId:'synthetic-owner',planningReady:true});
    expect((await gateway.save(f.state,{expectedRevision:null})).data.projectPlans).toEqual(f.state.projectPlans);expect(client.from).not.toHaveBeenCalled();
    f.add('items',f.item());client.functions.invoke.mockResolvedValue({data:null,error:{context:{status:409,json:async()=>({code:'STUDYHUB_CONFLICT'})}}});await expect(gateway.save(f.state,{expectedRevision:1})).rejects.toMatchObject({code:'STUDYHUB_CONFLICT'});
  });
  it('validates task and project writes even when plan JSON is unchanged',async()=>{
    const f=planningFixture(),client={functions:{invoke:vi.fn(async()=>({data:{data:{state:f.state,revision:f.state.revision}},error:null}))},from:vi.fn()};
    const gateway=new SupabaseStateGateway({client,userId:f.actor,planningReady:true});gateway.savedPlans=structuredClone(f.state.projectPlans);
    f.state.tasks[0].title='Edición normal';f.state.revision++;
    await gateway.save(f.state,{expectedRevision:f.state.revision-1});
    expect(client.functions.invoke).toHaveBeenCalledOnce();expect(client.from).not.toHaveBeenCalled();
  });
});

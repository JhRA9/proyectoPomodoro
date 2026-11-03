import {describe,it,expect,vi} from 'vitest';
import {planningFixture} from './helpers/planningFixture.js';
import {PlanningConversation} from '../src/planning/conversation.js';
import {PlanningProvider} from '../src/planning/provider.js';
import {StudyHubRepository} from '../src/data/repository.js';
import {MemoryAdapter} from '../src/data/localAdapter.js';
import {createStore} from '../src/state/store.js';
import {currentContent} from '../src/planning/engine.js';

async function setup(transport){const f=planningFixture('local');const repo=new StudyHubRepository({adapter:new MemoryAdapter(f.state),store:createStore(null)});await repo.initialize();const states=[];const chat=new PlanningConversation(repo,{provider:new PlanningProvider({enabled:!!transport,transport}),onState:s=>states.push(s.phase)});const proposal={id:'proposal-response',title:'Propuesta sintética',baseVersion:1,origin:'ai',provider:'synthetic',model:'fixture',questions:'',uncertainties:'',operations:[f.op('items','add','piece',f.item())]};return {f,repo,chat,states,proposal};}
const request={id:'message',text:'Proponer una actividad',sourceIds:[],consent:true};
describe('conversation proposal lifecycle without real providers',()=>{
  it('does not send or simulate waiting when disabled',async()=>{const {chat,states,repo}=await setup();await expect(chat.request('synthetic-cube',request)).rejects.toThrow(/desactivada/);expect(states).toEqual([]);expect(repo.getState().projectPlans[0].conversations).toBeUndefined();});
  it('stores a proposal once and never approves automatically',async()=>{let proposal;const transport=vi.fn(async()=>proposal);const f=await setup(transport);proposal=f.proposal;
    await f.chat.request('synthetic-cube',request);await f.chat.request('synthetic-cube',request);
    expect(transport).toHaveBeenCalledTimes(1);const plan=f.repo.getState().projectPlans[0];expect(plan.proposals).toHaveLength(1);expect(plan.proposals[0].status).toBe('pending');expect(currentContent(plan).items).toEqual([]);
    expect(f.states).toEqual(['sending','waiting','received','processing','ready']);
    await expect(f.chat.request('synthetic-cube',{...request,text:'Otro mensaje'})).rejects.toThrow(/identificador/);
  });
  it('rejects concurrent requests and late cancelled results, then retries the same message',async()=>{
    let release;const transport=vi.fn(()=>new Promise(r=>release=r));const f=await setup(transport);const pending=f.chat.request('synthetic-cube',request);
    await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    await expect(f.chat.request('synthetic-cube',{...request,id:'other'})).rejects.toThrow(/en curso/);
    f.chat.cancel();release(f.proposal);await expect(pending).rejects.toThrow(/cancelada/);
    expect(f.repo.getState().projectPlans[0].proposals).toEqual([]);expect(f.states.at(-1)).toBe('cancelled');
    transport.mockResolvedValue(f.proposal);await f.chat.request('synthetic-cube',request);expect(f.repo.getState().projectPlans[0].conversations).toHaveLength(1);
  });
  it('preserves a failed message and refuses output based on an obsolete version',async()=>{
    let release;const f=await setup(()=>new Promise(r=>release=r));const pending=f.chat.request('synthetic-cube',request);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    const plan=f.repo.getState().projectPlans[0];await f.repo.planCommand('synthetic-cube',{id:'change',expectedRevision:plan.revision,type:'restore',version:1,reason:'Cambio durante espera',confirm:true});
    release(f.proposal);await expect(pending).rejects.toThrow(/versión cambió/);expect(f.repo.getState().projectPlans[0].conversations).toHaveLength(1);expect(f.repo.getState().projectPlans[0].proposals).toEqual([]);
  });
});

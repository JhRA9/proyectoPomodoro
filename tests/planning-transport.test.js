import {describe,it,expect} from 'vitest';
import {planningFixture} from './helpers/planningFixture.js';
import {packPlanningState,unpackPlanningState} from '../src/planning/transport.js';
import {validatePlanningTransition} from '../src/planning/engine.js';

describe('versioned command transport',()=>{
  it('sends only appended commands and recovers a lost acknowledgement',async()=>{
    const f=planningFixture();f.add('items',f.item());f.apply({type:'upgrade-history',confirm:true,reason:'Transport fixture'});
    const before=structuredClone(f.state);f.apply({type:'status',itemId:'piece',status:'in_progress',reason:'Working'});
    const packed=await packPlanningState(f.state,before.projectPlans);
    expect(packed.projectPlans[0].events).toHaveLength(1);expect(packed.projectPlans[0].versions).toBeUndefined();
    const result=await unpackPlanningState(packed,before,f.actor);
    expect(result).toEqual(f.state);expect(()=>validatePlanningTransition(before,result,f.actor)).not.toThrow();
    expect(await unpackPlanningState(packed,result,f.actor)).toEqual(result);
    await expect(unpackPlanningState(packed,null,f.actor)).rejects.toMatchObject({code:'STUDYHUB_CONFLICT'});
  });
  it('rejects forged content or authors and preserves first imports',async()=>{
    const f=planningFixture();f.apply({type:'upgrade-history',confirm:true,reason:'Transport fixture'});
    const packed=await packPlanningState(f.state);expect(await unpackPlanningState(packed,null,f.actor)).toEqual(f.state);
    packed.projectPlans[0].events[0].command.brief.objective='Forged';
    await expect(unpackPlanningState(packed,null,f.actor)).rejects.toThrow(/no coincide/);
    await expect(unpackPlanningState(await packPlanningState(f.state),null,'other')).rejects.toThrow(/Autor/);
  });
});

import { describe, it, expect } from 'vitest';
import { planningFixture } from './helpers/planningFixture.js';
import { currentContent, validatePlans, validatePlanningTransition, canonical } from '../src/planning/engine.js';
import { planVersion, versionContents } from '../src/planning/history.js';

describe('lossless planning checkpoints', () => {
  it('explicitly upgrades while preserving every historical content metric actor and event', () => {
    const f=planningFixture();f.add('items',f.item());f.verify();
    const previous=structuredClone(f.state), original=structuredClone(f.state.projectPlans[0]);
    f.apply({type:'upgrade-history',confirm:true,reason:'Copia sintética conservada'});
    const p=f.state.projectPlans[0];
    expect(p.modelVersion).toBe(2);
    expect(p.events.slice(0,-1)).toEqual(original.events);
    expect([...versionContents(p)].map(({delta,baseVersion,...v})=>v)).toEqual(original.versions);
    expect(()=>validatePlanningTransition(previous,f.state,f.actor)).not.toThrow();
    expect(()=>validatePlans(f.state)).not.toThrow();
  });
  it('reconstructs over 500 events and rejects stale writes and changed idempotency payloads', () => {
    const f=planningFixture();f.add('items',f.item());
    f.apply({type:'upgrade-history',confirm:true,reason:'Prueba de recuperación'});
    for(let i=0;i<510;i++)f.apply({type:'status',itemId:'piece',status:i%2?'pending':'in_progress',reason:'Cambio sintético '+i});
    const p=f.state.projectPlans[0];
    expect(p.events.length).toBeGreaterThan(500);
    expect(p.versions.filter(v=>v.content).length).toBeLessThan(30);
    expect(planVersion(p,2).content.items[0].title).toBe('Pieza SINTETICA');
    expect(planVersion(p,p.activeVersion).content).toEqual(currentContent(p));
    expect(()=>validatePlans(f.state)).not.toThrow();
    const before=canonical(p),last=p.events.at(-1).command;
    f.apply(last);expect(canonical(f.state.projectPlans[0])).toBe(before);
    expect(()=>f.apply({...last,reason:'Intento de sustituir historia'})).toThrow(/identificador/);
    expect(()=>f.apply({type:'status',expectedRevision:1,itemId:'piece',status:'pending',reason:'Base antigua'})).toThrow(/cambió/);
    expect(canonical(f.state.projectPlans[0])).toBe(before);
  }, 20000);
  it('restores an old delta as a new version, never rewriting the old verification', () => {
    const f=planningFixture();f.add('items',f.item());f.verify();
    const verifiedVersion=f.state.projectPlans[0].activeVersion;
    f.apply({type:'upgrade-history',confirm:true,reason:'Ensayo'});
    f.apply({type:'status',itemId:'piece',status:'pending',reason:'Otra sesión'});
    f.apply({type:'restore',version:verifiedVersion,confirm:true,reason:'Restaurar para revisar'});
    const p=f.state.projectPlans[0];
    expect(planVersion(p,verifiedVersion).metrics.advance).toBe(100);
    expect(currentContent(p).evidence[0].review.status).toBe('incomplete');
    expect(currentContent(p).items[0].status).toBe('correct');
  });
  it('accepts JSONB key reordering but rejects altered numeric metrics',()=>{
    const f=planningFixture();f.add('items',f.item());f.verify();f.apply({type:'upgrade-history',confirm:true,reason:'Ensayo JSONB'});
    const plan=f.state.projectPlans[0];
    for(const v of plan.versions)if(v.metricsSummary)v.metrics=Object.fromEntries(Object.entries(v.metrics).reverse());
    expect(()=>validatePlans(f.state)).not.toThrow();
    plan.versions[0].metrics.advance=72;
    expect(()=>validatePlans(f.state)).toThrow(/Métrica histórica/);
  });
  it('detects corrupted checkpoints and delta bases without accepting a fabricated percentage', () => {
    const f=planningFixture();f.add('items',f.item());
    f.apply({type:'upgrade-history',confirm:true,reason:'Ensayo'});
    f.apply({type:'status',itemId:'piece',status:'in_progress',reason:'Prueba'});
    const p=f.state.projectPlans[0];p.versions[1].baseVersion=99;
    expect(()=>validatePlans(f.state)).toThrow(/checkpoint|base/);
  });
});

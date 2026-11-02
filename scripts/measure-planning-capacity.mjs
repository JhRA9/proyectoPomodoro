import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {planningFixture} from '../tests/helpers/planningFixture.js';
import {planningCapacity,currentContent,canonical,validatePlanningTransition,scenario} from '../src/planning/engine.js';

export function measurePlanningCapacity(count=300) {
  const start=performance.now(),f=planningFixture();
  for(let offset=0;offset<count;offset+=100) {
    const operations=Array.from({length:Math.min(100,count-offset)},(_,n)=>{
      const id='item-'+(offset+n);return f.op('items','add',id,f.item(id,{title:'Pieza sintética '+id,training:[0,0],construction:[1,2]}));
    });f.approve(f.propose(operations));
  }
  for(let offset=1;offset<count;offset+=100) {
    const operations=Array.from({length:Math.min(100,count-offset)},(_,n)=>{
      const index=offset+n,id='dep-'+index;
      return f.op('dependencies','add',id,{id,from:'item-'+(index-1),to:'item-'+index,type:'sequential',critical:true,reason:'Requisito sintético',sourceId:null,author:'Fixture'});
    });f.approve(f.propose(operations));
  }
  const populated=planningCapacity(f.state.projectPlans[0]);
  const rows=scenario(currentContent(f.state.projectPlans[0]),'2026-11-01').rows;
  let acceptedChanges=0,reason='',preserved=false;
  for(let n=0;n<500;n++) {
    const before=canonical(f.state);
    try {f.apply({type:'status',itemId:'item-0',status:n%2?'pending':'in_progress',reason:'Cambio repetido sintético'});acceptedChanges++;}
    catch(error){reason=error.message;preserved=before===canonical(f.state);break;}
  }
  const replayStart=performance.now();validatePlanningTransition(null,f.state,f.actor);
  return {syntheticOnly:true,items:count,dependencies:count-1,scenarioRows:rows.length,populated,
    acceptedChanges,final:planningCapacity(f.state.projectPlans[0]),limitMessage:reason,
    rejectedChangePreservedHistory:preserved,replayMs:Math.round(performance.now()-replayStart),totalMs:Math.round(performance.now()-start)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(measurePlanningCapacity(),null,2));

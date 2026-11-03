import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {planningFixture} from '../tests/helpers/planningFixture.js';
import {planningCapacity,currentContent,canonical,validatePlanningTransition,validatePlans} from '../src/planning/engine.js';
import {treeProjection} from '../src/planning/tree.js';
import {planVersion} from '../src/planning/history.js';
import {exportProjectReview} from '../src/planning/reviewExport.js';

const cases=[];
for(const count of [300,1000]){
  const start=performance.now(),f=planningFixture();f.apply({type:'upgrade-history',confirm:true,reason:'Medición aislada'});
  for(let offset=0;offset<count;offset+=50){const ops=Array.from({length:Math.min(50,count-offset)},(_,n)=>{const id='item-'+(offset+n);return f.op('items','add',id,f.item(id,{title:'Elemento de software SINTETICO '+id}));});f.approve(f.propose(ops));}
  for(let offset=1;offset<count;offset+=50){const ops=Array.from({length:Math.min(50,count-offset)},(_,n)=>{const i=offset+n,id='dependency-'+i;return f.op('dependencies','add',id,{id,from:'item-'+(i-1),to:'item-'+i,type:'blocking',critical:true,reason:'Dependencia sintética',sourceId:null,author:'Fixture'});});f.approve(f.propose(ops));}
  const populated=planningCapacity(f.state.projectPlans[0]);let accepted=0,limit=null;
  for(let n=0;n<60;n++){const previous=canonical(f.state);try{f.apply({type:'status',itemId:'item-0',status:n%2?'pending':'in_progress',reason:'Repetición '+n});accepted++;}catch(error){assert.equal(canonical(f.state),previous);limit=error.message;break;}}
  const plan=f.state.projectPlans[0],validationStart=performance.now();validatePlans(f.state);const validateMs=performance.now()-validationStart;
  const projectionStart=performance.now(),tree=treeProjection(currentContent(plan)),projectionMs=performance.now()-projectionStart;assert.equal(tree.nodes.length,count);
  assert.equal(canonical(planVersion(plan,plan.activeVersion).content),canonical(currentContent(plan)));
  const exportStart=performance.now(),memoryBefore=process.memoryUsage();const zip=await exportProjectReview(f.state,'synthetic-cube',{includeAcademic:true,includeCode:true,includeImages:true,includeOriginals:true},{list:async()=>[]});
  const memoryAfter=process.memoryUsage();
  cases.push({items:count,dependencies:count-1,repeatedChanges:accepted,limit,populated,final:planningCapacity(plan),validateMs:Math.round(validateMs),projectionMs:Math.round(projectionMs),exportMs:Math.round(performance.now()-exportStart),zipBytes:zip.blob.size,completeWithinSelection:zip.manifest.completeWithinSelection,heapDeltaBytes:memoryAfter.heapUsed-memoryBefore.heapUsed,arrayBufferDeltaBytes:memoryAfter.arrayBuffers-memoryBefore.arrayBuffers,totalMs:Math.round(performance.now()-start)});
}
// A near-limit export with five permitted originals, no real files or secrets.
const f=planningFixture(),originals=Array.from({length:5},(_,i)=>({key:String(i).padStart(64,'0'),name:`synthetic-${i}.bin`,sizeBytes:20*1024*1024,updatedAt:f.at,contentType:'application/octet-stream'}));
const start=performance.now(),before=process.memoryUsage(),sample=new Blob([new Uint8Array(20*1024*1024)]);
const result=await exportProjectReview(f.state,'synthetic-cube',{includeAcademic:true,includeCode:true,includeImages:true,includeOriginals:true},{list:async()=>originals,path:(task,key)=>`synthetic/${task}/${key}`,download:async()=>sample});
assert.equal(result.manifest.completeWithinSelection,true);const after=process.memoryUsage();
const report={at:new Date().toISOString(),syntheticOnly:true,cases,export100MiB:{originals:5,zipBytes:result.blob.size,durationMs:Math.round(performance.now()-start),rssDeltaBytes:after.rss-before.rss,arrayBufferDeltaBytes:after.arrayBuffers-before.arrayBuffers,note:'Node measurement, not a browser/mobile peak-memory guarantee.'}};
writeFileSync(new URL('../docs/planning/expansion-capacity.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

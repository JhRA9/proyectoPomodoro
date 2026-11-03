import {expect,it} from 'vitest';
import {releaseScenario} from './helpers/releaseScenario.js';
import {blockers,currentContent,planMetrics,validatePlans} from '../src/planning/engine.js';
import {planVersion} from '../src/planning/history.js';
import {treeProjection} from '../src/planning/tree.js';
import {exportProjectReview,previewProjectReview} from '../src/planning/reviewExport.js';
import {studyProjectProgress} from '../src/evaluation/progress.js';
import {sha256} from '../src/utils/integrity.js';

it('Cubo aislado: referencia externa, pieza pendiente, corrección, propuesta parcial e historia',async()=>{
  const f=releaseScenario(),plan=()=>f.state.projectPlans[0],content=()=>currentContent(plan());
  expect(blockers(content(),'assembly')).toHaveLength(1);
  expect(studyProjectProgress(f.state,'synthetic-cube').overall).toBeNull();
  expect(()=>f.apply({type:'evidence-review',evidenceId:'tutorial-frame',status:'approved',reason:'No es propia'})).toThrow();
  expect(planMetrics(content()).advance).toBeNull();
  f.verify('plate');expect(blockers(content(),'assembly')).toHaveLength(0);
  const version=plan().activeVersion,plate=content().items.find(i=>i.id==='plate');
  const pending=f.propose([f.op('items','edit','plate',{...plate,status:'correct',verification:null,criteria:[{id:'plate-criterion',text:'Repetir medida tras cambiar el plano'}]}),f.op('items','add','extra',f.item('extra'))]);
  f.approve(pending,[pending.operations[0].id]);validatePlans(f.state);
  expect(planVersion(plan(),version).content.items.find(i=>i.id==='plate').status).toBe('verified');
  expect(blockers(content(),'assembly')).toHaveLength(1);expect(content().items.some(i=>i.id==='extra')).toBe(false);
  const before=JSON.stringify(plan());expect(treeProjection(content(),{collapsed:['cube'],search:'electronica'}).nodes.length).toBeGreaterThan(0);
  const {manifest}=await exportProjectReview(f.state,'synthetic-cube',{includeAcademic:true,includeCode:true,includeImages:true,includeOriginals:true},{list:async()=>[]});
  expect(manifest.files.some(x=>x.name==='project.json')).toBe(true);expect(JSON.stringify(plan())).toBe(before);
});

it('recupera seis originales del mismo día y tarea en dos ZIP verificables sin declarar completa ninguna parte',async()=>{
  const f=releaseScenario(),size=20*1024*1024,blob=new Blob([new Uint8Array(size)]),digest=await sha256(blob);
  const files=Array.from({length:6},(_,i)=>({name:'fixture-'+i,key:String(i),sizeBytes:size,updatedAt:f.at,contentType:'application/octet-stream'}));
  const store={list:async()=>[...files].reverse(),path:(t,k)=>t+'/'+k,download:async()=>blob};
  const options={includeOriginals:true,includeCode:true,includeAcademic:true,includeImages:true};
  expect((await previewProjectReview(f.state,'synthetic-cube',options,store)).parts).toBe(2);
  const manifests=[];
  for(const part of [1,2])manifests.push((await exportProjectReview(f.state,'synthetic-cube',{...options,part},store)).manifest);
  expect(manifests[0].packageSet.id).toBe(manifests[1].packageSet.id);
  const originals=manifests.flatMap(m=>m.files.filter(x=>x.name.startsWith('originals/')));
  expect(new Set(originals.map(x=>x.name)).size).toBe(6);expect(originals).toHaveLength(6);
  expect(originals.every(x=>x.sha256===digest&&x.bytes===size)).toBe(true);
  expect(manifests.every(m=>m.includesAllProjectData===false&&m.completeWithinSelection===false)).toBe(true);
},30000);

import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {releaseScenario} from '../tests/helpers/releaseScenario.js';
import {currentContent,validatePlans} from '../src/planning/engine.js';
import {exportProjectReview} from '../src/planning/reviewExport.js';
import {saveDelivery} from '../src/planning/deliveries.js';
import {sha256} from '../src/utils/integrity.js';

const f=releaseScenario();
f.verify('plate');
const piece=currentContent(f.state.projectPlans[0]).items.find(i=>i.id==='plate');
f.approve(f.propose([f.op('items','edit','plate',{...piece,status:'correct',verification:null,
  criteria:[{id:'plate-criterion',text:'Repetir la medición sintética para el plano revisado'}]})]));
const blob=new Blob(['Simulación de matriz virtual. Archivo de aceptación. Sin datos de montaje reales.'],{type:'text/plain'});
const digest=await sha256(blob);
const file={name:'simulacion.txt',key:digest,taskId:'synthetic-task',path:'local/synthetic-task/'+digest,sizeBytes:blob.size,contentType:blob.type,sha256:digest,representation:'original',version:f.at};
saveDelivery(f.state,'synthetic-cube',{requestId:'acceptance',title:'Simulación de software',purpose:'technical',itemIds:['virtual'],competencyIds:[],files:[file]},'local',f.at);
validatePlans(f.state);
const options={includeOriginals:true,includeAcademic:true,includeCode:true,includeImages:true};
const {manifest,blob:zip}=await exportProjectReview(f.state,'synthetic-cube',options,{list:async()=>[],downloadOriginal:async()=>blob});
assert.deepEqual(manifest.omissions,[]);
assert.ok(manifest.includesAllProjectData);
await writeFile(new URL('../docs/planning/release-browser/cubo-sintetico.zip',import.meta.url),new Uint8Array(await zip.arrayBuffer()));

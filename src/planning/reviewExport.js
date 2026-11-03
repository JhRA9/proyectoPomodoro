import {currentContent,planMetrics} from './engine.js';
import {sha256} from '../utils/integrity.js';
export const EXPORT_LIMIT=100*1024*1024;
const encoder=new TextEncoder();
const fields=new Set(('conversations message messageId baseVersion context proposalId plan brief delta rows order historyMigration rule weeklyReviews catalog original from id projectId name title description objective scope constraints done availability assumptions kind parentId status criteria text weight applicable requiresEvidence taskId targetDate estimatedDate deadline training construction confidence requiredLevel verification actor at method reason from to type critical sourceId author content origin version url date itemId sourceIds contradicts probability impact mitigation owner closeCondition targetIds open blocking criteriaIds review file sharedEvidenceId key path sizeBytes contentType sha256 representation submissionId submissionVersion purpose itemIds competencyIds code expectedResult actualResult difficulties corrections difficulty helpLevel independenceDeclared independenceVerified tests passed total summary files createdAt updatedAt endedAt startedAt durationSeconds accumulatedSeconds dueDate dueTime recurrence frequency startDate endDate completedDates completedAt category categoryId rubric rubricVersion scores criterionId score justification provider model profile percentage strengths weaknesses recommendations validationState reviews requestedProviders canonicalResult resolutionHistory explanation source resolvedAt provenance attemptVersion ruleSetId areaSetVersion errors payload submissionVersions legacy original eventIds attemptIds sessionIds evidenceIds submissionIds start end planRevision worked improve revision activeVersion modelVersion events versions command operations action collection targetId value uncertainty questions uncertainties baseVersion acceptedIds resolution expectedRevision selectedIds confirm confirmObjective evidenceId planId proposal proposalId selected format exportedAt selection contextIds metrics items dependencies evidence risks sources facts decisions project tasks sessions learnings competencies exercises evaluations history archive limitations learned unresolved nextSession images alt width height dataUrl mapping stages deliverables catalog adoptedRevision reverted mode').split(' '));
for(const key of 'sourceHash stageId dependencyIds blockingReason verifiedAt objectives resources categories label focusSessionId learnedImages targetType exerciseId referenceTombstones tombstone metricsSummary createdCanonical importedBy originalRevision evidenceTombstones proposals descriptions geminiModel cloudflareModel maxRequestsPerDay advance numerator denominator applicableIds verifiedIds undefinedIds coverage requiredIds evidenceIds missing undefined learning knowledgeIds demonstratedIds competencyId exerciseIds icon color projectType evaluationConfig privacy enabled rubricVersion aiEnabled thresholds areas initialized evaluationModelVersion imports importedRoutes deliveryStages deliverables requestId expectedVersion tombstones lastEvaluatedAt'.split(' '))fields.add(key);
const secret=/\b(?:AIza[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
function sanitized(value,options,omissions,path='data'){
  if(typeof value==='string'){
    if(secret.test(value)){omissions.push({path,reason:'Posible secreto: contenido excluido'});return '[Contenido excluido por privacidad]';}
    if(/^https?:\/\//.test(value)&&/[?&](token|signature|apikey|key|authorization)=/i.test(value)){omissions.push({path,reason:'Enlace temporal o credencial excluida'});return '';}
    return value;
  }
  if(Array.isArray(value))return value.map((v,i)=>sanitized(v,options,omissions,`${path}[${i}]`));
  if(!value||typeof value!=='object')return value;
  const result={};
  for(const [key,item] of Object.entries(value)){
    if(!fields.has(key)){omissions.push({path:`${path}.${key}`,reason:'Campo no autorizado en el formato de revisión'});continue;}
    if((key==='code'&&!options.includeCode)||(key==='dataUrl'&&!options.includeImages)){omissions.push({path:`${path}.${key}`,reason:'No seleccionado'});continue;}
    result[key]=sanitized(item,options,omissions,`${path}.${key}`);
  }
  return result;
}
export function reviewSelection(state,projectId,options={}){
  const project=state.projects.find(p=>p.id===projectId);if(!project)throw new Error('Proyecto ausente.');
  const plan=state.projectPlans.find(p=>p.projectId===projectId);if(!plan)throw new Error('Crea primero el plan.');
  const content=currentContent(plan),all=new Map(content.items.map(i=>[i.id,i])),ids=new Set(),context=new Set();
  if(options.itemId){
    if(!all.has(options.itemId))throw new Error('Elemento de otro proyecto.');
    const children=new Map(),prerequisites=new Map();
    const link=(map,key,id)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(id);};
    for(const item of all.values())if(item.parentId){
      link(children,item.parentId,item.id);
      link(prerequisites,item.id,item.parentId);
    }
    for(const dep of content.dependencies)link(prerequisites,dep.to,dep.from);
    // Set iteration visits new entries once, even when informational edges cycle.
    ids.add(options.itemId);
    for(const id of ids)for(const child of children.get(id)||[])ids.add(child);
    const related=new Set(ids);
    for(const id of related)for(const prior of prerequisites.get(id)||[]){
      if(!ids.has(prior)){context.add(prior);related.add(prior);}
    }
  }else for(const id of all.keys())ids.add(id);
  const selected=new Set([...ids,...context]),inPeriod=value=>(!options.from||String(value||'').slice(0,10)>=options.from)&&(!options.to||String(value||'').slice(0,10)<=options.to);
  const tasks=state.tasks.filter(t=>t.projectId===projectId&&(!options.itemId||content.items.some(i=>selected.has(i.id)&&i.taskId===t.id))),taskIds=new Set(tasks.map(t=>t.id));
  const scoped=Boolean(options.itemId||options.from||options.to);
  const matchesItem=row=>!options.itemId||row.itemIds?.some(id=>selected.has(id));
  const exercises=state.exercises.filter(x=>x.projectId===projectId).flatMap(x=>{
    if(!scoped)return [x];
    if(!x.submissionVersions)return matchesItem(x)&&inPeriod(x.updatedAt||x.createdAt)?[x]:[];
    const kept=x.submissionVersions.filter(v=>matchesItem(v.payload)&&inPeriod(v.at));
    if(!kept.length)return [];
    return [{...kept.at(-1).payload,id:x.id,projectId,submissionVersions:kept}];
  });
  const exerciseIds=new Set(exercises.map(x=>x.id));
  const versions=exercises.flatMap(x=>(x.submissionVersions||[]).filter(v=>inPeriod(v.at)));
  const files=[...new Map(versions.flatMap(v=>v.payload.files||[]).map(f=>[f.path,{...f}])).values()];
  const selectedContent={...content,items:content.items.filter(i=>selected.has(i.id)),dependencies:content.dependencies.filter(d=>selected.has(d.from)&&selected.has(d.to)),evidence:content.evidence.filter(e=>selected.has(e.itemId)),risks:content.risks.filter(r=>r.targetIds.some(id=>selected.has(id)))};
  if(options.itemId){
    const sourceIds=new Set([...selectedContent.evidence,...selectedContent.dependencies].map(x=>x.sourceId).filter(Boolean));
    selectedContent.sources=content.sources.filter(s=>sourceIds.has(s.id));
    selectedContent.facts=content.facts.filter(f=>f.sourceIds.some(id=>sourceIds.has(id)));
    selectedContent.decisions=content.decisions.filter(d=>d.sourceIds.some(id=>sourceIds.has(id)));
  }
  // Partial exports are review packages, not replayable database backups.
  const history=plan.events.filter(ev=>inPeriod(ev.at)).flatMap(ev=>{
    if(!options.itemId)return [ev];
    const command=ev.command;
    const proposal=command.proposal||plan.proposals.find(p=>p.id===command.proposalId);
    const operations=(proposal?.operations||[]).filter(op=>selected.has(op.targetId));
    if(!operations.length&&!selected.has(command.itemId)&&!selectedContent.evidence.some(e=>e.id===command.evidenceId))return [];
    return [{id:ev.id,type:ev.type,at:ev.at,actor:ev.actor,version:ev.version,operations}];
  });
  return {project,plan,files,raw:{format:'studyhub-project-review/1',project:{...project,...(scoped?{weeklyReviews:undefined}:{}),evaluationConfig:options.includeAcademic?project.evaluationConfig:undefined},selection:{from:options.from||null,to:options.to||null,itemId:options.itemId||null},contextIds:[...context],metrics:planMetrics(content),content:selectedContent,tasks,categories:(state.categories||[]).filter(c=>project.categoryId===c.id||tasks.some(t=>t.categoryId===c.id)),deliveryStages:options.itemId?[]:(state.deliveryStages||[]).filter(x=>x.projectId===projectId),deliverables:options.itemId?[]:(state.deliverables||[]).filter(x=>x.projectId===projectId),sessions:state.focusSessions.filter(s=>taskIds.has(s.taskId)&&inPeriod(s.endedAt)),learnings:state.learningEntries.filter(l=>l.projectId===projectId&&taskIds.has(l.taskId)&&inPeriod(l.createdAt)),competencies:options.includeAcademic?state.competencies.filter(c=>c.projectId===projectId):[],exercises:exercises.map(x=>({...x,submissionVersions:x.submissionVersions?.filter(v=>inPeriod(v.at))})),evaluations:options.includeAcademic?state.evaluations.filter(a=>a.projectId===projectId&&(!options.itemId||exerciseIds.has(a.targetId))&&inPeriod(a.createdAt)):[],evidence:state.evidence.filter(e=>e.projectId===projectId&&(!options.itemId||exerciseIds.has(e.targetId))&&inPeriod(e.createdAt)),history,archive:options.itemId||options.from||options.to?null:{plan,weeklyReviews:project.weeklyReviews||[]}}};
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function header(length){const bytes=new Uint8Array(length);return {bytes,view:new DataView(bytes.buffer)};}
export async function zipStored(entries,signal){
  const parts=[],directory=[];let offset=0,total=0;
  if(entries.length>60000)throw new Error('Demasiados archivos para el paquete. Reduce el alcance.');
  for(const entry of entries){
    signal?.throwIfAborted();
    if(entry.name.includes('..')||entry.name.startsWith('/')||entry.name.includes('\\'))throw new Error('Nombre de archivo de exportación inseguro.');
    const name=encoder.encode(entry.name),bytes=new Uint8Array(await entry.blob.arrayBuffer());
    total+=bytes.length;if(total>EXPORT_LIMIT+8*1024*1024)throw new Error('El paquete supera el límite seguro. No se generó una exportación completa.');
    const crc=crc32(bytes),local=header(30);local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x0800,true);local.view.setUint16(12,33,true);local.view.setUint32(14,crc,true);local.view.setUint32(18,bytes.length,true);local.view.setUint32(22,bytes.length,true);local.view.setUint16(26,name.length,true);
    parts.push(local.bytes,name,entry.blob);
    const central=header(46);central.view.setUint32(0,0x02014b50,true);central.view.setUint16(4,20,true);central.view.setUint16(6,20,true);central.view.setUint16(8,0x0800,true);central.view.setUint16(14,33,true);central.view.setUint32(16,crc,true);central.view.setUint32(20,bytes.length,true);central.view.setUint32(24,bytes.length,true);central.view.setUint16(28,name.length,true);central.view.setUint32(42,offset,true);directory.push(central.bytes,name);offset+=30+name.length+bytes.length;
  }
  const size=directory.reduce((sum,p)=>sum+p.length,0),end=header(22);end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,entries.length,true);end.view.setUint16(10,entries.length,true);end.view.setUint32(12,size,true);end.view.setUint32(16,offset,true);
  return new Blob([...parts,...directory,end.bytes],{type:'application/zip'});
}
async function reviewInventory(state,projectId,options,fileStore){
  const selected=reviewSelection(state,projectId,options),omissions=[];
  if(options.includeOriginals&&fileStore){
    for(const task of selected.raw.tasks){
      try{for(const file of await fileStore.list(task.id,{versions:true})){
        const path=fileStore.path(task.id,file.key);
        const day=file.updatedAt?.slice(0,10);
        const referenced=selected.raw.content.evidence.some(e=>e.file?.path===path);
        if(!referenced&&((options.from&&(!day||day<options.from))||(options.to&&(!day||day>options.to))))continue;
        if(!selected.files.some(f=>f.path===path))selected.files.push({...file,taskId:task.id,path,version:file.updatedAt,representation:'legacy-upload-not-versioned'});
      }}catch{omissions.push({path:task.id,reason:'No se pudo enumerar los adjuntos de la tarea'});}
    }
    const referencedEvidence=selected.raw.archive ? selected.plan.versions.flatMap(v=>v.content?.evidence??v.delta?.evidence?.rows??[]) : selected.raw.content.evidence;
    const checkedVersions=new Set();
    for(const evidence of referencedEvidence){
      if(!evidence.file)continue;
      const key=JSON.stringify([evidence.file.path,evidence.file.version]);
      if(checkedVersions.has(key))continue;
      checkedVersions.add(key);
      const original=selected.files.find(f=>f.path===evidence.file.path);
      const expected=evidence.file.version;
      if(!original||(original.version!==expected&&Date.parse(original.version)!==Date.parse(expected))){
        omissions.push({path:evidence.file.path,reason:'La versión citada por la evidencia está ausente o fue reemplazada'});
      }
    }
  }else if(!fileStore&&options.includeOriginals)omissions.push({path:'originals',reason:'No se pudo comprobar el inventario privado de archivos'});
  return {selected,omissions};
}
// Stable ordering also covers many files attached to a single task on the same day.
function splitOriginals(files){
  const parts=[[]];let used=0;
  for(const file of [...files].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)){
    if(!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<0||file.sizeBytes>20*1024*1024)throw new Error('Original inválido o superior a 20 MiB. No se generó el paquete (100 MiB por parte).');
    if(used+file.sizeBytes>EXPORT_LIMIT){parts.push([]);used=0;}
    parts.at(-1).push(file);used+=file.sizeBytes;
  }
  return parts;
}
export async function previewProjectReview(state,projectId,options={},fileStore=null){
  const {selected,omissions}=await reviewInventory(state,projectId,options,fileStore);
  const json=sanitized(selected.raw,options,omissions);
  return {parts:options.includeOriginals?splitOriginals(selected.files).length:1,files:selected.files.length,originalBytes:options.includeOriginals?selected.files.reduce((sum,f)=>sum+f.sizeBytes,0):0,jsonBytes:encoder.encode(JSON.stringify(json,null,2)).length,omissions:omissions.length};
}
export async function exportProjectReview(state,projectId,options={},fileStore=null,signal){
  const {selected,omissions}=await reviewInventory(state,projectId,options,fileStore),entries=[];
  const parts=options.includeOriginals?splitOriginals(selected.files):[selected.files];
  const part=options.part??1;
  if(!Number.isSafeInteger(part)||part<1||part>parts.length)throw new Error(`Elige una parte entre 1 y ${parts.length}.`);
  if(parts.length>1&&!options.part)throw new Error(`Los originales superan 100 MiB. Descarga las partes 1 a ${parts.length} manteniendo la misma selección.`);
  const multipart=parts.length>1;
  signal?.throwIfAborted();
  if(!options.includeAcademic&&(state.competencies.some(c=>c.projectId===projectId)||state.evaluations.some(e=>e.projectId===projectId)))omissions.push({path:'academic',reason:'Datos académicos no seleccionados'});
  const data=sanitized(selected.raw,options,omissions);
  const add=async(name,blob,digest)=>{entries.push({name,blob,sha256:digest??await sha256(blob),bytes:blob.size});};
  await add('project.json',new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  for(const file of parts[part-1]){
    signal?.throwIfAborted();
    if(!options.includeOriginals){omissions.push({path:file.path,reason:'Original no autorizado para exportación'});continue;}
    if(!fileStore){omissions.push({path:file.path,reason:'Almacenamiento privado no disponible'});continue;}
    try{signal?.throwIfAborted();const blob=file.sha256?await fileStore.downloadOriginal(file):await fileStore.download(file.taskId,file.key,file.version);if(blob.size!==file.sizeBytes)throw new Error('Tamaño distinto');const digest=await sha256(blob);if(file.sha256&&file.sha256!==digest)throw new Error('Hash distinto');file.sha256=digest;if(/text|json|javascript/.test(file.contentType)&&secret.test(await blob.text())){omissions.push({path:file.path,reason:'Original con posible secreto; no incluido'});continue;}await add(`originals/${file.taskId}/${file.key}`,blob,digest);}catch{signal?.throwIfAborted();omissions.push({path:file.path,reason:'Original ausente, acceso rechazado o integridad inválida'});}
  }
  const complete=omissions.length===0&&!multipart;
  const summary=`# ${data.project.name}\n\nPaquete para revisión, no restauración automática.\n\nEstado: ${complete?'Completo dentro de la selección':'Con exclusiones; revisar manifest.json'}.\n\nAvance del proyecto: ${selected.raw.metrics.advance===null?'Sin calcular':selected.raw.metrics.advance+'%'} (alcance completo del proyecto; no recalculado sobre una selección parcial).\n\n${data.content.items.map(i=>`- ${i.title}: ${i.status}`).join('\n')}\n\n${omissions.map(o=>`- ${o.path}: ${o.reason}`).join('\n')}`;
  await add('context.md',new Blob([summary],{type:'text/markdown'}));
  const manifest={format:'studyhub-project-review/1',exportedAt:new Date().toISOString(),projectId,selection:selected.raw.selection,completeWithinSelection:complete,includesAllProjectData:complete&&!options.itemId&&!options.from&&!options.to&&options.includeAcademic===true&&options.includeCode===true&&options.includeImages===true&&options.includeOriginals===true,files:entries.map(({name,sha256,bytes})=>({name,sha256,bytes})),originals:selected.files.map(({name,path,key,taskId,version,sha256,sizeBytes})=>({name,path,key,taskId,archivePath:`originals/${taskId}/${key}`,version,sha256,sizeBytes})),omissions,limitations:['No restaura cuentas ni permisos.','Las exclusiones aparecen explícitamente.','Límite de originales: 100 MiB; descargar todas las partes numeradas si se supera.']};
  if(multipart){
    const identity=parts.flat().map(f=>[f.path,f.sizeBytes,f.version]);
    // Legacy hashes are learned when downloaded; use revision and version for a stable set identifier.
    manifest.packageSet={part,total:parts.length,id:await sha256(JSON.stringify([projectId,state.revision,selected.raw.selection,options.includeAcademic,options.includeCode,options.includeImages,identity])),pathsByPart:parts.map(group=>group.map(f=>f.path))};
    manifest.limitations.push('Parte de un conjunto. Reúne todas las partes con el mismo identificador y verifica sus hashes y exclusiones.');
  }
  entries.push({name:'manifest.json',blob:new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'})});
  return {blob:await zipStored(entries,signal),manifest};
}

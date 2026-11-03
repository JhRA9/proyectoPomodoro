import {toLocalDateKey} from '../utils/time.js';

import {canonical} from './engine.js';

import {createId} from '../utils/id.js';

const need=(ok,message)=>{if(!ok)throw new Error(message);};

export function saveDelivery(state,projectId,input,actor,at){

  need(typeof input.requestId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId),'Identificador de envío requerido.');

  const signature=canonical(input);

  const receipt=(state.deliveryReceipts||[]).find(r=>r.id===input.requestId);

  if(receipt){need(state.exercises.some(x=>x.id===receipt.result.exerciseId&&x.projectId===projectId),'Esta entrega pertenece a un proyecto eliminado.');need(receipt.projectId===projectId&&receipt.actor===actor&&receipt.signature===signature,'Identificador de entrega reutilizado con otros datos.');return {...receipt.result,replayed:true};}

  const project=state.projects.find(p=>p.id===projectId);need(project&&project.status!=='completed','Abre un proyecto activo.');

  const plan=state.projectPlans.find(p=>p.projectId===projectId),content=plan?.versions.at(-1).content;

  const itemIds=[...new Set(input.itemIds||[])],competencyIds=[...new Set(input.competencyIds||[])];

  need(itemIds.every(id=>content?.items.some(i=>i.id===id)),'Elemento de otro proyecto.');

  need(competencyIds.every(id=>state.competencies.some(c=>c.id===id&&c.projectId===projectId)),'Competencia de otro proyecto.');

  need(['technical','academic','both'].includes(input.purpose),'Elige el uso de la entrega.');

  need(typeof input.title==='string'&&input.title.trim()&&input.title.length<=120,'Escribe un título de hasta 120 caracteres.');

  const files=input.files||[];

  for(const file of files){

    need(state.tasks.some(t=>t.id===file.taskId&&t.projectId===projectId)||state.exercises.some(x=>x.projectId===projectId&&x.submissionVersions?.some(v=>v.payload.files?.some(old=>canonical(old)===canonical(file)))),'El original no pertenece a una tarea de este proyecto.');

    need(file.path===`${actor}/${file.taskId}/${file.key}`&&/^[a-f0-9]{64}$/.test(file.key)&&/^[a-f0-9]{64}$/.test(file.sha256),'Referencia privada o hash inválido.');

    need(Number.isSafeInteger(file.sizeBytes)&&file.sizeBytes>0&&file.sizeBytes<=20*1024*1024&&file.representation==='original','El archivo no es un original admitido.');

  }

  let exercise=state.exercises.find(x=>x.id===input.exerciseId&&x.projectId===projectId);

  need(!input.exerciseId||exercise,'Entrega ausente.');

  if(exercise)need(input.expectedVersion===(exercise.submissionVersion||1),'La entrega cambió. Revisa su versión antes de volver a enviar.');

  if(exercise)need(!state.evaluations.some(a=>a.targetId===exercise.id&&a.status==='pending'),'Recupera o cancela la evaluación pendiente antes de enviar otra versión.');

  else{exercise={id:createId('exercise'),projectId,createdAt:at,submissionVersion:0,submissionVersions:[]};state.exercises.push(exercise);}

  // Preserve a historical exercise even if it was never evaluated.

  if(!exercise.submissionVersions){exercise.submissionVersions=[{id:createId('submission'),version:exercise.submissionVersion||1,at:exercise.updatedAt||exercise.createdAt,actor:null,provenance:'legacy-unattributed',payload:structuredClone(exercise)}];}

  const bounded=(name,max)=>{const value=String(input[name]||'');need(value.length<=max,`${name}: texto demasiado largo.`);return value;};

  Object.assign(exercise,{title:input.title.trim(),description:bounded('description',1200),objective:bounded('objective',600),code:bounded('code',30000),expectedResult:bounded('expectedResult',3000),actualResult:bounded('actualResult',3000),difficulties:bounded('difficulties',3000),corrections:bounded('corrections',3000),purpose:input.purpose,itemIds,competencyIds,difficulty:exercise.difficulty||3,helpLevel:exercise.helpLevel||'unverified_help',independenceDeclared:false,independenceVerified:false,status:'completed',tests:{status:'not_run',passed:0,total:0,summary:''},files:structuredClone(files),updatedAt:at,submissionVersion:(exercise.submissionVersion||0)+1});

  const {submissionVersions,...payload}=exercise;

  const version={id:createId('submission'),version:exercise.submissionVersion,actor,at,provenance:'user-submission',payload:structuredClone(payload)};

  submissionVersions.push(version);

  const evidence={id:createId('evidence'),projectId,targetType:'exercise',targetId:exercise.id,title:exercise.title,description:exercise.actualResult,kind:files.length?'attached':'reported',competencyIds,submissionId:version.id,submissionVersion:version.version,files:structuredClone(files),origin:'own',createdAt:at};

  state.evidence.push(evidence);

  const result={exerciseId:exercise.id,submissionId:version.id,evidenceId:evidence.id};

  (state.deliveryReceipts??=[]).push({id:input.requestId,projectId,actor,at,signature,result});

  return result;

}



export function projectWeekFacts(state,projectId,start,end){

  const contains=date=>typeof date==='string'&&toLocalDateKey(new Date(date))>=start&&toLocalDateKey(new Date(date))<=end;

  const plan=state.projectPlans.find(p=>p.projectId===projectId),tasks=state.tasks.filter(t=>t.projectId===projectId),ids=new Set(tasks.map(t=>t.id));

  return {start,end,planRevision:plan?.revision||null,eventIds:(plan?.events||[]).filter(e=>contains(e.at)).map(e=>e.id),submissionIds:state.exercises.filter(e=>e.projectId===projectId).flatMap(e=>(e.submissionVersions||[]).filter(v=>contains(v.at)).map(v=>v.id)),evidenceIds:state.evidence.filter(e=>e.projectId===projectId&&contains(e.createdAt)).map(e=>e.id),attemptIds:state.evaluations.filter(e=>e.projectId===projectId&&contains(e.createdAt)).map(e=>e.id),sessionIds:state.focusSessions.filter(s=>ids.has(s.taskId)&&contains(s.endedAt)).map(s=>s.id)};

}



export function originalTaskIds(state,projectId=null){

  return [...new Set((state.exercises||[]).filter(x=>!projectId||x.projectId===projectId).flatMap(x=>[...(x.files||[]),...(x.submissionVersions||[]).flatMap(v=>v.payload.files||[])]).map(f=>f.taskId).filter(Boolean))];

}


// Additive schema: historical exercises without versions remain supported.
export function validateDeliveries(state){
  for(const exercise of state.exercises||[]){
    if(!exercise.submissionVersions)continue;
    need(['technical','academic','both'].includes(exercise.purpose),'Uso de entrega inválido.');
    need(Array.isArray(exercise.submissionVersions)&&exercise.submissionVersions.length>0,'Historial de entrega ausente.');
    const ids=new Set();let last=0;
    for(const version of exercise.submissionVersions){
      need(version&&version.version>last&&Number.isSafeInteger(version.version)&&!ids.has(version.id),'Versión de entrega duplicada o desordenada.');last=version.version;ids.add(version.id);
      need(version.payload?.id===exercise.id&&version.payload?.projectId===exercise.projectId,'Versión perteneciente a otra entrega.');
      need(!version.payload.submissionVersions,'Historial de entrega anidado inválido.');
      need(!Number.isNaN(Date.parse(version.at)),'Fecha de entrega inválida.');
      for(const file of version.payload.files||[]){need(/^[a-f0-9]{64}$/.test(file.sha256)&&Number.isSafeInteger(file.sizeBytes)&&file.sizeBytes>0&&file.sizeBytes<=20*1024*1024&&typeof file.path==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(file.taskId)&&/^[a-f0-9]{64}$/.test(file.key)&&file.path.split('/').length===3&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(file.path.split('/')[0])&&file.path.endsWith('/'+file.taskId+'/'+file.key),'Original inválido.');}
    }
    need(last===exercise.submissionVersion,'La versión actual no coincide con su historial.');
    const latest=exercise.submissionVersions.at(-1).payload;
    for(const field of ['title','description','objective','code','expectedResult','actualResult','difficulties','corrections','purpose','itemIds','files']){
      need(canonical(exercise[field])===canonical(latest[field]),'El contenido actual de la entrega debe coincidir con su última versión.');
    }
  }
  need(Array.isArray(state.deliveryReceipts||[]),'Registro de envíos inválido.');
  need(new Set((state.deliveryReceipts||[]).map(r=>r.id)).size===(state.deliveryReceipts||[]).length,'Registro de envío duplicado.');
}
export function validateDeliveryTransition(previous,next){
  for(const old of previous?.exercises||[]){
    if(!old.submissionVersions)continue;
    const current=next.exercises.find(x=>x.id===old.id);
    need(current||!next.projects.some(p=>p.id===old.projectId),'No se puede borrar una entrega con historial.');
    if(current)need(canonical(current.submissionVersions?.slice(0,old.submissionVersions.length))===canonical(old.submissionVersions),'Las versiones enviadas son inmutables.');
  }
}

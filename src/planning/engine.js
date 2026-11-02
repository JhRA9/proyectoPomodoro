// Pure, deterministic planning rules. Also imported by the authenticated Edge Function.
export const PLAN_STATUSES = { pending: 'Pendiente', in_progress: 'En proceso', blocked: 'Bloqueado', improve: 'Por mejorar', correct: 'Por corregir', completed: 'Completado', verified: 'Verificado' };
export const ITEM_KINDS = { phase: 'Fase', milestone: 'Hito', deliverable: 'Entregable', work: 'Actividad', knowledge: 'Conocimiento' };
export const DEPENDENCY_TYPES = { blocking: 'Bloqueante', sequential: 'Secuencial', knowledge: 'Requiere conocimiento', resource: 'Requiere recurso/material', approval: 'Revisión/aprobación', informative: 'Informativa o recomendada' };
const COLLECTIONS = ['items', 'dependencies', 'evidence', 'risks', 'sources', 'facts', 'decisions'];
const clone = value => structuredClone(value);
export const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item);
function need(condition, message) { if (!condition) throw new Error(message); }
function text(value, max = 2000, required = false) { need(typeof value === 'string' && value.length <= max && (!required || value.trim()), 'Texto obligatorio, inválido o demasiado largo.'); }
function id(value) { need(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value), 'Identificador inválido.'); }
function keys(value, allowed) { need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => allowed.includes(k)), 'La estructura contiene campos no admitidos.'); }
function date(value) { need(value === null || value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value), 'Fecha inválida.'); }
function refs(values, ids) { need(Array.isArray(values) && values.length <= 100 && new Set(values).size === values.length && values.every(v => ids.has(v)), 'Hay relaciones ausentes o duplicadas.'); }
function range(value) { need(value === null || (Array.isArray(value) && value.length === 2 && value.every(x => Number.isFinite(x) && x >= 0 && x <= 10000) && value[0] <= value[1]), 'El rango de horas no es válido.'); }
function safeUrl(value) { if (!value) return; try { need(['https:', 'http:'].includes(new URL(value).protocol), 'URL insegura.'); } catch { throw new Error('Usa un enlace http o https completo.'); } }
export function blankContent(brief = {}) {
  return { brief: { objective: '', scope: '', constraints: '', done: '', availability: null, assumptions: '', ...brief }, ...Object.fromEntries(COLLECTIONS.map(k => [k, []])) };
}
export function currentContent(plan) { return plan.versions.at(-1).content; }
export function planningCapacity(plan) {
  const serialized = JSON.stringify(plan);
  return { events: plan.events.length, versions: plan.versions.length,
    codeUnits: serialized.length, utf8Bytes: new TextEncoder().encode(serialized).byteLength,
    eventLimit: 500, codeUnitLimit: 3000000,
    nearLimit: plan.events.length >= 400 || serialized.length >= 2400000 };
}
function hasCycle(edges, ids) {
  const visiting = new Set(), seen = new Set();
  const visit = n => { if (visiting.has(n)) return true; if (seen.has(n)) return false; visiting.add(n); if (edges.filter(e => e[0] === n).some(e => visit(e[1]))) return true; visiting.delete(n); seen.add(n); return false; };
  return [...ids].some(visit);
}
export function blockers(content, itemId) {
  return [...content.risks.filter(r => r.open && r.blocking && r.targetIds.includes(itemId)).map(r => ({ id:r.id, reason:r.title })), ...content.dependencies.filter(d => d.to === itemId && d.type !== 'informative' && content.items.find(i => i.id === d.from)?.status !== 'verified').map(d => ({ id:d.id, reason:`${content.items.find(i => i.id === d.from)?.title || d.from}: ${d.reason}` }))];
}
function evidenceFor(content, item) {
  return content.evidence.filter(e => e.itemId === item.id && e.review?.status === 'approved' && e.origin === 'own' && e.content.trim());
}
export function missingEvidence(content, item) {
  const evidence = evidenceFor(content, item);
  return (item.criteria || []).filter(c => !evidence.some(e => e.criteriaIds.includes(c.id))).map(c => c.id);
}
function verificationReady(content, item) { return item.criteria.length > 0 && !missingEvidence(content, item).length && !blockers(content, item.id).length; }
export function planMetrics(content) {
  const applicable = content.items.filter(i => i.kind === 'deliverable' && i.applicable);
  const undefinedIds = applicable.filter(i => !i.criteria.length || !(i.weight > 0)).map(i => i.id);
  const verifiedIds = applicable.filter(i => i.status === 'verified' && verificationReady(content, i)).map(i => i.id);
  const denominator = applicable.reduce((n,i) => n + (i.weight || 0), 0);
  const numerator = applicable.filter(i => verifiedIds.includes(i.id)).reduce((n,i) => n + i.weight, 0);
  const required = applicable.filter(i => i.requiresEvidence);
  const evidenceIds = required.filter(i => i.criteria.length && !missingEvidence(content,i).length).map(i => i.id);
  const knowledge = content.items.filter(i => i.kind === 'knowledge' && i.applicable);
  const demonstrated = knowledge.filter(i => i.status === 'verified' && verificationReady(content,i)).map(i => i.id);
  return { advance: !applicable.length || undefinedIds.length || !denominator ? null : Math.round(10000 * numerator / denominator) / 100, numerator, denominator, applicableIds: applicable.map(i=>i.id), verifiedIds, undefinedIds, coverage: required.length ? Math.round(100 * evidenceIds.length / required.length) : null, requiredIds: required.map(i=>i.id), evidenceIds, missing: required.map(i=>({id:i.id,criteria:missingEvidence(content,i),undefined:!i.criteria.length})), learning: knowledge.length ? Math.round(100 * demonstrated.length / knowledge.length) : null, knowledgeIds:knowledge.map(i=>i.id), demonstratedIds:demonstrated };
}
export function validateContent(content, projectId, state) {
  keys(content, ['brief', ...COLLECTIONS]); keys(content.brief, ['objective','scope','constraints','done','availability','assumptions']);
  for (const k of ['objective','scope','constraints','done','assumptions']) text(content.brief[k],5000);
  need(content.brief.availability === null || (Number.isFinite(content.brief.availability) && content.brief.availability > 0 && content.brief.availability <= 24), 'Disponibilidad: horas diarias entre 0 y 24.');
  const allIds = new Set();
  for (const k of COLLECTIONS) { need(Array.isArray(content[k]) && content[k].length <= 300, 'Demasiados elementos en el plan.'); for (const row of content[k]) { id(row.id); need(!allIds.has(row.id), 'ID repetido en el plan.'); allIds.add(row.id); } }
  const itemIds = new Set(content.items.map(x=>x.id)), sourceIds = new Set(content.sources.map(x=>x.id));
  for (const i of content.items) {
    keys(i,['id','kind','title','description','parentId','status','criteria','weight','applicable','requiresEvidence','taskId','targetDate','estimatedDate','deadline','training','construction','confidence','assumptions','requiredLevel','verification']);
    need(ITEM_KINDS[i.kind] && PLAN_STATUSES[i.status], 'Tipo o estado inválido.'); text(i.title,160,true); text(i.description); text(i.assumptions); text(i.requiredLevel,500);
    need(i.parentId === null || (itemIds.has(i.parentId) && i.parentId !== i.id), 'La fase superior no existe.');
    if (i.parentId) need(['phase','milestone'].includes(content.items.find(x=>x.id===i.parentId).kind), 'El padre debe ser una fase o hito.');
    need(typeof i.applicable === 'boolean' && typeof i.requiresEvidence === 'boolean', 'Aplicabilidad o evidencia inválida.');
    need(i.weight === null || (Number.isFinite(i.weight) && i.weight > 0 && i.weight <= 100000), 'Peso positivo o sin definir.');
    need(['unknown','low','medium','high'].includes(i.confidence), 'Confianza inválida.'); range(i.training); range(i.construction);
    for(const k of ['targetDate','estimatedDate','deadline']) date(i[k]);
    need(i.taskId === null || state.tasks.some(t=>t.id===i.taskId && t.projectId===projectId), 'La tarea vinculada debe pertenecer a este proyecto.');
    need(Array.isArray(i.criteria) && i.criteria.length <= 30 && new Set(i.criteria.map(c=>c.id)).size === i.criteria.length, 'Criterios inválidos.');
    for(const c of i.criteria) { keys(c,['id','text']); id(c.id); text(c.text,500,true); }
    if (i.status === 'verified') { need(verificationReady(content,i), 'Faltan criterios, evidencia aprobada o dependencias por resolver.'); need(i.verification?.actor && i.verification?.at && i.verification?.method === 'human', 'Verificación humana obligatoria.'); }
    else need(i.verification === null, 'La verificación no coincide con el estado.');
  }
  need(!hasCycle(content.items.filter(i=>i.parentId).map(i=>[i.parentId,i.id]),itemIds), 'Hay un ciclo en la jerarquía.');
  for(const d of content.dependencies) { keys(d,['id','from','to','type','critical','reason','sourceId','author']); need(itemIds.has(d.from) && itemIds.has(d.to) && d.from!==d.to && DEPENDENCY_TYPES[d.type], 'Dependencia inválida.'); text(d.reason,2000,true); text(d.author,160,true); need(d.sourceId===null || sourceIds.has(d.sourceId),'Fuente de dependencia ausente.'); need(typeof d.critical==='boolean','Criticidad inválida.'); }
  need(!hasCycle(content.dependencies.filter(d=>d.type!=='informative').map(d=>[d.from,d.to]),itemIds),'Ciclo bloqueante: resuelve o reclasifica explícitamente una dependencia antes de aprobar.');
  for(const s of content.sources) { keys(s,['id','title','content','origin','version','url','date']); text(s.title,160,true); text(s.content,10000,true); need(['own','external','declaration'].includes(s.origin),'Procedencia inválida.'); text(s.version,80,true); safeUrl(s.url); date(s.date); }
  for(const e of content.evidence) {
    keys(e,['id','itemId','title','content','origin','method','sourceId','criteriaIds','url','file','review']); const item=content.items.find(i=>i.id===e.itemId); need(item,'Entregable de evidencia ausente.'); text(e.title,160,true); text(e.content,5000,true); need(['own','external','declaration'].includes(e.origin),'Procedencia inválida.'); need(['note','photo','measurement','test','file','link','manual'].includes(e.method),'Método inválido.'); refs(e.criteriaIds,new Set(item.criteria.map(c=>c.id))); need(e.sourceId===null || sourceIds.has(e.sourceId),'Fuente ausente.'); safeUrl(e.url);
    if(e.file) { keys(e.file,['taskId','path','version']); need(state.tasks.some(t=>t.id===e.file.taskId && t.projectId===projectId) || (e.review?.status==='obsolete' && !state.tasks.some(t=>t.id===e.file.taskId)),'Adjunto de otro proyecto.'); text(e.file.path,500,true); text(e.file.version,200,true); const parts=e.file.path.split('/'); need(parts.length===3 && parts.every(p=>p&&!p.includes('..')&&!p.includes('\\')) && parts[1]===e.file.taskId,'Ruta de adjunto inválida.'); }
    if(e.review) { keys(e.review,['status','actor','at','reason','method']); need(['approved','rejected','obsolete','incomplete'].includes(e.review.status),'Revisión inválida.'); text(e.review.actor,160,true); text(e.review.reason,2000,true); need(e.review.method==='human' && !Number.isNaN(Date.parse(e.review.at)),'Revisión humana inválida.'); if(e.review.status==='approved') need(e.origin==='own','Una referencia externa o declaración no verifica tu trabajo.'); }
  }
  for(const r of content.risks) { keys(r,['id','title','probability','impact','mitigation','owner','closeCondition','targetIds','open','blocking']); text(r.title,160,true); text(r.mitigation); text(r.owner,160,true); text(r.closeCondition,2000,true); need(['low','medium','high'].includes(r.probability)&&['low','medium','high'].includes(r.impact),'Riesgo inválido.'); refs(r.targetIds,itemIds); need(typeof r.open==='boolean'&&typeof r.blocking==='boolean','Bloqueo inválido.'); }
  for(const f of content.facts) { keys(f,['id','title','content','status','sourceIds','contradicts']); text(f.title,160,true); text(f.content,5000,true); need(['declared','assumed','contradicted','confirmed'].includes(f.status),'Estado del hecho inválido.'); refs(f.sourceIds,sourceIds); refs(f.contradicts,new Set(content.facts.filter(x=>x.id!==f.id).map(x=>x.id))); }
  for(const d of content.decisions) { keys(d,['id','title','content','author','sourceIds']); text(d.title,160,true); text(d.content,5000,true); text(d.author,160,true); refs(d.sourceIds,sourceIds); }
  return content;
}
export function newItem(input) {
  return { id:input.id,kind:'work',title:'',description:'',parentId:null,status:'pending',criteria:[],weight:null,applicable:true,requiresEvidence:true,taskId:null,targetDate:null,estimatedDate:null,deadline:null,training:null,construction:null,confidence:'unknown',assumptions:'',requiredLevel:'',verification:null,...input };
}
function invalidate(content) {
  // Cascade until all affected dependents are demoted, keeping prior versions intact.
  let changed;
  do { changed=false; for(const i of content.items) if(i.status==='verified'&&!verificationReady(content,i)) { i.status='correct';i.verification=null;changed=true; } } while(changed);
}
function checkOperations(operations) {
  need(Array.isArray(operations) && operations.length>0 && operations.length<=100,'Incluye entre 1 y 100 cambios.');
  const ids=new Set();
  for(const op of operations) { keys(op,['id','action','collection','targetId','value','reason','sourceIds','uncertainty','confidence']); id(op.id); need(!ids.has(op.id),'Operación duplicada.');ids.add(op.id); need(['add','edit','remove','reorder'].includes(op.action) && [...COLLECTIONS,'brief'].includes(op.collection),'Operación no admitida.'); text(op.reason,2000,true); text(op.uncertainty,2000); need(['unknown','low','medium','high'].includes(op.confidence),'Confianza inválida.'); need(Array.isArray(op.sourceIds)&&op.sourceIds.length<=30,'Fuentes inválidas.');
    if(op.collection==='brief') need(op.action==='edit'&&op.targetId===null,'Usa editar para el contexto del plan.'); else if(op.action!=='reorder') id(op.targetId);
    if(op.value && op.collection==='items') need(op.value.status!=='verified' && !op.value.verification,'Una propuesta no puede crear verificaciones.');
    if(op.value && op.collection==='evidence') need(!op.value.review,'La evidencia necesita una revisión humana separada.');
  }
}
export function proposalPreview(plan, proposal, selectedIds, state) {
  need(proposal.baseVersion===plan.activeVersion,'El plan cambió. Reconcilia la propuesta antes de aprobar.');
  refs(selectedIds,new Set(proposal.operations.map(o=>o.id))); need(selectedIds.length,'Selecciona al menos una operación.');
  const before=clone(currentContent(plan)), content=clone(before), changes=[];
  for(const op of proposal.operations.filter(o=>selectedIds.includes(o.id))) {
    let old=null;
    if(op.collection==='brief') { old=clone(content.brief); content.brief=clone(op.value); }
    else {
      const rows=content[op.collection], n=rows.findIndex(i=>i.id===op.targetId);old=n<0?null:clone(rows[n]);
      if(op.action==='add') { need(n<0&&op.value?.id===op.targetId,'El elemento ya existe o su ID no coincide.');rows.push(clone(op.value)); }
      if(op.action==='edit') { need(n>=0&&op.value?.id===op.targetId,'El elemento a editar no existe.');rows[n]=clone(op.value); }
      if(op.action==='remove') { need(n>=0,'El elemento a retirar no existe.');rows.splice(n,1); }
      if(op.action==='reorder') { refs(op.value,new Set(rows.map(i=>i.id))); need(op.value.length===rows.length,'El orden debe incluir todos los elementos.'); content[op.collection]=op.value.map(v=>rows.find(i=>i.id===v)); }
    }
    changes.push({operationId:op.id,collection:op.collection,action:op.action,before:old,after:op.action==='remove'?null:op.value,reason:op.reason});
  }
  // A review applies to the criteria and source revision actually inspected.
  // Clear it in the preview too, so approval shows the loss of coverage explicitly.
  for(const evidence of content.evidence) {
    const oldItem=before.items.find(i=>i.id===evidence.itemId), item=content.items.find(i=>i.id===evidence.itemId);
    const sourceChanged=evidence.sourceId && canonical(before.sources.find(s=>s.id===evidence.sourceId))!==canonical(content.sources.find(s=>s.id===evidence.sourceId));
    if(evidence.review?.status==='approved' && (sourceChanged || canonical(oldItem?.criteria)!==canonical(item?.criteria))) evidence.review=null;
  }
  invalidate(content); validateContent(content,plan.projectId,state);
  for(const op of proposal.operations.filter(o=>selectedIds.includes(o.id))) refs(op.sourceIds,new Set(content.sources.map(s=>s.id)));
  return {content,changes,beforeMetrics:planMetrics(before),afterMetrics:planMetrics(content),objectiveChanged:before.brief.objective!==content.brief.objective,scenario:scenario(content,proposal.scenarioStart || null)};
}
export function scenario(content, start) {
  if(!start) return {rows:[],warning:'Elige fecha inicial y disponibilidad para estimar. No se cambian fechas comprometidas.'}; date(start);
  const daily=content.brief.availability, rows=new Map(), active=new Set();
  const plus=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const visit=i=>{ if(rows.has(i.id))return rows.get(i.id); if(active.has(i.id))return null;active.add(i.id);
    const deps=content.dependencies.filter(d=>d.to===i.id&&d.type!=='informative'&&content.items.find(x=>x.id===d.from)?.status!=='verified').map(d=>visit(content.items.find(x=>x.id===d.from)));
    const hours=i.training&&i.construction?[i.training[0]+i.construction[0],i.training[1]+i.construction[1]]:null;
    const unknown=!daily||!hours||deps.some(d=>!d?.latest)||content.risks.some(r=>r.open&&r.blocking&&r.targetIds.includes(i.id));
    const earliestBase=deps.reduce((d,r)=>r?.earliest&&plus(r.earliest,1)>d?plus(r.earliest,1):d,start), latestBase=deps.reduce((d,r)=>r?.latest&&plus(r.latest,1)>d?plus(r.latest,1):d,start);
    const row={id:i.id,title:i.title,earliest:unknown?null:plus(earliestBase,Math.max(0,Math.ceil(hours[0]/daily)-1)),latest:unknown?null:plus(latestBase,Math.max(0,Math.ceil(hours[1]/daily)-1)),targetDate:i.targetDate,deadline:i.deadline,assumptions:i.assumptions,reason:unknown?'Sin estimar: faltan rangos, disponibilidad, dependencias o resolver bloqueo.':`Escenario a ${daily} h/día; dependientes al día siguiente del requisito pendiente, sin festivos ni paralelismo garantizado.`};
    rows.set(i.id,row);active.delete(i.id);return row; };
  content.items.forEach(visit);return {rows:[...rows.values()],warning:'Previsión con incertidumbre; no cambia fechas objetivo, estimadas ni límites.'};
}
function snapshot(plan, content, at) { plan.activeVersion++; plan.versions.push({version:plan.activeVersion,at,content:clone(content),metrics:planMetrics(content)}); }
export function executePlan(previous, command, state, actor, at) {
  id(command.id);text(actor,160,true);need(!Number.isNaN(Date.parse(at)),'Fecha de evento inválida.');
  need(JSON.stringify(command).length<=150000,'La propuesta es demasiado grande.');
  if(previous?.events.some(e=>e.id===command.id)) { need(canonical(previous.events.find(e=>e.id===command.id).command)===canonical(command),'Ese identificador ya se usó para otro cambio.');return clone(previous); }
  let plan=previous?clone(previous):null;
  if(command.type==='create') {
    need(!plan,'El proyecto ya tiene un plan.');id(command.projectId);id(command.planId);need(state.projects.some(p=>p.id===command.projectId),'Proyecto ausente.');
    plan={id:command.planId,projectId:command.projectId,modelVersion:1,revision:0,activeVersion:0,versions:[],proposals:[],events:[]};
    const content=blankContent(command.brief);validateContent(content,plan.projectId,state);snapshot(plan,content,at);
  } else {
    need(plan,'Crea primero el plan.');need(command.expectedRevision===plan.revision,'El plan cambió en otra acción o cliente. Revisa la versión actual.');
    const content=clone(currentContent(plan));
    if(command.type==='propose') {
      id(command.proposal.id);need(!plan.proposals.some(p=>p.id===command.proposal.id),'Propuesta repetida.');
      const p=command.proposal;keys(p,['id','title','baseVersion','operations','origin','provider','model','questions','uncertainties']);text(p.title,160,true);checkOperations(p.operations);need(p.baseVersion===plan.activeVersion,'Base obsoleta.');need(['human','ai'].includes(p.origin),'Origen inválido.');text(p.provider,100);text(p.model,120);text(p.questions,5000);text(p.uncertainties,5000);
      // No proposal can mutate the plan. Even a conflicting import can be inspected/rejected.
      plan.proposals.push({...clone(p),status:'pending',acceptedIds:[],actor,at});
    } else if(['approve','reject'].includes(command.type)) {
      const p=plan.proposals.find(x=>x.id===command.proposalId);need(p?.status==='pending','La propuesta ya fue resuelta.');text(command.reason,2000,true);
      if(command.type==='approve') { const preview=proposalPreview(plan,p,command.selectedIds,state);need(!preview.objectiveChanged||command.confirmObjective===true,'Confirma expresamente el cambio del objetivo.');snapshot(plan,preview.content,at);p.acceptedIds=[...command.selectedIds];p.status=command.selectedIds.length===p.operations.length?'accepted':'partial'; }
      else p.status='rejected';p.resolution={actor,at,reason:command.reason};
    } else if(command.type==='revise-proposal') {
      const old=plan.proposals.find(x=>x.id===command.proposalId);need(old?.status==='pending','La propuesta ya fue resuelta.');text(command.reason,2000,true);
      const revised=command.proposal;
      const checked=executePlan(plan,{id:command.id+'-check',type:'propose',expectedRevision:plan.revision,proposal:revised},state,actor,at);
      old.status='superseded';old.resolution={actor,at,reason:command.reason};plan.proposals.push(checked.proposals.at(-1));
    } else if(command.type==='rebase') {
      const old=plan.proposals.find(x=>x.id===command.proposalId);need(old&&['pending','partial'].includes(old.status),'No hay remanente para reconciliar.');id(command.newProposalId);need(!plan.proposals.some(p=>p.id===command.newProposalId),'ID repetido.');text(command.reason,2000,true);
      const operations=old.operations.filter(o=>!old.acceptedIds.includes(o.id));need(operations.length,'No quedan cambios.');old.status='superseded';plan.proposals.push({...clone(old),id:command.newProposalId,baseVersion:plan.activeVersion,operations,status:'pending',acceptedIds:[],actor,at,resolution:null});
    } else if(command.type==='evidence-review') {
      const e=content.evidence.find(x=>x.id===command.evidenceId);need(e,'Evidencia ausente.');text(command.reason,2000,true);need(['approved','rejected','obsolete','incomplete'].includes(command.status),'Revisión inválida.');need(command.status!=='approved'||(e.origin==='own'&&e.criteriaIds.length),'Se necesita evidencia propia vinculada a criterios.');e.review={status:command.status,actor,at,reason:command.reason,method:'human'};invalidate(content);validateContent(content,plan.projectId,state);snapshot(plan,content,at);
    } else if(command.type==='status') {
      const i=content.items.find(x=>x.id===command.itemId);need(i&&PLAN_STATUSES[command.status],'Elemento o estado inválido.');text(command.reason,2000,true);need(command.status!=='verified'||verificationReady(content,i),'Faltan criterios, evidencia aprobada o dependencias.');need(!['in_progress','completed','verified'].includes(command.status)||!blockers(content,i.id).length,'Resuelve las dependencias o el bloqueo primero.');i.status=command.status;i.verification=command.status==='verified'?{actor,at,method:'human',reason:command.reason}:null;invalidate(content);validateContent(content,plan.projectId,state);snapshot(plan,content,at);
    } else if(command.type==='file-changed') {
      text(command.path,500,true);text(command.reason,2000,true);
      for(const e of content.evidence) if(e.file?.path===command.path)e.review={status:'obsolete',actor,at,reason:command.reason,method:'human'};
      invalidate(content);validateContent(content,plan.projectId,state);snapshot(plan,content,at);
    } else if(command.type==='task-removed') {
      need(!state.tasks.some(t=>t.id===command.taskId),'La tarea todavía existe.');
      for(const i of content.items) if(i.taskId===command.taskId)i.taskId=null;
      for(const e of content.evidence) if(e.file?.taskId===command.taskId)e.review={status:'obsolete',actor,at,reason:'Tarea y adjunto eliminados.',method:'human'};
      invalidate(content);validateContent(content,plan.projectId,state);snapshot(plan,content,at);
    } else if(command.type==='restore') {
      text(command.reason,2000,true);const old=plan.versions.find(v=>v.version===command.version);need(old,'Versión ausente.');need(command.confirm===true,'Confirma la restauración como nueva versión.');const restored=clone(old.content);
      // Historical acceptance stays in its original version; restored evidence must be rechecked.
      for(const e of restored.evidence) if(e.review?.status==='approved')e.review={status:'incomplete',actor,at,method:'human',reason:'Evidencia restaurada: requiere una nueva revisión.'};
      invalidate(restored);validateContent(restored,plan.projectId,state);snapshot(plan,restored,at);
    } else throw new Error('Comando del plan no admitido.');
  }
  plan.revision++;plan.events.push({id:command.id,revision:plan.revision,version:plan.activeVersion,actor,at,type:command.type,command:clone(command)});
  need(plan.events.length<=500&&JSON.stringify(plan).length<=3000000,'El plan alcanzó el límite de historial. El cambio no se guardó y la historia se conserva. Exportar una copia no libera capacidad; se necesita ampliar el almacenamiento.');return plan;
}
export function validatePlans(state) {
  const plans=state?.projectPlans ?? [];need(Array.isArray(plans)&&plans.length<=100,'Colección de planes inválida.');need(new Set(plans.map(p=>p.projectId)).size===plans.length,'Solo un plan por proyecto.');need(new Set(plans.map(p=>p.id)).size===plans.length,'Identificador de plan duplicado.');
  for(const p of plans) { id(p.id);need(state.projects.some(x=>x.id===p.projectId)&&p.modelVersion===1,'Plan sin proyecto o versión no compatible.');need(Array.isArray(p.events)&&p.events.length>0&&p.events.length<=500&&Array.isArray(p.versions)&&p.versions.length>0&&Array.isArray(p.proposals),'Historial del plan inválido.');need(p.revision===p.events.length&&p.activeVersion===p.versions.length,'Versiones inconsistentes.');need(JSON.stringify(p).length<=3000000,'Plan demasiado grande.');validateContent(currentContent(p),p.projectId,state);
    need(new Set(p.events.map(e=>e.id)).size===p.events.length,'Evento duplicado.');
    p.events.forEach((e,n)=>need(e.revision===n+1&&e.actor&&e.command?.id===e.id&&!Number.isNaN(Date.parse(e.at)),'Evento inválido.'));
    p.versions.forEach((v,n)=>need(v.version===n+1&&canonical(v.metrics)===canonical(planMetrics(v.content)),'Métricas históricas o versión inválidas.'));
  }
}
// Server validation: replay only appended commands with authenticated identity.
// No client-supplied final percentage, verification or event edit is trusted.
export function validatePlanningTransition(previous, next, actor) {
  validatePlans(next);const before=previous?.projectPlans||[],after=next.projectPlans||[];
  for(const old of before) if(!after.some(p=>p.id===old.id)) need(!next.projects.some(p=>p.id===old.projectId),'No se puede borrar el historial de un plan existente.');
  for(const p of after) {
    const old=before.find(x=>x.id===p.id);need(!old||old.projectId===p.projectId,'El plan no puede cambiar de propietario o proyecto.');
    need(!old||canonical(p.events.slice(0,old.events.length))===canonical(old.events),'El historial no se puede reescribir.');
    let rebuilt=old?clone(old):null;
    for(const event of p.events.slice(old?.events.length||0)) { need(event.actor===actor,'Autor no autorizado. El historial local o de otra cuenta no se puede atribuir a esta sesión. Conserva la copia original; su importación necesita un registro explícito de procedencia.');rebuilt=executePlan(rebuilt,event.command,next,actor,event.at); }
    need(canonical(rebuilt)===canonical(p),'El estado no corresponde a sus comandos auditados.');
    for(const e of currentContent(p).evidence) if(e.file) need(e.file.path.startsWith(actor+'/'),'Archivo de otra cuenta.');
  }
}

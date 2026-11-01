import {createId} from '../utils/id.js';
import {currentContent,newItem,proposalPreview,canonical} from './engine.js';
import {parseProposalFile} from './provider.js';

export const planningCloudReady = () => import.meta.env?.VITE_WORKSPACE_PLANNING_CLOUD_READY === 'true';
const nil=v=>String(v||'').trim()||null;
const range=(a,b)=>{if(!a&&!b)return null;if(a===''||b===''||a===undefined||b===undefined)throw new Error('Indica mínimo y máximo del rango; deja ambos vacíos si aún no lo conoces.');return [Number(a),Number(b)];};
export function briefInput(d) {return {objective:d.objective.trim(),scope:d.scope||'',constraints:d.constraints||'',done:d.done||'',availability:nil(d.availability)===null?null:Number(d.availability),assumptions:d.assumptions||''};}
export function recordInput(collection,d,form,old) {
  const id=old?.id||createId('record'), all=name=>new FormData(form).getAll(name), yes=name=>form.elements[name]?.checked===true;
  if(collection==='items')return newItem({id,kind:d.kind,title:d.title,description:d.description,parentId:nil(d.parentId),status:old?.status==='verified'?'correct':old?.status||'pending',criteria:d.criteria.split('\n').map(s=>s.trim()).filter(Boolean).map((text,n)=>({id:old?.criteria[n]?.id||createId('criterion'),text})),weight:nil(d.weight)===null?null:Number(d.weight),applicable:yes('applicable'),requiresEvidence:yes('requiresEvidence'),taskId:nil(d.taskId),targetDate:nil(d.targetDate),estimatedDate:nil(d.estimatedDate),deadline:nil(d.deadline),training:range(d.trainingMin,d.trainingMax),construction:range(d.constructionMin,d.constructionMax),confidence:d.confidence,assumptions:d.assumptions,requiredLevel:d.requiredLevel});
  if(collection==='dependencies')return {id,from:d.from,to:d.to,type:d.type,critical:yes('critical'),reason:d.reason,sourceId:nil(d.sourceId),author:d.author};
  if(collection==='sources')return {id,title:d.title,content:d.content,origin:d.origin,version:d.version,url:d.url||'',date:nil(d.date)};
  if(collection==='evidence')return {id,itemId:d.itemId,title:d.title,content:d.content,origin:d.origin,method:d.method,sourceId:nil(d.sourceId),criteriaIds:all('criteriaIds'),url:d.url||'',file:d.filePath?{taskId:d.fileTaskId,path:d.filePath,version:d.fileVersion}:null,review:null};
  if(collection==='risks')return {id,title:d.title,probability:d.probability,impact:d.impact,mitigation:d.mitigation,owner:d.owner,closeCondition:d.closeCondition,targetIds:all('targetIds'),open:yes('open'),blocking:yes('blocking')};
  if(collection==='facts')return {id,title:d.title,content:d.content,status:d.status,sourceIds:all('sourceIds'),contradicts:all('contradicts')};
  if(collection==='decisions')return {id,title:d.title,content:d.content,author:d.author,sourceIds:all('sourceIds')};
  throw new Error('Tipo de registro no admitido.');
}
export function manualProposal(plan, operations, title='Cambio manual') {return {id:createId('proposal'),title,baseVersion:plan.activeVersion,operations,origin:'human',provider:'',model:'',questions:'',uncertainties:''};}
export function operation(collection,action,targetId,value,reason) {return {id:createId('operation'),collection,action,targetId,value,reason,sourceIds:[],uncertainty:'',confidence:'unknown'};}
export class PlanningController {
  constructor(workspace) {this.workspace=workspace;this.app=workspace.app;}
  get plan() {return this.app.repository.getState().projectPlans?.find(p=>p.projectId===this.app.router.current().projectId);}
  writable() {if(this.app.account&&!planningCloudReady())throw new Error('Falta habilitar el endpoint seguro del plan en este entorno. No se guardaron cambios cloud.');}
  async run(command,projectId=this.app.router.current().projectId) {this.writable();return this.app.repository.planCommand(projectId,{id:createId('plan-event'),...command},this.app.account?.id||'local');}
  async action(action,target) {
    if(!action.startsWith('plan-'))return false;
    const app=this.app,ui=app.ui,p=this.plan;
    if(action==='plan-tab'){ui.planTab=target.dataset.tab;ui.planEdit=null;ui.planComparison=null;}
    else if(action==='plan-edit'){ui.planEdit={collection:target.dataset.collection,id:target.dataset.entityId};}
    else if(action==='plan-edit-close')ui.planEdit=null;
    else if(action==='plan-refresh-draft') { const form=target.closest('form');form.dataset.planRevision=String(p.revision);this.workspace.drafts.capture(form);app.addToast('Base del borrador actualizada. Prepara la propuesta y revisa su antes/después antes de aprobar.'); }
    else if(action==='plan-files') {
      const form=target.closest('form'),taskId=form?.elements.fileTaskId?.value;
      await app.safely(async()=>{if(!app.fileStore)throw new Error('Los archivos privados requieren una cuenta conectada. Las notas y enlaces funcionan en modo local.');if(!app.repository.getState().tasks.some(t=>t.id===taskId&&t.projectId===p.projectId))throw new Error('Selecciona una tarea de este proyecto.');ui.planFiles={taskId,items:(await app.fileStore.list(taskId)).map(f=>({...f,path:app.fileStore.path(taskId,f.key)}))};});
    }
    else if(action==='plan-locate'){ui.planTab=currentContent(p).items.find(i=>i.id===target.dataset.entityId)?.kind==='knowledge'?'knowledge':'structure';}
    else if(action==='plan-export')app.downloadText(JSON.stringify({format:'studyhub-plan-archive-1',projectId:p.projectId,plan:p},null,2),'studyhub-plan-historial.json','application/json');
    else if(action==='plan-report'){const v=p.versions.at(-1);app.downloadText(`# Plan ${v.content.brief.objective}\n\nVersión ${v.version} · ${v.at}\n\nAvance verificable: ${v.metrics.advance??'Sin estimar'}\nCobertura: ${v.metrics.coverage??'Sin estimar'}\nAprendizaje: ${v.metrics.learning??'Sin evaluar'}\n\n${v.content.items.map(i=>`- ${i.title}: ${i.status}; peso ${i.weight??'sin definir'}`).join('\n')}\n\n## Historial\n${p.events.map(ev=>`- ${ev.at} · ${ev.type} · ${ev.actor}`).join('\n')}`,'studyhub-plan.md','text/markdown');}
    else if(action==='plan-template')app.downloadText(JSON.stringify({format:'studyhub-plan-proposal-1',proposal:manualProposal(p,[operation('items','add','example-item',newItem({id:'example-item',title:'Ejemplo: reemplaza por tu actividad'}),'Explica la razón del cambio')],'Plantilla de propuesta')},null,2),'studyhub-propuesta-plantilla.json','application/json');
    else if(action==='plan-remove') {
      // Removal is staged, never executed by this click. The proposal has its own review/approval.
      const ok=await app.safely(()=>this.run({type:'propose',expectedRevision:p.revision,proposal:manualProposal(p,[operation(target.dataset.collection,'remove',target.dataset.entityId,null,'Retirada solicitada; revisar relaciones antes de aprobar.')],'Retirar elemento')}));if(ok)ui.planTab='proposals';
    } else if(action==='plan-up') {
      const order=currentContent(p).items.map(i=>i.id),n=order.indexOf(target.dataset.entityId);if(n>0){[order[n-1],order[n]]=[order[n],order[n-1]];const ok=await app.safely(()=>this.run({type:'propose',expectedRevision:p.revision,proposal:manualProposal(p,[operation('items','reorder',null,order,'Reordenar la presentación de elementos.')],'Reordenar elementos')}));if(ok)ui.planTab='proposals';}
    }
    app.render();return true;
  }
  async submit(form,d) {
    if(!form.dataset.form?.startsWith('plan-'))return false;
    const app=this.app,ui=app.ui,p=this.plan,kind=form.dataset.form.slice(5),expectedRevision=Number(form.dataset.planRevision);
    const success=await app.safely(async()=>{
      if(kind==='scenario'){ui.planScenarioStart=d.start;return;}
      if(kind==='compare'){const a=p.versions.find(v=>v.version===Number(d.before)),b=p.versions.find(v=>v.version===Number(d.after));if(!a||!b)throw new Error('Versión ausente.');ui.planCompareBefore=a.version;ui.planCompareAfter=b.version;ui.planComparison={before:{version:a.version,metrics:a.metrics},after:{version:b.version,metrics:b.metrics},changes:Object.keys(a.content).filter(k=>canonical(a.content[k])!==canonical(b.content[k])).map(k=>({section:k,before:a.content[k],after:b.content[k]}))};return;}
      if(kind==='approval'&&d.planIntent==='preview'){ui.planSelection={id:form.dataset.proposalId,ids:[...form.elements].filter(el=>el.name?.startsWith('operation-')&&el.checked).map(el=>el.name.slice(10))};return;}
      if(kind==='create'){await this.run({type:'create',projectId:form.dataset.projectId,planId:createId('plan'),brief:briefInput(d)},form.dataset.projectId);return;}
      if(p?.revision!==expectedRevision)throw new Error('El plan cambió mientras editabas. Tu borrador se conserva; revisa la versión actual.');
      if(kind==='record'||kind==='brief') {
        if(form.dataset.collection==='evidence'&&d.filePath){const previous=currentContent(p).evidence.find(e=>e.id===form.dataset.entityId)?.file;const file=ui.planFiles?.items.find(f=>f.path===d.filePath);d.fileVersion=file?.updatedAt||(previous?.path===d.filePath?previous.version:'');}
        const collection=kind==='brief'?'brief':form.dataset.collection,old=kind==='brief'?null:currentContent(p)[collection].find(r=>r.id===form.dataset.entityId),record=kind==='brief'?briefInput(d):recordInput(collection,d,form,old);
        const proposal=manualProposal(p,[operation(collection,old||kind==='brief'?'edit':'add',record.id||null,record,d.changeReason)],kind==='brief'?'Cambiar contexto':`${old?'Editar':'Añadir'} ${record.title||'elemento'}`);
        await this.run({type:'propose',expectedRevision,proposal});ui.planTab='proposals';ui.planEdit=null;
      } else if(kind==='import'){const proposal=parseProposalFile(d.json,p);await this.run({type:'propose',expectedRevision,proposal});ui.planTab='proposals';}
      else if(kind==='revise-proposal'){const proposal=parseProposalFile(d.json,p);proposal.id=createId('proposal');await this.run({type:'revise-proposal',expectedRevision,proposalId:form.dataset.entityId,proposal,reason:d.reason});}
      else if(kind==='approval') {
        const selectedIds=[...form.elements].filter(el=>el.name?.startsWith('operation-')&&el.checked).map(el=>el.name.slice(10));
        if(d.planIntent==='approve')proposalPreview(p,p.proposals.find(x=>x.id===form.dataset.proposalId),selectedIds,app.repository.getState());
        await this.run({type:d.planIntent==='reject'?'reject':'approve',expectedRevision,proposalId:form.dataset.proposalId,selectedIds,reason:d.reason,confirmObjective:form.elements.confirmObjective.checked});ui.planSelection=null;
      } else if(kind==='status')await this.run({type:'status',expectedRevision,itemId:d.itemId,status:d.status,reason:d.reason});
      else if(kind==='evidence-review') {
        const evidence=currentContent(p).evidence.find(e=>e.id===d.evidenceId);
        if(d.status==='approved'&&evidence?.file){if(!app.fileStore)throw new Error('Conecta Storage para comprobar la versión del adjunto.');const files=await app.fileStore.list(evidence.file.taskId);const actual=files.find(f=>app.fileStore.path(evidence.file.taskId,f.key)===evidence.file.path);if(!actual||actual.updatedAt!==evidence.file.version)throw new Error('El archivo falta o cambió: registra su versión actual antes de aprobar.');}
        await this.run({type:'evidence-review',expectedRevision,evidenceId:d.evidenceId,status:d.status,reason:d.reason});
      } else if(kind==='rebase')await this.run({type:'rebase',expectedRevision,proposalId:d.proposalId,newProposalId:createId('proposal'),reason:d.reason});
      else if(kind==='restore')await this.run({type:'restore',expectedRevision,version:Number(d.version),reason:d.reason,confirm:form.elements.confirm.checked});
      else throw new Error('Acción desconocida.');
    });
    if(success){this.workspace.drafts.clear(form);this.workspace.formCaptureSuppressed=true;this.workspace.focus=null;app.render();if(!['scenario','compare'].includes(kind)&&d.planIntent!=='preview')app.addToast('Cambio guardado. Las propuestas requieren aprobación explícita.');}
    return true;
  }
}

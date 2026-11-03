import {createExportEnvelope} from '../data/schema.js';
import {sha256} from '../utils/integrity.js';
import {previewProjectReview,exportProjectReview} from './reviewExport.js';
import {planVersion} from './history.js';
import {createId} from '../utils/id.js';
import {currentContent,newItem,proposalPreview,catalogAdoptionPreview,canonical} from './engine.js';
import {parseProposalFile} from './provider.js';

export const planningCloudReady = () => import.meta.env?.VITE_WORKSPACE_PLANNING_CLOUD_READY === 'true';
const nil=v=>String(v||'').trim()||null;
const range=(a,b)=>{if(!a&&!b)return null;if(a===''||b===''||a===undefined||b===undefined)throw new Error('Indica mínimo y máximo del rango; deja ambos vacíos si aún no lo conoces.');return [Number(a),Number(b)];};
export function briefInput(d) {return {objective:d.objective.trim(),scope:d.scope||'',constraints:d.constraints||'',done:d.done||'',availability:nil(d.availability)===null?null:Number(d.availability),assumptions:d.assumptions||''};}
export function recordInput(collection,d,form,old) {
  const id=old?.id||createId('record'), all=name=>new FormData(form).getAll(name), yes=name=>form.elements[name]?.checked===true;
  if(collection==='items')return newItem({id,kind:d.kind,title:d.title,description:d.description,parentId:nil(d.parentId),status:old?.status==='verified'?'correct':old?.status||'pending',criteria:d.criteria.split('\n').map(s=>s.trim()).filter(Boolean).map((text,n)=>({id:old?.criteria[n]?.id||createId('criterion'),text})),weight:nil(d.weight)===null?null:Number(d.weight),applicable:yes('applicable'),requiresEvidence:yes('requiresEvidence'),taskId:nil(d.taskId),targetDate:nil(d.targetDate),estimatedDate:nil(d.estimatedDate),deadline:nil(d.deadline),training:range(d.trainingMin,d.trainingMax),construction:range(d.constructionMin,d.constructionMax),confidence:d.confidence,assumptions:d.assumptions,requiredLevel:d.requiredLevel,competencyId:nil(d.competencyId),exerciseIds:all('exerciseIds')});
  if(collection==='dependencies')return {id,from:d.from,to:d.to,type:d.type,critical:yes('critical'),reason:d.reason,sourceId:nil(d.sourceId),author:d.author};
  if(collection==='sources')return {id,title:d.title,content:d.content,origin:d.origin,version:d.version,url:d.url||'',date:nil(d.date)};
  if(collection==='evidence')return {id,itemId:d.itemId,title:d.title,content:d.content,origin:d.origin,method:d.method,sourceId:nil(d.sourceId),criteriaIds:all('criteriaIds'),url:d.url||'',file:d.filePath?{taskId:d.fileTaskId,path:d.filePath,version:d.fileVersion}:null,review:null,sharedEvidenceId:nil(d.sharedEvidenceId)};
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
    if(action==='plan-export-cancel'){this.exportController?.abort();}
    else if(action==='plan-history-page'){ui.planHistoryPage=Math.max(0,Number(target.dataset.page)||0);}
    else if(action==='plan-weekly-incident'){
      const review=app.repository.getState().projects.find(x=>x.id===p.projectId)?.weeklyReviews?.find(r=>r.id===target.dataset.reviewId);
      if(review?.improve)await app.safely(async()=>{const value={id:'incident-'+review.id,title:'Imprevisto declarado en revisión semanal',content:review.improve,author:app.account?.id||'local',sourceIds:[]};await this.run({id:'weekly-'+review.id,type:'propose',expectedRevision:p.revision,proposal:manualProposal(p,[operation('decisions','add',value.id,value,'Declaración del usuario; revisar impacto antes de aprobar.')],'Imprevisto de la semana')});ui.planTab='proposals';});
    }
    else if(action==='plan-delivery-edit'){ui.planDeliveryId=target.dataset.entityId||null;}
    else if(action==='plan-original-download'){
      await app.safely(async()=>{const exercise=app.repository.getState().exercises.find(x=>x.id===target.dataset.exerciseId&&x.projectId===p.projectId),file=exercise?.submissionVersions?.find(v=>v.version===Number(target.dataset.version))?.payload.files?.find(f=>f.key===target.dataset.fileKey);if(!file||!app.fileStore)throw new Error('Original no disponible en esta cuenta.');const bytes=await app.fileStore.downloadOriginal(file);app.downloadText(bytes,file.name,file.contentType);});
    }
    else if(action==='plan-tree-select'){ui.planSelected=target.dataset.entityId;}
    else if(action==='plan-tree-fold'){const folded=new Set(ui.planCollapsed||[]);folded.has(target.dataset.entityId)?folded.delete(target.dataset.entityId):folded.add(target.dataset.entityId);ui.planCollapsed=[...folded];}
    else if(action==='plan-tree-zoom'){ui.planZoom=Math.max(.4,Math.min(2,(ui.planZoom||1)+Number(target.dataset.step)));}
    else if(action==='plan-tree-reset'){ui.planZoom=1;ui.planCollapsed=[];ui.planSearch='';}
    else if(action==='plan-tab'){ui.planTab=target.dataset.tab;ui.planEdit=null;ui.planComparison=null;}
    else if(action==='plan-edit'){ui.planEdit={collection:target.dataset.collection,id:target.dataset.entityId};}
    else if(action==='plan-edit-close')ui.planEdit=null;
    else if(action==='plan-refresh-draft') { const form=target.closest('form');form.dataset.planRevision=String(p.revision);form.dataset.categoryRevision=String((app.repository.getState().categoryEvents||[]).length);if(form.elements?.exerciseId?.value)form.dataset.submissionVersion=String(app.repository.getState().exercises.find(x=>x.id===form.elements.exerciseId.value)?.submissionVersion||1);this.workspace.drafts.capture(form);app.addToast('Base del borrador actualizada. Prepara la propuesta y revisa su antes/después antes de aprobar.'); }
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
    if(this.submitting)return true;this.submitting=true;
    const success=await app.safely(async()=>{
      if(kind==='conversation'){
        const messageId=form.dataset.requestId||=createId('message'),sourceIds=new FormData(form).getAll('sourceIds');
        this.workspace.drafts.capture(form);
        const saved=p.conversations?.find(m=>m.id===messageId);
        if(!saved&&p.revision!==expectedRevision)throw new Error('El plan cambió; actualiza la base del borrador.');
        if(saved&&(saved.text!==d.text||canonical(saved.sourceIds)!==canonical(sourceIds)))throw new Error('Este mensaje ya se registró con otro contenido. Conserva su historial y crea otro mensaje.');
        const proposal=d.json?.trim()?parseProposalFile(d.json,p):null;
        if(!saved)await this.run({id:messageId+'-message',type:'conversation',expectedRevision,message:{id:messageId,text:d.text,sourceIds,baseVersion:p.activeVersion}});
        if(proposal&&!saved?.proposalId)await this.run({id:messageId+'-proposal',type:'conversation-proposal',expectedRevision:this.plan.revision,messageId,proposal});return;
      }
      if(kind==='review-export'){
        this.exportController=new AbortController();
        if(d.from&&d.to&&d.from>d.to)throw new Error('El período termina antes de comenzar.');
        const options={part:d.part?Number(d.part):null,itemId:d.itemId||null,from:d.from||null,to:d.to||null,...Object.fromEntries(['includeAcademic','includeCode','includeImages','includeOriginals'].map(key=>[key,form.elements[key].checked]))};
        if(d.planIntent==='preview-export'){
          const preview=await previewProjectReview(app.repository.getState(),form.dataset.projectId,options,app.fileStore);
          app.addToast(`Selección actual · ${preview.files} archivos conocidos · ${preview.parts} parte(s) · ${(preview.originalBytes/1048576).toFixed(2)} MiB de originales · ${(preview.jsonBytes/1024).toFixed(1)} KiB de JSON · ${preview.omissions} exclusiones detectadas.`,'info');return;
        }
        const result=await exportProjectReview(app.repository.getState(),form.dataset.projectId,options,app.fileStore,this.exportController.signal);
        const set=result.manifest.packageSet;app.downloadText(result.blob,set?`studyhub-${set.id.slice(0,12)}-${set.part}-de-${set.total}.zip`:'studyhub-proyecto-revision.zip','application/zip');app.addToast(result.manifest.completeWithinSelection?'Paquete generado dentro del alcance seleccionado.':'Paquete con exclusiones: consulta el manifiesto.','info');return;
      }
      if(kind==='delivery'){
        this.writable();form.dataset.requestId||=createId('submission-request');this.workspace.drafts.capture(form);const existing=app.repository.getState().exercises.find(x=>x.id===d.exerciseId&&x.projectId===form.dataset.projectId);let files=structuredClone(existing?.files||[]);
        for(const file of new FormData(form).getAll('originals').filter(f=>f?.size)){
          if(!app.fileStore)throw new Error('Los originales requieren almacenamiento privado conectado. Puedes guardar la entrega sin archivos.');
          const original=await app.fileStore.uploadOriginal(d.fileTaskId,file,{requestId:form.dataset.requestId});files=files.filter(f=>f.name?.normalize('NFC').toLowerCase()!==original.name.normalize('NFC').toLowerCase());files.push(original);
        }
        for(const recovered of await app.fileStore?.recoverOriginals(form.dataset.requestId)||[])if(!files.some(file=>file.name?.normalize('NFC').toLowerCase()===recovered.name.normalize('NFC').toLowerCase()))files.push(recovered);
        await app.repository.saveDelivery(form.dataset.projectId,{...d,requestId:form.dataset.requestId||=createId('submission-request'),expectedVersion:existing?(Number(form.dataset.submissionVersion)||1):null,exerciseId:d.exerciseId||null,itemIds:new FormData(form).getAll('itemIds'),competencyIds:new FormData(form).getAll('competencyIds'),files},app.account?.id||'local');app.fileStore?.acknowledgeOriginals(form.dataset.requestId);ui.planDeliveryId=null;return;
      }
      if(kind==='tree-search'){ui.planSearch=d.query;return;}
      if(kind.startsWith('category-')){if(Number(form.dataset.categoryRevision)!==(app.repository.getState().categoryEvents||[]).length)throw new Error('El catálogo cambió; revisa la categoría antes de guardar.');this.writable();const type=kind.slice(9);await app.repository.categoryCommand({id:createId('category-command'),type:type==='migrate'?'migrate':type,categoryId:d.categoryId||(type==='save'?createId('category'):null),name:d.name,icon:d.icon,color:d.color,collection:'projects',targetId:form.dataset.projectId,reassignTo:d.reassignTo||null,confirm:form.elements.confirm?.checked===true},app.account?.id||'local');return;}
      if(kind==='scenario'){ui.planScenarioStart=d.start;return;}
      if(kind==='compare'){const a=planVersion(p,Number(d.before)),b=planVersion(p,Number(d.after));if(!a||!b)throw new Error('Versión ausente.');ui.planCompareBefore=a.version;ui.planCompareAfter=b.version;ui.planComparison={before:{version:a.version,metrics:a.metrics},after:{version:b.version,metrics:b.metrics},changes:Object.keys(a.content).filter(k=>canonical(a.content[k])!==canonical(b.content[k])).map(k=>({section:k,before:a.content[k],after:b.content[k]}))};return;}
      if(kind==='approval'&&d.planIntent==='preview'){ui.planSelection={id:form.dataset.proposalId,ids:[...form.elements].filter(el=>el.name?.startsWith('operation-')&&el.checked).map(el=>el.name.slice(10))};return;}
      if(kind==='create'){await this.run({type:'create',modelVersion:2,projectId:form.dataset.projectId,planId:createId('plan'),brief:briefInput(d)},form.dataset.projectId);return;}
      if(p?.revision!==expectedRevision)throw new Error('El plan cambió mientras editabas. Tu borrador se conserva; revisa la versión actual.');
      if(['catalog-adopt','catalog-revert','upgrade-history'].includes(kind)){
        this.writable();
        const confirm=form.elements.confirm.checked;
        if(!confirm)throw new Error('Confirma la operación antes de continuar.');
        const type=kind==='catalog-adopt'?'adopt-catalog':kind==='catalog-revert'?'revert-catalog':'upgrade-history';
        const command={type,expectedRevision,confirm,reason:d.reason};
        if(type!=='revert-catalog'){
          const state=app.repository.getState();
          if(type==='adopt-catalog')command.mapping=d.mapping?.trim()?JSON.parse(d.mapping):{};
          const original=type==='adopt-catalog'?catalogAdoptionPreview(p,state,command.mapping).original:p;
          command.sourceHash=await sha256(canonical(original));
          const backup=createExportEnvelope(state);
          app.downloadText(JSON.stringify(backup,null,2),`studyhub-antes-de-${kind}-${command.sourceHash.slice(0,12)}.json`,'application/json');
        }
        await this.run(command);return;
      }
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
        if(d.status==='approved'&&evidence?.sharedEvidenceId){const shared=app.repository.getState().evidence.find(e=>e.id===evidence.sharedEvidenceId);for(const file of shared?.files||[]){if(!app.fileStore)throw new Error('Conecta el almacenamiento privado para comprobar los originales.');await app.fileStore.downloadOriginal(file);}}
        await this.run({type:'evidence-review',expectedRevision,evidenceId:d.evidenceId,status:d.status,reason:d.reason});
      } else if(kind==='rebase')await this.run({type:'rebase',expectedRevision,proposalId:d.proposalId,newProposalId:createId('proposal'),reason:d.reason});
      else if(kind==='restore')await this.run({type:'restore',expectedRevision,version:Number(d.version),reason:d.reason,confirm:form.elements.confirm.checked});
      else throw new Error('Acción desconocida.');
    });
    this.submitting=false;
    if(success){
      if(['preview','preview-export'].includes(d.planIntent))this.workspace.drafts.capture(form);else this.workspace.drafts.clear(form);
      this.workspace.formCaptureSuppressed=true;this.workspace.focus=null;app.render();
      if(!['scenario','compare','tree-search','review-export'].includes(kind)&&d.planIntent!=='preview')app.addToast('Cambio guardado. Las propuestas requieren aprobación explícita.');
    }
    return true;
  }
}

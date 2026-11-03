import {PlanningProvider} from './provider.js';
import {currentContent} from './engine.js';
// Transport injection is used only by tests until a provider is independently approved.
export class PlanningConversation {
  constructor(repository,{actor='local',provider=new PlanningProvider(),onState=()=>{}}={}){
    this.repository=repository;this.actor=actor;this.provider=provider;this.onState=onState;this.pending=null;
  }
  cancel(){this.pending?.abort();}
  async request(projectId,{id,text,sourceIds,consent}){
    if(this.pending)throw new Error('Ya hay una solicitud en curso.');
    const plan=this.repository.getState().projectPlans.find(p=>p.projectId===projectId);
    if(!plan)throw new Error('Plan ausente.');
    const saved=plan.conversations?.find(m=>m.id===id);
    if(saved&&(saved.text!==text||JSON.stringify(saved.sourceIds)!==JSON.stringify(sourceIds)))throw new Error('El identificador pertenece a otro mensaje.');
    if(saved?.proposalId)return saved;
    if(!this.provider.enabled||!this.provider.transport)throw new Error('IA del plan desactivada. Continúa con una propuesta manual.');
    const controller=new AbortController();this.pending=controller;
    try{
      if(!saved)await this.repository.planCommand(projectId,{id:id+'-message',type:'conversation',expectedRevision:plan.revision,message:{id,text,sourceIds,baseVersion:plan.activeVersion}},this.actor);
      this.onState({phase:'sending',id});
      const base=this.repository.getState().projectPlans.find(p=>p.projectId===projectId);
      this.onState({phase:'waiting',id});
      const proposal=await this.provider.suggest({plan:base,state:this.repository.getState(),context:text,sourceIds,consent,signal:controller.signal});
      this.onState({phase:'received',id});controller.signal.throwIfAborted();
      const current=this.repository.getState().projectPlans.find(p=>p.projectId===projectId);
      if(current.activeVersion!==base.activeVersion)throw new Error('La versión cambió. No se aplicó ni guardó una propuesta obsoleta.');
      this.onState({phase:'processing',id});
      await this.repository.planCommand(projectId,{id:id+'-proposal',type:'conversation-proposal',expectedRevision:current.revision,messageId:id,proposal},this.actor);
      this.onState({phase:'ready',id});return proposal;
    }catch(error){this.onState({phase:controller.signal.aborted?'cancelled':'error',id,message:error.message});throw error;}
    finally{this.pending=null;}
  }
}
export function selectedConversationContext(plan,ids){
  const sources=currentContent(plan).sources.filter(s=>ids.includes(s.id));
  if(sources.length!==new Set(ids).size)throw new Error('Hay fuentes fuera del proyecto.');
  return sources.map(({id,title,version,origin,content})=>({id,title,version,origin,content}));
}

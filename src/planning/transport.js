import {canonical,executePlan} from './engine.js';
import {sha256} from '../utils/integrity.js';

// The queue retains a durable snapshot; the network sends only appended commands.
// The server reconstructs and validates the authoritative result before CAS.
export async function packPlanningState(state,previousPlans=[]){
  const plans=await Promise.all((state.projectPlans||[]).map(async plan=>{
    if(plan.modelVersion!==2)return plan;
    const previous=previousPlans.find(p=>p.id===plan.id);
    if(previous&&canonical(plan.events.slice(0,previous.events.length))!==canonical(previous.events))throw new Error('El historial cambió; conserva tu copia y reconcilia.');
    return {transportVersion:1,id:plan.id,projectId:plan.projectId,baseRevision:previous?.revision??null,events:plan.events.slice(previous?.events.length||0),sha256:await sha256(canonical(plan))};
  }));
  return {...state,projectPlans:plans};
}

export async function unpackPlanningState(state,previous,actor){
  if(!state||!Array.isArray(state.projectPlans))return state;
  const plans=[];
  for(const descriptor of state.projectPlans){
    if(!descriptor.transportVersion){plans.push(descriptor);continue;}
    if(descriptor.transportVersion!==1||Object.keys(descriptor).some(key=>!['transportVersion','id','projectId','baseRevision','events','sha256'].includes(key))||!Array.isArray(descriptor.events)||!/^[a-f0-9]{64}$/.test(descriptor.sha256))throw new Error('Formato de comandos no compatible.');
    const old=previous?.projectPlans?.find(p=>p.id===descriptor.id);
    // Recover an acknowledgement lost after a successful write.
    if(old&&await sha256(canonical(old))===descriptor.sha256){plans.push(old);continue;}
    if((old?.revision??null)!==descriptor.baseRevision)throw Object.assign(new Error('La base del plan cambió. Conserva tu copia y reconcilia.'),{code:'STUDYHUB_CONFLICT',status:409});
    let plan=old??null;
    for(const event of descriptor.events){
      if(event.actor!==actor)throw new Error('Autor no autorizado en el envío de comandos.');
      plan=executePlan(plan,event.command,state,actor,event.at);
    }
    if(!plan||plan.id!==descriptor.id||plan.projectId!==descriptor.projectId||await sha256(canonical(plan))!==descriptor.sha256)throw new Error('El resultado no coincide con los comandos enviados.');
    plans.push(plan);
  }
  return {...state,projectPlans:plans};
}

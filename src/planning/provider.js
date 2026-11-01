import { currentContent, executePlan } from './engine.js';

// No live transport is installed. A configured future provider must return a
// proposal, never a plan mutation. Context is explicitly selected by the user.
export class PlanningProvider {
  constructor({ enabled = false, transport = null } = {}) { this.enabled=enabled; this.transport=transport; }
  async suggest({plan,state,context,sourceIds,consent,signal}) {
    if (!this.enabled || !this.transport) throw new Error('IA del plan desactivada. Puedes crear o importar una propuesta manual.');
    if (!consent) throw new Error('Autoriza el contexto que deseas enviar.');
    if(signal?.aborted)throw new Error('Solicitud cancelada; no se envió contexto.');
    if (typeof context!=='string'||context.length>12000) throw new Error('Contexto demasiado largo.');
    if(!Array.isArray(sourceIds)||sourceIds.length>20||new Set(sourceIds).size!==sourceIds.length)throw new Error('Selecciona hasta 20 fuentes sin repetir.');
    const sources=currentContent(plan).sources.filter(s=>sourceIds.includes(s.id));
    if(sources.length!==sourceIds.length)throw new Error('Fuente fuera del plan.');
    const result=await this.transport({baseVersion:plan.activeVersion,context,sources,signal});
    if(signal?.aborted)throw new Error('Solicitud cancelada; propuesta no guardada.');
    if(result?.origin!=='ai'||!result.provider?.trim()||!result.model?.trim())throw new Error('La propuesta de IA debe identificar proveedor y modelo.');
    // The normal command path validates the untrusted output, including prohibition
    // of verified states. Caller still needs to explicitly save/review/approve it.
    executePlan(plan,{id:'provider-validation',type:'propose',expectedRevision:plan.revision,proposal:result},state,'validation',new Date().toISOString());
    return result;
  }
}

export function parseProposalFile(text, plan) {
  if (typeof text!=='string'||text.length>150000) throw new Error('Máximo 150 KB de texto JSON.');
  let value;try{value=JSON.parse(text);}catch{throw new Error('El JSON de propuesta no es válido.');}
  if(value.app==='StudyHub'||value.data)throw new Error('Esto es una copia completa. Usa Restaurar copia JSON en Configuración.');
  if(value.format!=='studyhub-plan-proposal-1'||!value.proposal)throw new Error('Formato requerido: studyhub-plan-proposal-1.');
  if(value.proposal.baseVersion!==plan.activeVersion)throw new Error('La versión base no coincide; revisa y adapta la propuesta.');
  return value.proposal;
}

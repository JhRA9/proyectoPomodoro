import {createEmptyState} from '../../src/data/schema.js';
import {defaultEvaluationConfig} from '../../src/evaluation/constants.js';
import {executePlan,newItem} from '../../src/planning/engine.js';

// Deliberately fictional Cubo LED fixture. Never imported into a real account.
export function planningFixture(actor='synthetic-owner') {
  const at='2026-10-31T12:00:00.000Z', state=createEmptyState(new Date(at));
  state.projects.push({id:'synthetic-cube',name:'Cubo LED SINTETICO',description:'Fixture, no montaje real',icon:'folder',color:'#7657ff',createdAt:at,status:'active',completedAt:null,projectType:'general',evaluationConfig:defaultEvaluationConfig()});
  state.tasks.push({id:'synthetic-task',projectId:'synthetic-cube',title:'Actividad SINTETICA',description:'',status:'pending',dueDate:null,accumulatedSeconds:0,createdAt:at,completedAt:null});
  let sequence=0;
  const apply=command=>{
    const previous=state.projectPlans[0];const c={id:`event-${++sequence}`,expectedRevision:previous?.revision,...command};
    if(c.type==='create')delete c.expectedRevision;
    const plan=executePlan(previous,c,state,actor,at);state.projectPlans=[plan];state.revision++;return plan;
  };
  apply({type:'create',projectId:'synthetic-cube',planId:'synthetic-plan',brief:{objective:'Prototipo SINTETICO',scope:'Prueba de reglas',done:'Criterios revisados',availability:2}});
  const op=(collection,action,targetId,value,reason='Cambio sintético para prueba')=>({id:`op-${++sequence}`,collection,action,targetId,value,reason,sourceIds:[],uncertainty:'Fixture sin hechos reales',confidence:'low'});
  const propose=operations=>{const proposal={id:`proposal-${++sequence}`,title:'Propuesta SINTETICA',baseVersion:state.projectPlans[0].activeVersion,operations,origin:'human',provider:'',model:'',questions:'',uncertainties:'No es el proyecto real'};apply({type:'propose',proposal});return proposal;};
  const approve=(proposal,selectedIds=proposal.operations.map(o=>o.id))=>apply({type:'approve',proposalId:proposal.id,selectedIds,reason:'Revisado en fixture',confirmObjective:true});
  const add=(collection,value)=>{const p=propose([op(collection,'add',value.id,value)]);approve(p);return value;};
  const item=(id='piece',extra={})=>newItem({id,kind:'deliverable',title:'Pieza SINTETICA',weight:2,criteria:[{id:`${id}-criterion`,text:'Medición sintética registrada'}],...extra});
  const evidence=(id='proof',itemId='piece',extra={})=>({id,itemId,title:'Medición SINTETICA',content:'Dato de fixture; no prueba física',origin:'own',method:'measurement',sourceId:null,criteriaIds:[`${itemId}-criterion`],url:'',file:null,review:null,...extra});
  const verify=(itemId='piece')=>{add('evidence',evidence('proof-'+itemId,itemId));apply({type:'evidence-review',evidenceId:'proof-'+itemId,status:'approved',reason:'Revisión humana sintética'});apply({type:'status',itemId,status:'verified',reason:'Aceptación sintética'});};
  return {state,apply,op,propose,approve,add,item,evidence,verify,at,actor};
}

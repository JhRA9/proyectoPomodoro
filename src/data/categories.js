import { createId } from '../utils/id.js';
const need=(ok,message)=>{if(!ok)throw new Error(message);};
const safeId=id=>typeof id==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id);
export function validateCategories(state) {
  const categories=state.categories||[], ids=new Set();
  need(Array.isArray(categories)&&categories.length<=2000,'Catálogo de categorías inválido.');
  for(const c of categories){
    need(safeId(c.id)&&!ids.has(c.id),'ID de categoría inválido o repetido.');ids.add(c.id);
    need(typeof c.name==='string'&&c.name.trim()&&c.name.length<=60&&/^#[0-9a-f]{6}$/i.test(c.color)&&/^[a-z-]{1,24}$/.test(c.icon),'Nombre, icono o color inválido.');
  }
  for(const row of [...(state.tasks||[]),...(state.projects||[])])need(!row.categoryId||ids.has(row.categoryId),'La categoría referenciada no existe.');
}
export function categoryReferences(state,id){return {tasks:state.tasks.filter(t=>t.categoryId===id),projects:state.projects.filter(p=>p.categoryId===id)};}
export function categoryCommand(state,command,actor,at){
  const categories=state.categories??=[], events=state.categoryEvents??=[];
  need(safeId(command.id),'Comando de categoría inválido.');
  const existing=events.find(e=>e.id===command.id);
  if(existing){need(JSON.stringify(existing.command)===JSON.stringify(command),'ID de comando reutilizado.');return;}
  if(command.type==='migrate'){
    need(command.confirm===true,'Confirma la adopción de etiquetas antiguas.');
    for(const task of state.tasks.filter(t=>t.category&&!t.categoryId)){
      let category=categories.find(c=>c.provenance?.projectId===task.projectId&&c.provenance?.label===task.category);
      if(!category){category={id:createId('category'),name:task.category,icon:'folder',color:'#7657ff',provenance:{kind:'legacy-label',projectId:task.projectId,label:task.category,actor,at}};categories.push(category);}
      task.categoryId=category.id;
    }
    state.categoryModelVersion=1;
  }else if(command.type==='save'){
    const old=categories.find(c=>c.id===command.categoryId);
    const value={id:command.categoryId,name:String(command.name||'').trim(),icon:command.icon,color:command.color};
    if(old)Object.assign(old,value);else categories.push({...value,provenance:{kind:'manual',actor,at}});
    for(const task of state.tasks.filter(t=>t.categoryId===value.id))task.category=value.name;
  }else if(command.type==='assign'){
    need(['tasks','projects'].includes(command.collection),'Destino inválido.');
    const row=state[command.collection].find(r=>r.id===command.targetId);need(row,'Destino ausente.');
    row.categoryId=command.categoryId||null;
    if(command.collection==='tasks')row.category=categories.find(c=>c.id===row.categoryId)?.name||'';
  }else if(command.type==='delete'){
    need(command.confirm===true,'Confirma eliminar la categoría.');
    const old=categories.find(c=>c.id===command.categoryId);need(old,'La categoría no existe.');
    const replacement=categories.find(c=>c.id===command.reassignTo&&c.id!==old.id);
    need(!command.reassignTo||replacement,'La categoría de reasignación no existe.');
    const affected=categoryReferences(state,old.id);
    need(!affected.tasks.length&&!affected.projects.length||Object.hasOwn(command,'reassignTo'),'Elige otra categoría o Sin categoría.');
    for(const row of [...affected.tasks,...affected.projects])row.categoryId=replacement?.id||null;
    for(const task of affected.tasks)task.category=replacement?.name||'';
    categories.splice(categories.indexOf(old),1);
    events.push({id:command.id,command:structuredClone(command),actor,at,archived:structuredClone(old)});validateCategories(state);return;
  }else throw new Error('Acción de categoría desconocida.');
  validateCategories(state);events.push({id:command.id,command:structuredClone(command),actor,at});
}

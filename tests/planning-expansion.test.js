import {describe,it,expect} from 'vitest';
import {planningFixture} from './helpers/planningFixture.js';
import {categoryCommand,validateCategories} from '../src/data/categories.js';
import {catalogAdoptionPreview,currentContent,validatePlanningTransition} from '../src/planning/engine.js';
import {treeProjection} from '../src/planning/tree.js';

describe('planning integration',()=>{
  it('adopts a historical catalog explicitly without promoting old verification or losing history',()=>{
    const f=planningFixture();
    f.state.deliveryStages=[{id:'old-stage',projectId:'synthetic-cube',title:'Etapa anterior'}];
    f.state.deliverables=[{id:'old-delivery',projectId:'synthetic-cube',stageId:'old-stage',title:'Resultado anterior',status:'verified',weight:5,dependencyIds:[],verifiedAt:f.at,unknown:'Preservar'}];
    const previous=structuredClone(f.state),preview=catalogAdoptionPreview(f.state.projectPlans[0],f.state);
    expect(preview.after.advance).toBeNull();
    f.apply({type:'adopt-catalog',confirm:true,reason:'Adopción revisada'});
    expect(currentContent(f.state.projectPlans[0]).items.find(i=>i.id==='old-delivery').status).toBe('completed');
    expect(f.state.deliverables).toEqual(previous.deliverables);
    expect(f.state.projectPlans[0].catalog.original.deliverables).toEqual(previous.deliverables);
    expect(()=>validatePlanningTransition(previous,f.state,f.actor)).not.toThrow();
    const adopted=structuredClone(f.state);f.state.deliverables[0].weight=99;
    expect(()=>validatePlanningTransition(adopted,f.state,f.actor)).toThrow(/archivado/);
    f.state.deliverables=structuredClone(adopted.deliverables);
    f.apply({type:'revert-catalog',confirm:true,reason:'Revertir antes de editar'});
    expect(f.state.projectPlans[0].catalog.mode).toBe('legacy');
    expect(f.state.projectPlans[0].events.length).toBe(3);
  });
  it('preserves valid verification on renaming and invalidates only changed acceptance criteria',()=>{
    const f=planningFixture();f.add('items',f.item());f.add('items',f.item('other'));f.verify();f.verify('other');
    let item=structuredClone(currentContent(f.state.projectPlans[0]).items[0]);
    item.title='Nombre más claro';item.status='correct';item.verification=null;
    f.approve(f.propose([f.op('items','edit',item.id,item)]));
    expect(currentContent(f.state.projectPlans[0]).items[0].status).toBe('verified');
    item.criteria[0].text='Criterio modificado';f.approve(f.propose([f.op('items','edit',item.id,item)]));
    const items=currentContent(f.state.projectPlans[0]).items;
    expect(items[0].status).toBe('correct');expect(items[1].status).toBe('verified');
  });
  it('migrates category labels without merging unrelated projects and supports safe reassignment',()=>{
    const f=planningFixture(),state=f.state;state.tasks[0].category='Matemáticas';state.tasks.push({...state.tasks[0],id:'other-task',projectId:'another-project'});
    categoryCommand(state,{id:'migrate-1',type:'migrate',confirm:true},'local',f.at);
    expect(state.categories).toHaveLength(2);const first=state.categories[0],second=state.categories[1];
    categoryCommand(state,{id:'assign-1',type:'assign',collection:'projects',targetId:state.projects[0].id,categoryId:first.id},'local',f.at);
    expect(()=>categoryCommand(state,{id:'delete-1',type:'delete',categoryId:first.id,confirm:true},'local',f.at)).toThrow(/Elige/);
    categoryCommand(state,{id:'delete-2',type:'delete',categoryId:first.id,reassignTo:second.id,confirm:true},'local',f.at);
    expect(state.tasks[0].categoryId).toBe(second.id);expect(state.projects[0].categoryId).toBe(second.id);
    expect(state.categoryEvents.at(-1).archived.id).toBe(first.id);
    expect(()=>validateCategories(state)).not.toThrow();
  });
  it('explores hierarchy and cross dependencies without mutating the plan',()=>{
    const f=planningFixture();f.add('items',f.item('goal',{kind:'objective'}));f.add('items',f.item('task',{kind:'work',parentId:'goal'}));
    const content=currentContent(f.state.projectPlans[0]),before=JSON.stringify(content);
    expect(treeProjection(content,{collapsed:['goal']}).nodes.map(n=>n.id)).toEqual(['goal']);
    expect(treeProjection(content,{collapsed:['goal'],search:'PIEZA'}).nodes).toHaveLength(2);
    expect(treeProjection(content).next.id).toBe('task');expect(JSON.stringify(content)).toBe(before);
  });
});

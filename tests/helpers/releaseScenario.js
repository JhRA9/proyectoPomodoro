import {planningFixture} from './planningFixture.js';

// Fictitious acceptance scenario; never imports the student's project.
export function releaseScenario(){
  const f=planningFixture('local');
  f.apply({type:'upgrade-history',confirm:true,reason:'Prueba de aceptación aislada'});
  const rows=[
    ['cube','objective','Cubo LED · ensayo aislado',null],
    ['mechanical','phase','Montaje mecánico','cube'],
    ['plate','deliverable','Validar la placa de 293 mm','mechanical'],
    ['assembly','work','Comprobar el montaje en seco','mechanical'],
    ['electric','deliverable','Verificar electrónica y montaje','cube'],
    ['software','subobjective','Simulador de figuras','cube'],
    ['virtual','deliverable','Probar figuras sin hardware','software'],
    ['diagnose','subtask','Diagnóstico propio de Python','software'],
    ['python','knowledge','Python','software'],['electronics','knowledge','Electrónica','cube']
  ];
  const ops=rows.map(([id,kind,title,parentId])=>f.op('items','add',id,f.item(id,{kind,title,parentId,weight:null})));
  for(const [from,to] of [['plate','assembly'],['assembly','electric'],['python','virtual'],['electronics','electric']]){
    const id=from+'-'+to;ops.push(f.op('dependencies','add',id,{id,from,to,type:'blocking',critical:true,reason:'Requisito pendiente de verificación propia',sourceId:null,author:'Fixture'}));
  }
  f.approve(f.propose(ops));
  f.add('sources',{id:'tutorial',title:'Referencia del tutorial',origin:'external',content:'Referencia de montaje, no medición propia.',version:'1',date:'2026-10-31',url:''});
  f.add('evidence',f.evidence('tutorial-frame','plate',{origin:'external',sourceId:'tutorial'}));
  return f;
}

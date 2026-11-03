import { blockers } from './engine.js';
// View projection only: coordinates and expansion never become planning commands.
export function treeProjection(content, { collapsed=[], search='' }={}) {
  const hidden=new Set(), folded=new Set(collapsed), children=new Map();
  for(const item of content.items){const key=item.parentId||null;if(!children.has(key))children.set(key,[]);children.get(key).push(item);}
  const stack=[...(children.get(null)||[])].reverse().map(item=>({item,depth:0,hidden:false})), nodes=[];
  let cursorY=24;
  const query=search.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim();
  while(stack.length){
    const row=stack.pop(), {item,depth}=row;
    if(row.hidden)hidden.add(item.id);
    const match=!query||`${item.title} ${item.description}`.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().includes(query);
    if(!row.hidden||query){if(match){const height=Math.max(140,Math.ceil([...item.title].length/14)*24+100);nodes.push({...item,depth,x:24+depth*260,y:cursorY,height,hasChildren:children.has(item.id),blockers:blockers(content,item.id)});cursorY+=height+20;}}
    for(const child of [...(children.get(item.id)||[])].reverse())stack.push({item:child,depth:depth+1,hidden:row.hidden||folded.has(item.id)});
  }
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const edges=content.dependencies.filter(d=>byId.has(d.from)&&byId.has(d.to)).map(d=>({...d,source:byId.get(d.from),target:byId.get(d.to)}));
  const next=content.items.find(i=>['work','subtask'].includes(i.kind)&&!['completed','verified'].includes(i.status)&&!blockers(content,i.id).length);
  return {nodes,edges,next,width:Math.max(320,...nodes.map(n=>n.x+248)),height:Math.max(180,cursorY+24)};
}

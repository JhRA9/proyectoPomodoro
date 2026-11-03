import {sha256} from '../utils/integrity.js';
// Local durable segments; a transaction commits the state pointer together with
// all referenced events/checkpoints. No event is removed during compaction.
const DB_NAME='studyhub-planning-archive-2';
export class PlanningArchiveStore {
  constructor(indexedDB=globalThis.indexedDB,namespace=''){this.indexedDB=indexedDB;this.namespace=namespace?namespace+':':'';}
  async database(){
    if(!this.indexedDB)throw new Error('Este navegador no dispone de almacenamiento para historiales extensos. Conserva tu copia.');
    return new Promise((resolve,reject)=>{const request=this.indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  }
  async save(state,expectedRevision=undefined,slot='current'){
    const snapshot=structuredClone(state),records=[];
    const record=async(prefix,value)=>{const key=prefix+await sha256(JSON.stringify(value));records.push([key,value]);return key;};
    snapshot.projectPlans=await Promise.all((state.projectPlans||[]).map(async plan=>{
      const {events,versions,...head}=plan;
      const eventKeys=await Promise.all(events.map(event=>record('event:',event)));
      const versionKeys=await Promise.all(versions.map(version=>record('version:',version)));
      return {archiveKey:await record('head:',{...head,eventKeys,versionKeys})};
    }));
    const db=await this.database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
      for(const [key,value] of records)store.put(value,key);
      const previous=store.get(this.namespace+slot);previous.onsuccess=()=>{if(expectedRevision!==undefined&&(previous.result?.revision??null)!==expectedRevision){tx.abort();return;}if(previous.result)store.put(previous.result,this.namespace+(slot==='current'?'backup':slot+':backup'));store.put(snapshot,this.namespace+slot);};
      tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(new Error('No se pudo guardar el historial; la versión anterior permanece intacta.',{cause:tx.error}));};tx.onerror=()=>{};
    });
  }
  async remove(slot,expected=null){
    const db=await this.database();return new Promise((resolve,reject)=>{
      const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');let removed=false;
      const current=store.get(this.namespace+slot);current.onsuccess=()=>{
        if(expected&&(current.result?.revision!==expected.revision||current.result?.archiveQueue?.writerId!==expected.writerId))return;
        store.delete(this.namespace+slot);removed=true;
      };
      tx.oncomplete=()=>{db.close();resolve(removed);};tx.onabort=()=>{db.close();reject(tx.error);};
    });
  }
  async load(key='current'){
    const db=await this.database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('records','readonly'),store=tx.objectStore('records');let result;const loaded=[];
      const fail=()=>{try{tx.abort();}catch{}};
      const request=store.get(this.namespace+key);request.onsuccess=()=>{
        result=request.result;if(!result)return;
        result.projectPlans.forEach((ref,index)=>{
          const head=store.get(ref.archiveKey);head.onsuccess=()=>{
            if(!head.result){fail();return;}
            loaded.push([ref.archiveKey,head.result]);const {eventKeys,versionKeys,...plan}=head.result;plan.events=new Array(eventKeys.length);plan.versions=new Array(versionKeys.length);result.projectPlans[index]=plan;
            for(const [keys,field] of [[eventKeys,'events'],[versionKeys,'versions']])keys.forEach((id,n)=>{const row=store.get(id);row.onsuccess=()=>{if(!row.result){fail();return;}loaded.push([id,row.result]);plan[field][n]=row.result;};});
          };
        });
      };
      tx.oncomplete=async()=>{db.close();try{for(const [key,value] of loaded)if(!key.endsWith(await sha256(JSON.stringify(value))))throw new Error('La integridad de un segmento no coincide.');resolve(result||null);}catch(error){reject(error);}};tx.onabort=()=>{db.close();reject(new Error('Falta un segmento del historial. Conserva los datos y utiliza una copia verificada.'));};tx.onerror=()=>{};
    });
  }
}

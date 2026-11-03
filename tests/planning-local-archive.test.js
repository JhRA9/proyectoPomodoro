import {CloudStorageAdapter} from '../src/data/cloudAdapter.js';
import {IDBFactory} from 'fake-indexeddb';
import {describe,it,expect} from 'vitest';
import {PlanningArchiveStore} from '../src/data/planningArchiveStore.js';
import {LocalStorageAdapter,PLANNING_STORAGE_KEY} from '../src/data/localAdapter.js';
import {planningFixture} from './helpers/planningFixture.js';

const storage=()=>{const m=new Map();return {getItem:key=>m.get(key)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
describe('durable local planning segments',()=>{
  it('atomically reconstructs versions after reload and retains the previous pointer',async()=>{
    const f=planningFixture();f.add('items',f.item());f.apply({type:'upgrade-history',confirm:true,reason:'Local checkpoint'});
    const idb=new IDBFactory(),archive=new PlanningArchiveStore(idb),local=storage(),adapter=new LocalStorageAdapter(local,archive);
    await adapter.save(f.state);const before=structuredClone(f.state);expect(local.getItem(PLANNING_STORAGE_KEY)).toBe(String(f.state.revision));
    f.apply({type:'status',itemId:'piece',status:'in_progress',reason:'Sesión'});await adapter.save(f.state);
    const reloaded=new LocalStorageAdapter(local,new PlanningArchiveStore(idb));expect((await reloaded.load()).data.projectPlans).toEqual(f.state.projectPlans);
    expect(await archive.load('backup')).toEqual(before);
  });
  it('rejects a stale client without overwriting current data or backup',async()=>{
    const f=planningFixture(),archive=new PlanningArchiveStore(new IDBFactory());await archive.save(f.state,null);const before=structuredClone(f.state);
    f.state.revision++;await archive.save(f.state,before.revision);const stored=await archive.load();
    await expect(archive.save({...f.state,revision:f.state.revision+1},before.revision)).rejects.toThrow(/versión anterior/);
    expect(await archive.load()).toEqual(stored);expect(await archive.load('backup')).toEqual(before);
  });
  it('detects a corrupted segment instead of returning an apparently valid history',async()=>{
    const f=planningFixture(),archive=new PlanningArchiveStore(new IDBFactory());await archive.save(f.state,null);
    const db=await archive.database();await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),keys=store.getAllKeys();keys.onsuccess=()=>store.put({corrupted:true},keys.result.find(k=>String(k).startsWith('event:')));tx.oncomplete=resolve;tx.onabort=reject;});db.close();
    await expect(archive.load()).rejects.toThrow(/integridad/);
  });
});


describe('cloud queue segmented persistence',()=>{
  it('recovers offline history and base revision without large localStorage values or cross-account reads',async()=>{
    const f=planningFixture();f.apply({type:'upgrade-history',confirm:true,reason:'Offline fixture'});
    const idb=new IDBFactory(),local=storage();const original=local.setItem;local.setItem=(key,value)=>{if(value.length>1000)throw new Error('Quota');original(key,value);};
    const make=userId=>new CloudStorageAdapter({gateway:{},userId,storage:local,eventTarget:null,isOnline:()=>false,archive:new PlanningArchiveStore(idb,'cloud:'+userId)});
    const adapter=make('owner');adapter.rememberRevision(5);await adapter.save(f.state);
    const reloaded=make('owner');expect((await reloaded.load()).data.projectPlans).toEqual(f.state.projectPlans);expect((await reloaded.readPending()).expectedRevision).toBe(5);
    expect((await make('other').load()).data.projects).toEqual([]);
    reloaded.gateway={save:async state=>({data:state,revision:state.revision})};reloaded.isOnline=()=>true;
    await reloaded.flush();expect((await reloaded.readPending()).data).toBeNull();expect((await make('owner').load()).data.projectPlans).toEqual(f.state.projectPlans);
  });
});

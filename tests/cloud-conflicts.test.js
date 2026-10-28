import { describe, it, expect, vi } from "vitest";
import { createEmptyState } from "../src/data/schema.js";
import { CloudStorageAdapter, SupabaseStateGateway } from "../src/data/cloudAdapter.js";
import { FakeCloudBackend, MemoryStorage, createCloudContext } from "./helpers/cloudHarness.js";

describe("cloud conflict recovery",()=>{
  it("keeps a shared tab queue bound to its old base even if another tab advances the cached revision",async()=>{
    const backend=new FakeCloudBackend();backend.seed("a",createEmptyState());
    const shared=new MemoryStorage();
    const a=await createCloudContext({backend,userId:"a",storage:shared});
    const b=await createCloudContext({backend,userId:"a",storage:shared});
    await a.repository.createProject({name:"Remote A"});
    b.connectivity.online=false;
    await b.repository.createProject({name:"Local B one"});await b.repository.createProject({name:"Local B two"});
    expect(b.repository.getState().revision).toBe(2);
    const reload=await createCloudContext({backend,userId:"a",storage:shared});
    expect(reload.adapter.getStatus().state).toBe("conflict");
    expect(backend.stateFor("a").projects.map(p=>p.name)).toEqual(["Remote A"]);
    expect(reload.repository.getState().projects).toHaveLength(2);
  });
  it("pulls the second client's changes without a page reload",async()=>{
    const backend=new FakeCloudBackend();backend.seed("a",createEmptyState());
    const a=await createCloudContext({backend,userId:"a"}),b=await createCloudContext({backend,userId:"a"});
    const project=await b.repository.createProject({name:"From B"});
    expect((await a.repository.syncNow()).synced).toBe(true);
    expect(a.repository.getState().projects[0].id).toBe(project.id);
  });
  it("preserves both edits across a concurrent save, reload and explicit remote recovery",async()=>{
    const backend=new FakeCloudBackend();backend.seed("a",createEmptyState());
    const a=await createCloudContext({backend,userId:"a"}),b=await createCloudContext({backend,userId:"a"});
    await Promise.all([a.repository.createProject({name:"A"}),b.repository.createProject({name:"B"})]);
    expect(a.adapter.getStatus().state).toBe("synced");expect(b.adapter.getStatus().state).toBe("conflict");
    const pending=b.storage.getItem(b.adapter.keys.pending);
    const reload=await createCloudContext({backend,userId:"a",storage:b.storage});
    expect(reload.adapter.getStatus().state).toBe("conflict");expect(b.storage.getItem(b.adapter.keys.pending)).toBe(pending);
    expect(backend.stateFor("a").projects[0].name).toBe("A");
    const remote=await reload.adapter.useRemoteAfterConflict();
    expect(remote.projects[0].name).toBe("A");expect(reload.storage.getItem(reload.adapter.keys.pending)).toBeNull();
    const key=[...reload.storage.values.keys()].find(k=>k.startsWith(reload.adapter.keys.conflictBackup+":"));
    expect(JSON.parse(reload.storage.getItem(key)).projects[0].name).toBe("B");
  });
  it("never overwrites cloud when an old offline queue has no known base revision",async()=>{
    const backend=new FakeCloudBackend();backend.seed("a",createEmptyState());
    const a=await createCloudContext({backend,userId:"a",connectivity:{online:false}});
    await a.repository.createProject({name:"Old queue"});
    const reload=await createCloudContext({backend,userId:"a",storage:a.storage});
    expect(reload.adapter.getStatus().state).toBe("conflict");expect(backend.stateFor("a").projects).toHaveLength(0);
    expect(reload.repository.getState().projects[0].name).toBe("Old queue");
  });
  it("does not clear a newer queued edit when an earlier upload finishes",async()=>{
    const initial=createEmptyState(),storage=new MemoryStorage();let finish;
    const gateway={load:async()=>({data:initial,revision:0}),save:vi.fn(async state=>{
      await new Promise(resolve=>{finish=resolve;});return {data:state,revision:state.revision};
    })};
    const adapter=new CloudStorageAdapter({gateway,userId:"a",storage,eventTarget:null,isOnline:()=>true});await adapter.load();
    const one={...initial,revision:1},two={...initial,revision:2};
    const first=adapter.save(one);await vi.waitFor(()=>expect(finish).toBeTypeOf("function"));
    const second=adapter.save(two);finish();await first;
    expect(adapter.readPending().data.revision).toBe(2);expect(adapter.getStatus().pending).toBe(true);
    await vi.waitFor(()=>expect(gateway.save).toHaveBeenCalledTimes(2));finish();await second;
    expect(gateway.save.mock.calls[1][1]).toEqual({expectedRevision:1});expect(adapter.readPending().data).toBeNull();
  });
  it("refuses unknown and non-monotonic revisions before a write",async()=>{
    const client={from:vi.fn()};const gateway=new SupabaseStateGateway({client,userId:"a"});
    await expect(gateway.save(createEmptyState())).rejects.toMatchObject({code:"STUDYHUB_CONFLICT"});
    expect(client.from).not.toHaveBeenCalled();
    const state=createEmptyState();gateway.load=async()=>({data:state,revision:0});
    await expect(gateway.save(state,{expectedRevision:0})).resolves.toMatchObject({revision:0});
    await expect(gateway.save({...state,updatedAt:"different"},{expectedRevision:0})).rejects.toMatchObject({code:"STUDYHUB_CONFLICT"});
  });
  it("notifies another tab only after the shared queue is acknowledged",async()=>{
    const backend=new FakeCloudBackend();backend.seed("a",createEmptyState());
    const first=await createCloudContext({backend,userId:"a"});
    const other=await createCloudContext({backend,userId:"a",storage:first.storage});
    first.connectivity.online=false;
    await first.repository.createProject({name:"Shared tab"});
    other.eventTarget.dispatch("storage",{key:first.adapter.keys.cache,newValue:first.storage.getItem(first.adapter.keys.cache)});
    expect(other.repository.getState().projects).toHaveLength(0);
    first.connectivity.online=true;await first.adapter.flush();
    other.eventTarget.dispatch("storage",{key:first.adapter.keys.pending,newValue:null});
    expect(other.repository.getState().projects[0].name).toBe("Shared tab");
    expect(other.adapter.remoteRevision).toBe(1);
  });
});

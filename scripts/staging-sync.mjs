import assert from "node:assert/strict";
import { CloudStorageAdapter, SupabaseStateGateway } from "../src/data/cloudAdapter.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { createStore } from "../src/state/store.js";

class IsolatedStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

// Real HTTP gateways and repositories; only browser storage/connectivity are controlled.
export async function verifySynchronization({ clientA, clientB, userId }) {
  const contexts = [];
  async function open(client, storage = new IsolatedStorage(), connectivity = { online: true }, gateway = new SupabaseStateGateway({ client, userId })) {
    const adapter = new CloudStorageAdapter({ gateway, userId,
      storage, eventTarget: null, isOnline: () => connectivity.online });
    const repository = new StudyHubRepository({ adapter, store: createStore(null) });
    await repository.initialize();
    const context = { adapter, repository, storage, connectivity }; contexts.push(context); return context;
  }
  try {
    const a = await open(clientA), b = await open(clientB);
    const history = structuredClone(a.repository.getState().evaluations);
    await Promise.all([a.repository.createProject({ name: "Concurrent A" }), b.repository.createProject({ name: "Concurrent B" })]);
    const statuses = [a, b].map(c => c.adapter.getStatus());
    assert.equal(statuses.filter(s => s.state === "synced").length, 1, "Only one concurrent snapshot may win");
    const loser = [a, b].find(c => c.adapter.getStatus().pending);
    assert.ok(loser, "Conflicting local changes must remain recoverable");
    const pending = loser.storage.getItem(loser.adapter.keys.pending);
    assert.ok(pending);
    const conflictReload = await open(clientB, loser.storage);
    assert.equal(conflictReload.adapter.getStatus().state, "conflict");
    assert.equal(loser.storage.getItem(loser.adapter.keys.pending), pending, "Reload preserves conflict without overwriting remote");
    const fresh = await open(clientB);
    assert.deepEqual(fresh.repository.getState().evaluations, history, "Old history survives concurrent project changes");
    fresh.connectivity.online = false;
    const offline = await fresh.repository.createProject({ name: "Offline queue fixture" });
    const reloaded = await open(clientA, fresh.storage, { online: false });
    assert.ok(reloaded.repository.getState().projects.some(p => p.id === offline.id));
    reloaded.connectivity.online = true;
    assert.equal((await reloaded.adapter.flush()).synced, true);
    const last = await open(clientB);
    assert.ok(last.repository.getState().projects.some(p => p.id === offline.id));
    assert.deepEqual(last.repository.getState().evaluations, history);
    const winner = [a,b].find(c=>c!==loser);
    assert.equal((await winner.repository.syncNow()).synced,true);
    assert.ok(winner.repository.getState().projects.some(p=>p.id===offline.id),"Sync now pulls the other client's new data");
    const recovered=await conflictReload.adapter.useRemoteAfterConflict();
    assert.ok(recovered.projects.some(p=>p.id===offline.id));
    assert.ok([...loser.storage.values.keys()].some(k=>k.startsWith(loser.adapter.keys.conflictBackup+":")));
    const actualGateway=new SupabaseStateGateway({client:clientA,userId});let drop=true;
    const lost=await open(clientA,undefined,undefined,{load:()=>actualGateway.load(),save:async(state,options)=>{
      const result=await actualGateway.save(state,options);
      if(drop){drop=false;throw new TypeError("Synthetic lost acknowledgement after actual commit");}
      return result;
    }});
    const retried=await lost.repository.createProject({name:"Lost response fixture"});
    assert.equal(lost.adapter.getStatus().pending,true);
    const revision=(await actualGateway.load()).revision;
    assert.equal((await lost.adapter.flush()).synced,true);
    const final=await actualGateway.load();assert.equal(final.revision,revision);
    assert.equal(final.data.projects.filter(p=>p.id===retried.id).length,1);
    return ["two-real-client-CAS", "conflict-preserved-on-reload", "offline-queue-reload-flush", "legacy-history-through-sync", "sync-now-pulls-second-client", "explicit-conflict-recovery", "lost-ack-idempotent-recovery"];
  } finally { contexts.forEach(c => c.repository.destroy()); }
}

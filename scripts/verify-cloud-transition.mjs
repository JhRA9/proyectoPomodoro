import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cloudStagingConfig, CLOUD_STAGING_REF } from "./cloud-staging.mjs";
import { stagingFixture } from "./verify-local-staging.mjs";
import { SupabaseStateGateway } from "../src/data/cloudAdapter.js";
import { verifySynchronization } from "./staging-sync.mjs";
import { migrateAttempts, migrationBackup, restoreMigrationBackup } from "../src/evaluation/attempts.js";

const config=cloudStagingConfig(process.env);
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(config.url,config.service,options), users=[], clients=[];
try {
  const credentials=[];
  for(let i=0;i<2;i++) {
    const credential={email:`transition-${randomUUID()}@example.test`,password:randomBytes(32).toString("hex")};credentials.push(credential);
    const created=await admin.auth.admin.createUser({...credential,email_confirm:true});assert.equal(created.error,null);users.push(created.data.user);
    const client=createClient(config.url,config.anon,options);clients.push(client);assert.equal((await client.auth.signInWithPassword(credential)).error,null);
  }
  const state=await stagingFixture();
  const gateway=new SupabaseStateGateway({client:clients[0],userId:users[0].id,useSnapshotRpc:true});
  await gateway.save(state,{expectedRevision:null});
  const persisted=await gateway.load();assert.deepEqual(persisted.data,state);
  // Immutable file backup with digest, made before conversion. Only synthetic data.
  const backup=migrationBackup(state),serialized=JSON.stringify(backup);
  const folder=new URL("../.tmp/studyhub-cloud-staging/evidence/",import.meta.url);mkdirSync(folder,{recursive:true});
  const path=new URL("history-backup.json",folder);writeFileSync(path,serialized);
  const digest=createHash("sha256").update(serialized).digest("hex");
  assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"),digest);
  const converted=migrateAttempts(state);converted.revision=state.revision+1;
  await gateway.save(converted,{expectedRevision:state.revision});
  const restored=restoreMigrationBackup(JSON.parse(readFileSync(path,"utf8")));restored.revision=converted.revision+1;
  await gateway.save(restored,{expectedRevision:converted.revision});
  assert.deepEqual((await gateway.load()).data,restored);
  assert.deepEqual(restored.evaluations,state.evaluations);
  for(const operation of [
    clients[0].from("studyhub_states").upsert({user_id:users[0].id,state:{},revision:999}),
    clients[0].from("studyhub_states").update({state:{},revision:999}).eq("user_id",users[0].id),
    clients[0].from("studyhub_states").delete().eq("user_id",users[0].id),
  ]) assert.equal((await operation).error?.code,"42501","Old client direct write must be denied");
  assert.deepEqual((await gateway.load()).data,restored,"Old client cannot overwrite or delete new history");
  const anonymous=createClient(config.url,config.anon,options);
  assert.ok((await anonymous.rpc("studyhub_save_snapshot",{p_state:state,p_expected_revision:null})).error);
  // There is no target-user argument; the server exclusively uses auth.uid().
  const impostor=new SupabaseStateGateway({client:clients[1],userId:users[0].id,useSnapshotRpc:true});
  await impostor.save(state,{expectedRevision:null});
  assert.deepEqual((await gateway.load()).data,restored);
  assert.equal((await clients[1].from("studyhub_states").select().eq("user_id",users[0].id)).data.length,0);
  const second=createClient(config.url,config.anon,options);assert.equal((await second.auth.signInWithPassword(credentials[0])).error,null);
  const sync=await verifySynchronization({clientA:clients[0],clientB:second,userId:users[0].id,useSnapshotRpc:true});
  const result={at:new Date().toISOString(),projectRef:CLOUD_STAGING_REF,status:"passed",checks:["legacy-upsert-update-delete-denied","RPC-own-account-only","RPC-anonymous-denied","cloud-history-backup-sha256","cloud-conservative-migration","cloud-history-file-restoration",...sync],backupSha256:digest,backupScope:"synthetic snapshot data, not full database schema"};
  writeFileSync(new URL("../docs/studyhub2/cloud-transition-results.json",import.meta.url),JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result,null,2));
} catch(error) { console.error(`Transition failed (${error.name}) at ${String(error.stack).split("\n").find(line=>line.includes("file:"))}.`);process.exitCode=1; }
finally {
  for(const user of users) if((await admin.auth.admin.deleteUser(user.id)).error) {console.error("Synthetic cleanup failed");process.exitCode=1;}
}

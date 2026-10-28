import { pathToFileURL } from "node:url";
import { randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createEmptyState } from "../src/data/schema.js";
import { StudyHubRepository } from "../src/data/repository.js";
import { MemoryAdapter } from "../src/data/localAdapter.js";
import { createStore } from "../src/state/store.js";
import { beginAttempt, saveAttemptResponse, migrationBackup, migrateAttempts, restoreMigrationBackup } from "../src/evaluation/attempts.js";
import { verifySynchronization } from "./staging-sync.mjs";
import { verifyEdge } from "./staging-edge.mjs";

// Deliberately does not load .env or linked Supabase credentials. No AI calls.
export function stagingConfig(env) {
  if (env.STUDYHUB_STAGING_CONFIRM !== "disposable-local-only") throw Error("No ejecutado: requiere un entorno local desechable confirmado.");
  let url; try { url = new URL(env.STUDYHUB_STAGING_URL); } catch { throw Error("Falta la URL del entorno local aislado."); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== "54321" || url.pathname !== "/" || url.username || url.password || url.search || url.hash) throw Error("Solo se admite http://127.0.0.1:54321; no se permite staging remoto ni producción.");
  if (!env.STUDYHUB_STAGING_ANON_KEY || !env.STUDYHUB_STAGING_SERVICE_KEY) throw Error("Faltan las claves generadas por Supabase local. No uses claves reales.");
  return { url: url.origin, anon: env.STUDYHUB_STAGING_ANON_KEY, service: env.STUDYHUB_STAGING_SERVICE_KEY };
}

function checked(result) { if (result.error) throw Error(`Falló una comprobación de staging (${result.error.code || result.error.status || "respuesta inválida"}).`); return result.data; }
export async function stagingFixture() {
  const repo=new StudyHubRepository({adapter:new MemoryAdapter(createEmptyState()),store:createStore(null)});await repo.initialize();
  const project=await repo.createProject({name:"SYNTHETIC STAGING ONLY",projectType:"studies"});
  const area=await repo.createCompetency(project.id,{name:"Synthetic area"});
  const old=await repo.createExercise(project.id,{title:"Synthetic historical fixture",competencyIds:[area.id]});
  const rubric=repo.getState().projects[0].evaluationConfig.rubric;
  const scores=Object.fromEntries(rubric.criteria.map(c=>[`score_${c.id}`,2]));
  await repo.recordManualEvaluation(old.id,scores);await repo.recordManualEvaluation(old.id,scores);
  const current=await repo.createExercise(project.id,{title:"Synthetic multi-review fixture",competencyIds:[area.id]});
  const attempt=await beginAttempt(repo,current.id,"both");
  await saveAttemptResponse(repo,attempt.id,{results:["gemini","cloudflare"].map(provider=>({provider,model:"fixture-not-inference",scores:rubric.criteria.map(c=>({criterionId:c.id,score:2,justification:"Synthetic test fixture"}))}))});
  return repo.getState();
}
export async function verifyLocalStaging(config) {
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(config.url, config.service, options);
  const users = [], clients = [], credentials = [], bucket = "studyhub-task-files";
  const run = randomUUID(); let objectPath;
  try {
    for (let index = 0; index < 2; index++) {
      const email = `studyhub-${run}-${index}@example.test`, password = randomBytes(32).toString("hex");
      credentials.push({email,password});
      const { user } = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true })); users.push(user);
      const client = createClient(config.url, config.anon, options); clients.push(client);
      checked(await client.auth.signInWithPassword({ email, password }));
    }
    const [a, b] = clients, [owner, other] = users;
    const legacy = await stagingFixture();
    checked(await a.from("studyhub_states").insert({ user_id: owner.id, state: legacy, revision: 0 }));
    checked(await b.from("studyhub_states").insert({ user_id: other.id, state: createEmptyState(), revision: 0 }));
    assert.equal(checked(await b.from("studyhub_states").select("user_id").eq("user_id", owner.id)).length, 0, "RLS lectura cruzada");
    assert.equal(checked(await b.from("studyhub_states").update({ revision: 99 }).eq("user_id", owner.id).select()).length, 0, "RLS escritura cruzada");
    assert.equal(checked(await b.from("studyhub_states").delete().eq("user_id", owner.id).select()).length, 0, "RLS borrado cruzado");
    assert.ok((await a.from("studyhub_states").update({user_id:other.id}).eq("user_id",owner.id)).error, "RLS cambio de propietario");
    const anon = createClient(config.url, config.anon, options);
    assert.ok((await anon.from("studyhub_states").select()).error, "Anónimo no lee snapshots");

    // Verify snapshot round-trip, versioned backup and compare-and-swap conflict.
    const before = checked(await a.from("studyhub_states").select("state,revision").eq("user_id",owner.id).single());
    const backup = migrationBackup(before.state), migrated = migrateAttempts(before.state);
    assert.equal(migrated.evaluations.length,3);
    assert.deepEqual(migrated.evaluations.slice(0,2).map(e=>e.reviews[0].original),before.state.evaluations.slice(0,2));
    assert.equal(migrated.evaluations[2].reviews.length,2);
    assert.deepEqual(restoreMigrationBackup(backup), before.state);
    checked(await a.from("studyhub_states").update({state:migrated,revision:1}).eq("user_id",owner.id).eq("revision",0).select().single());
    assert.equal(checked(await a.from("studyhub_states").update({revision:2}).eq("user_id",owner.id).eq("revision",0).select()).length,0,"Revisión antigua no sobrescribe");
    checked(await a.from("studyhub_states").update({state:restoreMigrationBackup(backup),revision:2}).eq("user_id",owner.id).eq("revision",1));
    assert.deepEqual(checked(await a.from("studyhub_states").select("state").eq("user_id",owner.id).single()).state,before.state);

    const privateBucket = checked(await admin.storage.getBucket(bucket)); assert.equal(privateBucket.public,false);
    objectPath = `${owner.id}/staging-${run}/fixture.txt`;
    checked(await a.storage.from(bucket).upload(objectPath,new Blob(["synthetic staging fixture"],{type:"text/plain"})));
    assert.equal(await checked(await a.storage.from(bucket).download(objectPath)).text(),"synthetic staging fixture");
    assert.ok((await b.storage.from(bucket).download(objectPath)).error,"Otro usuario no descarga");
    assert.ok((await b.storage.from(bucket).createSignedUrl(objectPath,60)).error,"Otro usuario no firma");
    assert.ok((await b.storage.from(bucket).upload(`${owner.id}/staging-${run}/intrusion.txt`,new Blob(["blocked"]))).error,"Otro usuario no sube al prefijo ajeno");
    assert.equal(checked(await b.storage.from(bucket).list(owner.id)).length,0,"No enumera archivos ajenos");
    await b.storage.from(bucket).remove([objectPath]);
    assert.equal(await checked(await a.storage.from(bucket).download(objectPath)).text(),"synthetic staging fixture","Borrado ajeno no tiene efecto");
    checked(await a.storage.from(bucket).upload(objectPath,new Blob(["updated"]),{upsert:true}));
    assert.equal(await checked(await a.storage.from(bucket).download(objectPath)).text(),"updated");
    assert.ok(checked(await a.storage.from(bucket).createSignedUrl(objectPath,60)).signedUrl);

    assert.ok((await a.from("studyhub_evaluation_requests").select()).error,"Registro privado inaccesible desde cliente");
    const params = { p_user_id:owner.id,p_request_id:`staging:${run}`,p_hash:"fixture-hash",p_retry:false };
    assert.ok((await a.rpc("studyhub_claim_evaluation",params)).error,"Cliente no puede reservar inferencias");
    const claims = await Promise.all([admin.rpc("studyhub_claim_evaluation",params),admin.rpc("studyhub_claim_evaluation",params)]);
    assert.deepEqual(claims.map(result=>checked(result).state).sort(),["claimed","processing"]);
    const fixture = {status:"completed",results:[{provider:"gemini",fixture:true},{provider:"cloudflare",fixture:true}]};
    checked(await admin.from("studyhub_evaluation_requests").update({state:"completed",response:fixture}).eq("user_id",owner.id).eq("request_id",params.p_request_id));
    assert.deepEqual(checked(await admin.rpc("studyhub_claim_evaluation",params)).response,fixture);
    assert.equal(checked(await admin.rpc("studyhub_claim_evaluation",{...params,p_hash:"changed"})).state,"conflict");
    assert.equal(checked(await admin.rpc("studyhub_claim_evaluation",{...params,p_user_id:other.id})).state,"claimed","Identidad separada por cuenta");
    checked(await admin.from("studyhub_evaluation_requests").update({state:"failed",response:{status:"error"}}).eq("user_id",other.id));
    assert.equal(checked(await admin.rpc("studyhub_claim_evaluation",{...params,p_user_id:other.id,p_retry:true})).state,"claimed");
    const secondDevice = createClient(config.url, config.anon, options);
    checked(await secondDevice.auth.signInWithPassword(credentials[0]));
    checked(await a.from("studyhub_states").update({state:legacy,revision:legacy.revision}).eq("user_id",owner.id));
    const synchronization = await verifySynchronization({clientA:a,clientB:secondDevice,userId:owner.id});
    const edge = await verifyEdge({config,client:a,admin,userId:owner.id,run});
    return { status:"passed",checks:["auth-two-synthetic-accounts","RLS-read-write-delete","snapshot-CAS","backup-roundtrip","private-storage","durable-concurrent-claims","cached-retry","account-isolation",...synchronization,...edge],inference:"not executed" };
  } finally {
    // Only resources belonging to synthetic users created by THIS invocation.
    const failures=[];
    if(objectPath) { const removed=await admin.storage.from(bucket).remove([objectPath,`${users[0].id}/staging-${run}/intrusion.txt`]);if(removed.error)failures.push("archivos sintéticos"); }
    for(const user of users) { const removed=await admin.auth.admin.deleteUser(user.id);if(removed.error)failures.push(`usuario sintético ${user.id}`); }
    if(failures.length) throw Error(`Limpieza local incompleta: ${failures.join(", ")}. Revisa el entorno desechable.`);
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await verifyLocalStaging(stagingConfig(process.env)),null,2)); }
  catch(error) { console.error(error.message);process.exitCode=1; }
}

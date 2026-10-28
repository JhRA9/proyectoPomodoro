import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { stagingConfig, stagingFixture } from "./verify-local-staging.mjs";

// Only this disposable container; never accepts a connection string or remote host.
function database(command, input) {
  const result=spawnSync("docker",["--context","desktop-linux","exec","-i","supabase_db_studyhub-staging",...command],{input,encoding:"utf8",maxBuffer:20*1024*1024});
  if(result.status!==0) throw Error(`Local SQL verification failed: ${result.stderr?.slice(0,1000)}`);
  return result.stdout;
}
export async function verifyHistory(config) {
  const admin=createClient(config.url,config.service,{auth:{persistSession:false,autoRefreshToken:false}});
  let userId;
  const checked=r=>{if(r.error)throw Error(`History staging: ${r.error.code || r.error.status}`);return r.data;};
  try {
    // The dump is permitted only when the disposable table has no other users' data.
    assert.equal(checked(await admin.from("studyhub_states").select("user_id")).length,0,"Staging must be empty before the SQL backup test");
    const {user}=checked(await admin.auth.admin.createUser({email:`history-${randomUUID()}@example.test`,password:randomBytes(32).toString("hex"),email_confirm:true}));userId=user.id;
    const fixture=await stagingFixture();fixture.schemaVersion=1;fixture.unknownHistoricalField={preserve:true};
    delete fixture.weeklyReviews;
    checked(await admin.from("studyhub_states").insert({user_id:userId,state:fixture,revision:fixture.revision}));
    const before=checked(await admin.from("studyhub_states").select().eq("user_id",userId).single());
    const backup=database(["pg_dump","-U","postgres","-d","postgres","--data-only","--column-inserts","--table=public.studyhub_states","--no-owner","--no-privileges"]);
    mkdirSync(new URL("../.tmp/studyhub-staging/evidence/",import.meta.url),{recursive:true});
    const backupPath=new URL("../.tmp/studyhub-staging/evidence/history-before.sql",import.meta.url);writeFileSync(backupPath,backup);
    const checksum=createHash("sha256").update(backup).digest("hex");
    for(const filename of ["202610230001_upgrade_studyhub_state_v2.sql","202610250001_evaluation_requests.sql"]) {
      database(["psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"],readFileSync(new URL(`../supabase/migrations/${filename}`,import.meta.url),"utf8"));
    }
    const after=checked(await admin.from("studyhub_states").select().eq("user_id",userId).single());
    assert.equal(after.state.schemaVersion,2);assert.deepEqual(after.state.evaluations,fixture.evaluations);
    assert.deepEqual(after.state.unknownHistoricalField,fixture.unknownHistoricalField);assert.deepEqual(after.state.weeklyReviews,[]);
    for(const key of Object.keys(fixture).filter(k=>k!=="schemaVersion")) assert.deepEqual(after.state[key],fixture[key]);
    assert.equal(after.revision,before.revision);
    // Restore the actual pg_dump file, not an in-memory substitute.
    assert.equal(createHash("sha256").update(readFileSync(backupPath)).digest("hex"),checksum);
    checked(await admin.from("studyhub_states").delete().eq("user_id",userId));
    database(["psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1"],readFileSync(backupPath,"utf8"));
    assert.deepEqual(checked(await admin.from("studyhub_states").select().eq("user_id",userId).single()),before);
    return {status:"passed",checks:["SQL-v1-to-v2","unknown-fields-preserved","legacy-evaluations-preserved","pg-dump-sha256","actual-SQL-data-restore"],backupSha256:checksum,scope:"snapshot data rollback; schema and security tables remain installed"};
  } finally {if(userId)checked(await admin.auth.admin.deleteUser(userId));}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(await verifyHistory(stagingConfig(process.env)),null,2));}
  catch(error){console.error(error.message);process.exitCode=1;}
}

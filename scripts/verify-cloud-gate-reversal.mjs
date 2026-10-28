import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { cloudStagingConfig, CLOUD_STAGING_REF } from "./cloud-staging.mjs";
import { SupabaseStateGateway } from "../src/data/cloudAdapter.js";
import { stagingFixture } from "./verify-local-staging.mjs";

// Only the explicitly enrolled disposable cloud. Never accepts a target argument.
const config = cloudStagingConfig(process.env);
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(config.url, config.service, options);
const client = createClient(config.url, config.anon, options);
let user, gateRestored = false;
const apply = (name) => {
  const file = fileURLToPath(new URL(`../supabase/transitions/${name}_snapshot_cas.sql`, import.meta.url));
  // Static CLI and allowlisted ref; no credential is part of the command.
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  execFileSync("powershell.exe", ["-NoProfile", "-Command", `npm exec --yes --package=supabase@2.122.0 -- supabase db query --linked --project-ref ${CLOUD_STAGING_REF} --file ${quote(file)} -o json; if ($LASTEXITCODE -ne 0) { exit 1 }`], { stdio: "pipe", windowsHide: true });
};
try {
  const credential = { email: `gate-${randomUUID()}@example.test`, password: randomBytes(32).toString("hex") };
  const created = await admin.auth.admin.createUser({ ...credential, email_confirm: true });
  assert.equal(created.error, null); user = created.data.user;
  assert.equal((await client.auth.signInWithPassword(credential)).error, null);
  const gateway = new SupabaseStateGateway({ client, userId: user.id, useSnapshotRpc: true });
  const state = await stagingFixture();
  await gateway.save(state, { expectedRevision: null });
  apply("disable");
  const oldWrite = await client.from("studyhub_states").update({ state, revision: state.revision }).eq("user_id", user.id).select();
  assert.equal(oldWrite.error, null); assert.equal(oldWrite.data.length, 1);
  assert.deepEqual((await gateway.load()).data, state, "Grant rollback preserves history");
  const next = { ...state, revision: state.revision + 1 };
  await gateway.save(next, { expectedRevision: state.revision });
  assert.deepEqual((await gateway.load()).data, next, "New RPC client also works during rollback");
  apply("enable"); gateRestored = true;
  assert.equal((await client.from("studyhub_states").update({ state: {}, revision: 999 }).eq("user_id", user.id)).error?.code, "42501");
  assert.deepEqual((await gateway.load()).data, next, "Re-enable preserves history and rejects old writes");
  const result = { at: new Date().toISOString(), projectRef: CLOUD_STAGING_REF, status: "passed", checks: ["SQL-gate-rollback-restores-legacy-writes", "rollback-preserves-snapshot", "RPC-works-during-rollback", "gate-reenabled-denies-legacy-writes", "reenable-preserves-history"], gateFinalState: "enabled", scope: "staging only; no production data or schema rollback" };
  writeFileSync(new URL("../docs/studyhub2/cloud-gate-reversal-results.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`Gate reversal failed (${error.name}); credentials and responses omitted.`); process.exitCode = 1;
} finally {
  if (!gateRestored) { try { apply("enable"); } catch { console.error("STAGING gate could not be restored; apply enable_snapshot_cas.sql to the enrolled staging before further use."); process.exitCode = 1; } }
  if (user && (await admin.auth.admin.deleteUser(user.id)).error) { console.error("Synthetic cleanup failed"); process.exitCode = 1; }
}

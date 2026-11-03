import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {dockerLocal} from './start-planning-edge.mjs';

const sql=source=>dockerLocal(['exec','-i','supabase_db_studyhub-staging','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:source});
const fingerprint=()=>sql("select coalesce(jsonb_agg(to_jsonb(s) order by user_id),'[]') from public.studyhub_states s;").trim();
export function installPlanningGuardLocal() {
  const before=fingerprint();
  const present=sql("select count(*) from pg_trigger where tgname='studyhub_planning_guard' and tgrelid='public.studyhub_states'::regclass;").trim()==='1';
  if(!present)sql(readFileSync(new URL('../supabase/migrations/202610310001_project_planning_guard.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../supabase/migrations/202611010001_consolidate_planning_guard.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../supabase/migrations/202611020001_planning_history_v2.sql',import.meta.url),'utf8'));
  sql(readFileSync(new URL('../supabase/migrations/202611020002_planning_originals.sql',import.meta.url),'utf8'));
  assert.equal(fingerprint(),before,'La migración no debe cambiar snapshots existentes');
  return {migration:present?'base-already-installed':'base-installed',consolidationGuard:'applied',snapshotsUnchanged:true};
}
export function verifyPlanningSql(owner) {
  assert.match(owner,/^[0-9a-f-]{36}$/i);
  // A reversible, row-scoped backup of the synthetic account only. This does not
  // collect any other account that might exist in the disposable environment.
  const row=sql(`select to_jsonb(s) from public.studyhub_states s where user_id='${owner}'::uuid;`).trim();
  assert.ok(row,'Falta el snapshot sintético');const parsed=JSON.parse(row);
  const tables=["studyhub_plan_heads","studyhub_plan_events","studyhub_plan_versions"];
  const history=Object.fromEntries(tables.map(table=>[table,sql(`select coalesce(jsonb_agg(to_jsonb(s) order by to_jsonb(s)::text),'[]') from public.${table} s where user_id='${owner}'::uuid;`).trim()]));
  const historyDump=tables.map(table=>`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$history$${history[table]}$history$::jsonb);`).join("\n");
  const dump=`insert into public.studyhub_states(user_id,state,revision,updated_at) values ('${owner}', $studyhub_fixture$${JSON.stringify(parsed.state)}$studyhub_fixture$::jsonb, ${parsed.revision}, '${parsed.updated_at}');\n${historyDump}`;
  const dir=new URL('../.tmp/studyhub-staging/evidence/',import.meta.url);mkdirSync(dir,{recursive:true});
  const path=new URL('planning-synthetic.sql',dir);writeFileSync(path,dump);
  const sha256=createHash('sha256').update(dump).digest('hex');assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),sha256);
  const before=fingerprint();
  // Exercise access rollback and actual SQL data restoration, atomically. Even a
  // failed assertion closes psql and rolls the whole rehearsal back.
  const disable=readFileSync(new URL('../supabase/transitions/disable_planning_writes.sql',import.meta.url),'utf8').replace(/^begin;|^commit;/gm,'');
  sql(`begin;
${disable}
do $$ begin
 if has_function_privilege('service_role','public.studyhub_save_planned_snapshot(uuid,jsonb,bigint)','execute') then raise exception 'Access rollback failed'; end if;
 if has_function_privilege('authenticated','public.studyhub_save_planned_snapshot(uuid,jsonb,bigint)','execute') then raise exception 'Client RPC access'; end if;
 if has_table_privilege('authenticated','public.studyhub_states','delete') then raise exception 'Client delete access'; end if;
end $$;
delete from public.studyhub_plan_heads where user_id='${owner}';
delete from public.studyhub_states where user_id='${owner}';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
${readFileSync(path,'utf8')}
do $$ begin
 if (select to_jsonb(s) from public.studyhub_states s where user_id='${owner}') <> $studyhub_before$${row}$studyhub_before$::jsonb then raise exception 'Snapshot restore changed data'; end if;
end $$;
${tables.map(table=>`do $$ begin if (select coalesce(jsonb_agg(to_jsonb(s) order by to_jsonb(s)::text), '[]') from public.${table} s where user_id='${owner}') <> $history$${history[table]}$history$::jsonb then raise exception 'History restore changed data';end if;end $$;`).join('\n')}
rollback;`);
  assert.equal(fingerprint(),before,'El ensayo SQL debe conservar todas las filas');
  assert.equal(sql("select has_function_privilege('service_role','public.studyhub_save_planned_snapshot(uuid,jsonb,bigint)','execute');").trim(),'t');
  return {sha256,checks:['normalized-events-checkpoints-backup-and-restore','synthetic-row-SQL-backup','backup-sha256','access-revocation','client-privileges','SQL-data-restoration','transaction-rollback-preserves-all-rows-and-grants']};
}

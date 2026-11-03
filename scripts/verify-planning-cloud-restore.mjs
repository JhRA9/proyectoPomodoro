import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {cloudStagingConfig,CLOUD_STAGING_REF} from './cloud-staging.mjs';

// Only the account created by the current acceptance run. Keep all changes in
// one transaction, including restoration failure, and return no snapshot data.
export function rehearseCloudRestore(id){
  cloudStagingConfig(process.env);
  assert.match(id,/^[a-f0-9-]{36}$/i);
  const tables=['studyhub_states','studyhub_plan_heads','studyhub_plan_events','studyhub_plan_versions'];
  const sql=[
    "begin; set local lock_timeout = '3s';",
    `do $$ begin if not exists(select 1 from auth.users where id='${id}' and email ~ '^planning-[a-f0-9-]+@example[.]test$') then raise exception 'Not a synthetic rehearsal account';end if;end $$;`,
    ...tables.map(t=>`create temp table copy_${t} on commit drop as select * from public.${t} where user_id='${id}';`),
    "select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true);",
    `delete from public.studyhub_plan_heads where user_id='${id}'; delete from public.studyhub_states where user_id='${id}';`,
    ...tables.map(t=>`insert into public.${t} select * from copy_${t};`),
    ...tables.map(t=>`do $$ begin if exists((select * from public.${t} where user_id='${id}' except all select * from copy_${t}) union all (select * from copy_${t} except all select * from public.${t} where user_id='${id}')) then raise exception 'Restore mismatch';end if;end $$;`),
    'rollback;'
  ].join('\n');
  const dir=new URL('../.tmp/studyhub-cloud-staging/evidence/',import.meta.url);
  mkdirSync(dir,{recursive:true});
  const file=new URL('restore-synthetic-plan.sql',dir);writeFileSync(file,sql);
  execFileSync(process.env.STUDYHUB_TEST_SUPABASE_CLI||'supabase',['db','query','--linked','--project-ref',CLOUD_STAGING_REF,'--file',fileURLToPath(file)],{stdio:'pipe',timeout:60000});
}

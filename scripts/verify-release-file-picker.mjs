import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build,preview} from 'vite';
import {createClient} from '@supabase/supabase-js';
import {cloudStagingConfig} from './cloud-staging.mjs';
const config=cloudStagingConfig(process.env);
const key=process.env.STUDYHUB_STAGING_PUBLIC_KEY;
assert.ok(key?.startsWith('sb_publishable_'));
const {chromium}=await import(process.env.PLAYWRIGHT_ENTRY?pathToFileURL(process.env.PLAYWRIGHT_ENTRY).href:'playwright');
const admin=createClient(config.url,config.service,{auth:{autoRefreshToken:false,persistSession:false}});
const folder=resolve('.tmp/file-picker-check');
const backup=JSON.parse(await readFile(resolve(folder,'backup-sintetico.json'),'utf8')).data;
const task=backup.tasks[0];
const outDir=resolve('.tmp/release-picker-dist');
for(const name of Object.keys(process.env))if(name.startsWith('VITE_'))delete process.env[name];
Object.assign(process.env,{VITE_SUPABASE_URL:config.url,VITE_SUPABASE_PUBLISHABLE_KEY:key,VITE_STUDYHUB_SNAPSHOT_RPC:'true',VITE_WORKSPACE_PLANNING_CLOUD_READY:'true'});
await build({configFile:false,envDir:false,build:{outDir,emptyOutDir:false}});
const server=await preview({configFile:false,envDir:false,build:{outDir},preview:{host:'127.0.0.1',port:5189,strictPort:true}});
let owner,browser;
const checks=[];
try{
  const email='picker-'+randomUUID()+'@example.test',password=randomBytes(28).toString('hex');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
  assert.ok(!created.error);owner=created.data.user.id;
  browser=await chromium.launch({executablePath:process.env.CHROME_BINARY,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900},serviceWorkers:'block'});
  const origin='http://127.0.0.1:5189',blocked=[];
  await page.route('**/*',r=>{
    const url=new URL(r.request().url());
    if([origin,config.url].includes(url.origin)&&!url.pathname.includes('/functions/v1/studyhub-evaluate'))return r.continue();
    if(url.protocol==='blob:')return r.continue();
    blocked.push(url.origin);return r.abort();
  });
  page.setDefaultTimeout(12000);
  await page.goto(origin+'/?workspaceV2=1#/settings');
  await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);await page.locator('[data-auth-form] [type=submit]').click();
  const pick=async(locator,name)=>{
    const [chooser]=await Promise.all([page.waitForEvent('filechooser'),locator.click()]);
    await chooser.setFiles(resolve(folder,name));
  };
  const action=name=>page.locator('main [data-action="'+name+'"]').first();
  const row=async()=>{
    const result=await admin.from('studyhub_states').select('state').eq('user_id',owner).single();
    assert.ok(!result.error);return result.data.state;
  };
  await pick(action('import-backup'),'backup-sintetico.json');await page.locator('[data-action=confirm-action]').click();
  await page.waitForFunction(()=>location.hash==='#/projects');
  const restored=await row();for(const field of ['tasks','projects','learningEntries','evaluations','focusSessions'])assert.deepEqual(restored[field],backup[field]);
  checks.push('Restauración confirmada desde Chrome y comparación de cinco colecciones en cloud');
  const settings=()=>page.evaluate(()=>{location.hash='/settings';});
  const route=async()=>{await settings();await pick(action('import-learning-path'),'ruta-sintetica.json');await page.locator('[data-action=confirm-learning-path-import]').click();};
  await route();await page.waitForFunction(()=>location.hash.endsWith('/progress'));
  assert.equal((await row()).projects.length,backup.projects.length+1);
  await route();await page.getByText(/ya (fue|está|se|ha sido) importada/i).first().waitFor();assert.equal((await row()).projects.length,backup.projects.length+1);
  checks.push('Vista previa, importación y segundo intento sin duplicar proyectos');
  await page.reload();await page.evaluate(t=>{location.hash='/projects/'+t.projectId+'/tasks/'+t.id;},task);
  await pick(page.locator('.task-file-picker'),'version-1/documento.txt');await page.locator('[data-action=download-task-file]').waitFor();
  await pick(page.locator('.task-file-picker'),'version-2/documento.txt');await page.getByText(/1 actualizado/).first().waitFor();
  await page.reload();await page.locator('[data-action=download-task-file]').waitFor();assert.equal(await page.locator('[data-action=download-task-file]').count(),1);
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action=download-task-file]').click()]);
  assert.deepEqual(await readFile(await download.path()),await readFile(resolve(folder,'version-2/documento.txt')));
  checks.push('Adjuntar, reemplazar, recargar y descargar los bytes de la segunda versión');
  assert.deepEqual(blocked,[]);
}finally{
  await browser?.close();await new Promise(r=>server.httpServer.close(r));
  if(owner){const bucket=admin.storage.from('studyhub-task-files'),dir=owner+'/'+task.id;
    const list=await bucket.list(dir);assert.ok(!list.error);
    if(list.data.length)assert.ok(!(await bucket.remove(list.data.map(o=>dir+'/'+o.name))).error);
    assert.ok(!(await admin.auth.admin.deleteUser(owner)).error);}
}
await writeFile('docs/planning/release-file-picker.json',JSON.stringify({at:new Date().toISOString(),environment:'isolated-cloud',checks,cleanup:true,providerRequests:0},null,2)+'\n');

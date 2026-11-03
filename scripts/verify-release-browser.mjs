// Local compiled app, isolated browser profiles and loopback-only traffic.
import {build} from 'vite';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {releaseScenario} from '../tests/helpers/releaseScenario.js';
import {planningFixture} from '../tests/helpers/planningFixture.js';

const {chromium}=await import(process.env.PLAYWRIGHT_ENTRY?pathToFileURL(process.env.PLAYWRIGHT_ENTRY).href:'playwright');
const root=resolve('.tmp/release-browser'),out=resolve('docs/planning/release-browser');
await mkdir(out,{recursive:true});
await build({configFile:false,envDir:false,envPrefix:'STUDYHUB_OFFLINE_TEST_ONLY_',build:{outDir:root,emptyOutDir:false}});
const server=createServer(async(req,res)=>{
  try{const name=new URL(req.url,'http://localhost').pathname,path=resolve(root,'.'+(name==='/'?'/index.html':name));assert.ok(path.startsWith(root+sep));
    const bytes=await readFile(path);res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:process.env.CHROME_BINARY||undefined,headless:true});
  const measurements=[],errors=[],external=[];
  async function open(state,width,slow=false){
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:width<800,serviceWorkers:'block'});
    await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();external.push(new URL(r.request().url()).origin);return r.abort();});
    await context.addInitScript(s=>{if(!localStorage.getItem('studyhub:state:1'))localStorage.setItem('studyhub:state:1',JSON.stringify(s));},state);
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));const cdp=await context.newCDPSession(page);
    if(slow){await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:160000,uploadThroughput:64000});}
    const start=performance.now();await page.goto(origin+'/?workspaceV2=1#/projects/synthetic-cube/plan');await page.locator('.plan-main-gauge').waitFor();
    return {page,context,ms:Math.round(performance.now()-start),cdp};
  }
  const f=releaseScenario();
  for(const width of [320,390,740,1024,1440]){
    const {page,context,ms}=await open(f.state,width,width===390);
    const rev=()=>page.evaluate(()=>localStorage.getItem('studyhub:state:1'));
    const before=await rev();let panels=0;
    for(const tab of ['summary','deliveries','history','proposals','tree']){
      const button=page.locator('nav[aria-label="Apartados del plan"] [data-tab="'+tab+'"]');await button.focus();await button.press('Enter');
      await page.locator('nav[aria-label="Apartados del plan"] [data-tab="'+tab+'"][aria-pressed=true]').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Desborde: '+width+' '+tab);panels++;
    }
    const action=(name,id)=>page.locator('.plan-tree-node [data-action="plan-tree-'+name+'"][data-entity-id="'+id+'"]');
    await action('fold','cube').click();assert.equal(await page.locator('.plan-tree-node').count(),1);await action('fold','cube').click();
    await page.locator('[aria-label="Ampliar zoom"]').click();await action('select','assembly').focus();await action('select','assembly').press('Enter');
    await page.getByRole('heading',{name:'Comprobar el montaje en seco'}).waitFor();
    const search=page.locator('[data-form="plan-tree-search"]');await search.locator('input').fill('Python');await search.locator('[type=submit]').click();
    assert.equal(await page.locator('.plan-tree-node').count(),2);
    await page.locator('[data-action="plan-tree-reset"]').click();
    assert.equal(await rev(),before);
    if(width===390||width===1440){await page.locator('.plan-tree-scroll').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,'arbol-'+width+'.jpg'),type:'jpeg',quality:80});}
    for(const route of ['home','projects','projects/synthetic-cube','projects/synthetic-cube/tasks/synthetic-task','projects/synthetic-cube/progress','results','settings']){
      await page.evaluate(r=>{location.hash='/'+r;},route);await page.waitForFunction(()=>!document.querySelector('.plan-page'));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      assert.ok(await page.locator('main').innerText());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Ruta desbordada '+width+' '+route);
    }
    measurements.push({width,panels,routes:7,firstPlanMs:ms,slowNetwork:width===390});await context.close();
  }
  const large=planningFixture('local');large.state.projects[0].name='Software sintético';large.apply({type:'upgrade-history',confirm:true,reason:'Prueba de carga'});
  for(let batch=0;batch<20;batch++)large.approve(large.propose(Array.from({length:50},(_,j)=>{const id='module-'+(batch*50+j);return large.op('items','add',id,large.item(id,{title:'Módulo de software '+id}));})));
  const {page,context,ms,cdp}=await open(large.state,1440);
  const start=performance.now();await page.locator('nav[aria-label="Apartados del plan"] [data-tab=tree]').click();await page.waitForFunction(()=>document.querySelectorAll('.plan-tree-node').length===1000);
  const treeMs=Math.round(performance.now()-start),heap=await cdp.send('Runtime.getHeapUsage');await context.close();
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await writeFile(resolve(out,'resultados.json'),JSON.stringify({at:new Date().toISOString(),browser:browser.version(),compiledOffline:true,network390:'150 ms; 160000 bytes/s download; cold uncompressed localhost build',measurements,software:{items:1000,firstPlanMs:ms,treeMs,usedJSHeapBytes:heap.usedSize},errors,external},null,2)+'\n');
}finally{await browser?.close();server.close();}

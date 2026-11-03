import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dockerLocal,startPlanningEdge,localPlanningConfig,planningContainer} from './start-planning-edge.mjs';
import {installPlanningGuardLocal} from './planning-staging-sql.mjs';
import {verifyPlanningStaging} from './verify-planning-staging.mjs';

const config=new URL('../.tmp/studyhub-staging/supabase/config.toml',import.meta.url);
const core=['db','kong','auth','rest','storage','realtime','inbucket'].map(service=>`supabase_${service}_studyhub-staging`);
const started=[];let edgeStarted=false;
const report={at:new Date().toISOString(),status:'not-run',providerRequests:0,syntheticOnly:true,checks:[]};
try {
  if(!/project_id = "studyhub-staging"/.test(readFileSync(config,'utf8'))||existsSync(new URL('.temp/project-ref',config)))throw Error('Proyecto local inesperado o enlazado.');
  dockerLocal(['info','--format','{{.ServerVersion}}']);
  const existing=dockerLocal(['ps','-a','--format','{{.Names}}']).trim().split('\n');
  if(core.some(name=>!existing.includes(name)))throw Error('Faltan servicios desechables; ejecutar prepare-local-staging.ps1 primero.');
  const running=dockerLocal(['ps','--format','{{.Names}}']).trim().split('\n');
  for(const name of core)if(!running.includes(name)){dockerLocal(['start',name]);started.push(name);}
  let healthy=false;
  for(let attempt=0;attempt<20;attempt++){
    const health=dockerLocal(['inspect',...['db','auth','storage'].map(s=>`supabase_${s}_studyhub-staging`),'--format','{{.State.Health.Status}}']);
    if(health.trim().split('\n').every(h=>h==='healthy')){healthy=true;break;}
    await new Promise(r=>setTimeout(r,1500));
  }
  if(!healthy)throw Error('Servicios locales todavía no saludables.');
  report.sqlMigration=installPlanningGuardLocal();
  startPlanningEdge();edgeStarted=true;
  const local=localPlanningConfig();
  let ready=false;
  for(let n=0;n<20;n++){
    try {if((await fetch(local.edge,{method:'POST',signal:AbortSignal.timeout(1000)})).status===401){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  if(!ready)throw Error('El handler real no inició; comprobar únicamente los logs del contenedor studyhub-staging-plan.');
  Object.assign(report,await verifyPlanningStaging({...local,sqlRehearsal:true}));
}catch(error){report.status='blocked';report.blocker=error.message;report.checks=error.checks||[];process.exitCode=1;}
finally{
  try{if(edgeStarted)dockerLocal(['stop',planningContainer]);for(const name of started.reverse())dockerLocal(['stop','--time','10',name]);}catch(error){report.cleanup=error.message;process.exitCode=1;}
  writeFileSync(new URL(process.argv.includes('--release')?'../docs/planning/release-staging.json':'../docs/planning/expansion-staging.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}

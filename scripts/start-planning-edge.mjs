import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
export const planningContainer='studyhub-staging-plan';
export function dockerLocal(args,options={}) {
  const result=spawnSync('docker',['--context','desktop-linux',...args],{encoding:'utf8',timeout:20000,maxBuffer:8e6,...options});
  // Do not echo stderr/arguments: Docker may include configuration credentials.
  if(result.error?.code==='ETIMEDOUT')throw Error('Docker Linux no responde en 20 segundos. No se reinició ningún servicio.');
  if(result.error||result.status!==0){const sqlError=args.includes('psql')?String(result.stderr||'').split('\n').find(line=>line.startsWith('ERROR:'))?.slice(0,240):null;throw Error(`Falló Docker local (${args[0]}, salida ${result.status??result.error?.code}); no se usó ningún destino cloud.${sqlError?' '+sqlError:''}`);}
  return result.stdout;
}
export function planningSources(base=root) {
  const files=new Map();
  const visit=name=>{
    const path=resolve(base,name),key=relative(base,path).split(sep).join('/');
    if(key.startsWith('../')||! /^(src|supabase\/functions)\//.test(key))throw Error('Fuente fuera del proyecto permitido.');
    if(files.has(key))return;
    const source=readFileSync(path,'utf8');files.set(key,source);
    for(const match of source.matchAll(/^\s*import\s+(?:[^;]*?\bfrom\s*)?['"]([^'"]+)['"]/gm)) {
      if(!match[1].startsWith('.'))throw Error('El handler local no admite dependencias externas.');
      visit(relative(base,resolve(dirname(path),match[1])));
    }
  };
  visit('supabase/functions/studyhub-plan/index.ts');return files;
}
export function localPlanningConfig() {
  const stage=resolve(root,'.tmp/studyhub-staging');
  if(!/project_id = "studyhub-staging"/.test(readFileSync(resolve(stage,'supabase/config.toml'),'utf8'))||existsSync(resolve(stage,'supabase/.temp/project-ref')))throw Error('Se requiere el proyecto desechable sin enlace remoto.');
  dockerLocal(['info','--format','{{.ServerVersion}}']);
  const auth=JSON.parse(dockerLocal(['inspect','supabase_auth_studyhub-staging']))[0];
  const storage=JSON.parse(dockerLocal(['inspect','supabase_storage_studyhub-staging']))[0];
  if(!auth.NetworkSettings.Networks['studyhub-staging-local']||!storage.NetworkSettings.Networks['studyhub-staging-local'])throw Error('Servicios fuera de la red desechable.');
  const env=Object.fromEntries(storage.Config.Env.map(v=>{const at=v.indexOf('=');return [v.slice(0,at),v.slice(at+1)];}));
  const key=env.SERVICE_KEY,anon=env.ANON_KEY;
  if(!key||!anon)throw Error('No se encontraron las claves generadas por Storage local. No se leerán archivos .env.');
  return {url:'http://127.0.0.1:54321',edge:'http://127.0.0.1:54329/functions/v1/studyhub-plan',service:key,anon};
}
export function startPlanningEdge() {
  const {service:key}=localPlanningConfig();
  const existing=dockerLocal(['ps','-a','--format','{{.Names}}']).trim().split('\n');
  if(existing.includes(planningContainer)) {
    if(dockerLocal(['inspect',planningContainer,'--format','{{index .Config.Labels "studyhub.disposable"}}']).trim()!=='true')throw Error('Contenedor desconocido; no se reemplaza.');
    dockerLocal(['rm','-f',planningContainer]);
  }
  const childEnv={...process.env,SUPABASE_URL:'http://supabase_kong_studyhub-staging:8000',SUPABASE_SERVICE_ROLE_KEY:key};
  dockerLocal(['run','-d','--name',planningContainer,'--label','studyhub.disposable=true','--network','studyhub-staging-local','-p','127.0.0.1:54329:8081','-e','SUPABASE_URL','-e','SUPABASE_SERVICE_ROLE_KEY','--entrypoint','sh','public.ecr.aws/supabase/edge-runtime:v1.77.8','-c','sleep infinity'],{env:childEnv,timeout:60000});
  try {
    // Stream each source directly to a fixed container path. No Windows mounts,
    // docker cp archive bootstrap, provider keys or host filesystem sharing.
    const sources=planningSources();
    sources.set('entry/index.ts',`const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);if(url.origin!=='http://supabase_kong_studyhub-staging:8000')throw Error('Destino no local bloqueado');return originalFetch(input,init);};
await import('../supabase/functions/studyhub-plan/index.ts');`);
    for(const [path,source] of sources) {
      if(!/^[A-Za-z0-9_./-]+$/.test(path))throw Error('Ruta de fuente inválida.');
      dockerLocal(['exec','-i',planningContainer,'sh','-c',`mkdir -p /tmp/studyhub/${path.slice(0,path.lastIndexOf('/'))} && cat > /tmp/studyhub/${path}`],{input:source});
    }
    dockerLocal(['exec','-d',planningContainer,'edge-runtime','start','--port','8081','--main-service','/tmp/studyhub/entry']);
    return {endpoint:'http://127.0.0.1:54329/functions/v1/studyhub-plan',files:sources.size,syntheticOnly:true};
  } catch(error) {dockerLocal(['stop',planningContainer]);throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {console.log(JSON.stringify(startPlanningEdge()));}catch(error){console.error(error.message);process.exitCode=1;}
}

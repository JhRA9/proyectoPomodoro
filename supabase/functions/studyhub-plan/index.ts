import { authenticateRequest } from '../studyhub-evaluate/requestStore.ts';
import { validateState } from '../../../src/data/schema.js';
import { validatePlanningTransition, currentContent, canonical } from '../../../src/planning/engine.js';

const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const answer=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(request:Request)=>{
  if(request.method==='OPTIONS')return answer({});
  if(request.method!=='POST')return answer({message:'Método no permitido.'},405);
  try {
    if(!request.headers.get('Authorization')?.startsWith('Bearer '))return answer({message:'Sesión requerida.'},401);
    const {url,key,user}=await authenticateRequest(request);
    // Bounded streaming read, before parsing or any write.
    const reader=request.body?.getReader();if(!reader)return answer({message:'Faltan datos.'},400);
    const chunks:Uint8Array[]=[];let bytes=0;
    while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>8000000){await reader.cancel();return answer({message:'Copia demasiado grande.'},413);}chunks.push(part.value);}
    const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
    const body=JSON.parse(new TextDecoder().decode(joined));
    if(!body||Object.keys(body).some(k=>!['state','expectedRevision'].includes(k)))return answer({message:'Solicitud inválida.'},400);
    validateState(body.state);
    if(body.expectedRevision!==null&&!Number.isSafeInteger(body.expectedRevision))return answer({message:'Revisión inválida.'},400);
    const serverHeaders={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
    const loaded=await fetch(`${url}/rest/v1/studyhub_states?user_id=eq.${encodeURIComponent(user.id)}&select=state,revision`,{headers:serverHeaders,signal:AbortSignal.timeout(15000)});
    if(!loaded.ok)return answer({message:'No se pudo leer la revisión actual.'},503);
    const rows=await loaded.json(),previous=rows[0]||null;
    if(previous&&canonical(previous.state)===canonical(body.state))return answer({data:previous});
    if((previous?.revision??null)!==body.expectedRevision)return answer({message:'Hay cambios de otro cliente. Conserva tu copia y reconcilia.',code:'STUDYHUB_CONFLICT'},409);
    validatePlanningTransition(previous?.state,body.state,user.id);
    // Only approved file evidence needs proof that the exact private object still exists.
    for(const plan of body.state.projectPlans||[])for(const evidence of currentContent(plan).evidence){
      if(!evidence.file||evidence.review?.status!=='approved')continue;
      const path=evidence.file.path;
      const info=await fetch(`${url}/storage/v1/object/info/studyhub-task-files/${path.split('/').map(encodeURIComponent).join('/')}`,{headers:{apikey:key,Authorization:request.headers.get('Authorization')!},signal:AbortSignal.timeout(15000)});
      if(!info.ok)return answer({message:'Una evidencia adjunta ya no está disponible. Márcala obsoleta y revisa el entregable.'},422);
      const metadata=await info.json(), modified=metadata.last_modified??metadata.lastModified??metadata.updated_at;
      const sameVersion=modified===evidence.file.version || (Number.isFinite(Date.parse(modified)) && Date.parse(modified)===Date.parse(evidence.file.version));
      if(!sameVersion)return answer({message:'La versión del adjunto cambió. Registra y verifica la nueva evidencia.'},422);
    }
    // Server-only CAS prevents a race between the preceding read and the write.
    const saved=await fetch(`${url}/rest/v1/rpc/studyhub_save_planned_snapshot`,{method:'POST',headers:serverHeaders,body:JSON.stringify({p_owner:user.id,p_state:body.state,p_expected_revision:body.expectedRevision}),signal:AbortSignal.timeout(15000)});
    if(!saved.ok)return answer({message:'No se pudo guardar el plan. Conserva tu copia local.'},503);
    const result=await saved.json();if(!result.length)return answer({message:'La revisión cambió; no se sobrescribió.',code:'STUDYHUB_CONFLICT'},409);
    return answer({data:result[0]});
  }catch(error){return answer({message:error instanceof Error?error.message:'Solicitud inválida.'},(error as any)?.code==='permission_error'?403:400);}
});

export const REAL_MODELS = Object.freeze({gemini:'gemini-3.8-flash',cloudflare:'@cf/openai/gpt-oss-120b'});
export const REAL_PLAN = Object.freeze({inferences:3,gemini:2,cloudflare:1,automaticRetries:0,profile:'fast',maxOutputTokens:[1800,1800,2500],syntheticDataOnly:true});
export function validateFreePreflight(record,now=Date.now()) {
 if(!record || record.projectRef!=='uchsgbpohigrtwpsxlnx' || record.authorized!==true)throw Error('Falta autorización documentada para staging');
 const age=now-Date.parse(record.checkedAt);
 if(!Number.isFinite(age)||age<0||age>7200000)throw Error('Revisar planes y cuota: evidencia de más de dos horas o fecha inválida');
 for(const provider of ['gemini','cloudflare']) {
  const p=record[provider];
  if(p?.plan!=='free'||p.paidOverflowDisabled!==true||p.model!==REAL_MODELS[provider]||p.modelAccessible!==true||!p.accountId||!p.evidence)throw Error(`Falta verificar gratuidad, cuenta y modelo de ${provider}`);
 }
 if(record.gemini.remainingRequests<2||!Number.isFinite(record.gemini.remainingRequests))throw Error('Cuota Gemini insuficiente');
 const cf=record.cloudflare;
 if(!Number.isFinite(cf.maximumEstimatedNeurons)||cf.maximumEstimatedNeurons<=0)throw Error('Estimación Cloudflare pendiente');
 if(Number.isFinite(cf.remainingNeurons)) {
  if(cf.remainingNeurons<cf.maximumEstimatedNeurons)throw Error('Cuota Cloudflare insuficiente');
 } else if(cf.remainingNeurons!==null||cf.hardFreeCapVerified!==true||cf.directApiWithoutGateway!==true||cf.dailyFreeAllocation!==10000||!cf.hardCapEvidence||cf.maximumEstimatedNeurons>cf.dailyFreeAllocation) {
  throw Error('Cuota Cloudflare desconocida sin un límite gratuito verificable');
 }
 // A verified Workers Free hard cap fails closed at exhaustion. An unreported
 // balance is not a claim of available quota; never substitute an invented value.
 return REAL_PLAN;
}

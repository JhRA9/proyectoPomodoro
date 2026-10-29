import {describe,it,expect} from 'vitest';
import {validateFreePreflight,REAL_MODELS} from '../scripts/real-inference-plan.mjs';
const now=Date.UTC(2026,9,29,15);
function record(){return {projectRef:'uchsgbpohigrtwpsxlnx',authorized:true,checkedAt:new Date(now).toISOString(),gemini:{plan:'free',paidOverflowDisabled:true,model:REAL_MODELS.gemini,modelAccessible:true,accountId:'fixture',evidence:'fixture only',remainingRequests:2},cloudflare:{plan:'free',paidOverflowDisabled:true,model:REAL_MODELS.cloudflare,modelAccessible:true,accountId:'fixture',evidence:'fixture only',remainingNeurons:10000,maximumEstimatedNeurons:1000}};}
describe('bounded real inference guard (no network)',()=>{
 it('limits the approved free run to three calls and zero retries',()=>{expect(validateFreePreflight(record(),now)).toMatchObject({inferences:3,automaticRetries:0});});
 it('rejects another environment',()=>{const r=record();r.projectRef='production';expect(()=>validateFreePreflight(r,now)).toThrow();});
 it('rejects outdated quota evidence',()=>{expect(()=>validateFreePreflight(record(),now+7200001)).toThrow();});
 it('rejects a paid plan even when requested',()=>{const r=record();r.cloudflare.plan='paid';expect(()=>validateFreePreflight(r,now)).toThrow();});
 it('rejects insufficient or missing quota',()=>{const r=record();r.gemini.remainingRequests=1;expect(()=>validateFreePreflight(r,now)).toThrow();r.gemini.remainingRequests=2;delete r.cloudflare.maximumEstimatedNeurons;expect(()=>validateFreePreflight(r,now)).toThrow();});
 it('rejects a model change',()=>{const r=record();r.gemini.model='different';expect(()=>validateFreePreflight(r,now)).toThrow();});
 it('allows an unknown balance only under a documented nonbillable hard cap',()=>{const r=record();Object.assign(r.cloudflare,{remainingNeurons:null,hardFreeCapVerified:true,directApiWithoutGateway:true,dailyFreeAllocation:10000,hardCapEvidence:'fixture hard cap'});expect(validateFreePreflight(r,now).inferences).toBe(3);r.cloudflare.hardFreeCapVerified=false;expect(()=>validateFreePreflight(r,now)).toThrow();});
 it('does not treat missing or insufficient balance as a free allowance',()=>{const r=record();delete r.cloudflare.remainingNeurons;expect(()=>validateFreePreflight(r,now)).toThrow();Object.assign(r.cloudflare,{remainingNeurons:10,hardFreeCapVerified:true,directApiWithoutGateway:true,dailyFreeAllocation:10000,hardCapEvidence:'fixture'});expect(()=>validateFreePreflight(r,now)).toThrow();});
});

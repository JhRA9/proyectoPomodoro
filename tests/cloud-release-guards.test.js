import { describe, it, expect, vi } from "vitest";
import { cloudStagingConfig, CLOUD_STAGING_REF, CLOUD_STAGING_URL } from "../scripts/cloud-staging.mjs";
import { SupabaseStateGateway } from "../src/data/cloudAdapter.js";
import { createEmptyState } from "../src/data/schema.js";
import { parseReview } from "../supabase/functions/studyhub-evaluate/validation.ts";

describe("cloud release guards",()=>{
  const env={STUDYHUB_STAGING_CONFIRM:"disposable-cloud-synthetic-only",STUDYHUB_STAGING_REF:CLOUD_STAGING_REF,STUDYHUB_STAGING_URL:CLOUD_STAGING_URL,STUDYHUB_STAGING_ANON_KEY:"synthetic",STUDYHUB_STAGING_SERVICE_KEY:"synthetic"};
  it("only accepts the independently enrolled cloud project",()=>{
    expect(cloudStagingConfig(env).cloud).toBe(true);
    for(const patch of [{STUDYHUB_STAGING_CONFIRM:""},{STUDYHUB_STAGING_REF:"production"},{STUDYHUB_STAGING_URL:"https://bevgxczbxjkzpxlbxnhd.supabase.co"},{STUDYHUB_STAGING_URL:CLOUD_STAGING_URL+"/"},{STUDYHUB_STAGING_SERVICE_KEY:""}]) expect(()=>cloudStagingConfig({...env,...patch})).toThrow();
  });
  it("uses the optional RPC without falling back to an unsafe direct write",async()=>{
    const state=createEmptyState();const single=vi.fn(async()=>({data:{state,revision:0},error:null}));
    const client={from:vi.fn(),rpc:vi.fn(()=>({select:()=>({maybeSingle:single})}))};
    const gateway=new SupabaseStateGateway({client,userId:"account-a",useSnapshotRpc:true});
    expect((await gateway.save(state,{expectedRevision:null})).data).toEqual(state);
    expect(client.rpc).toHaveBeenCalledWith("studyhub_save_snapshot",{p_state:state,p_expected_revision:null});
    single.mockResolvedValue({data:null,error:{code:"PGRST202"}});
    await expect(gateway.save(state,{expectedRevision:null})).rejects.toMatchObject({code:"PGRST202"});
    expect(client.from).not.toHaveBeenCalled();
  });
  it("rejects missing, repeated, unknown and nonnumeric provider criteria",()=>{
    const payload={rubric:{criteria:[{id:"correctness"}]}};
    const good={summary:"Synthetic",provisionalLevel:null,scores:[{criterionId:"correctness",score:2,justification:"Observed"}],strengths:[],weaknesses:[],recommendations:[],demonstratedCompetencyIds:[],notDemonstratedCompetencyIds:[]};
    expect(parseReview(JSON.stringify(good),payload)).toEqual(good);
    for(const scores of [[],[...good.scores,...good.scores],[{...good.scores[0],criterionId:"foreign"}],[{...good.scores[0],score:"2"}],[{...good.scores[0],score:-1}]]) expect(()=>parseReview(JSON.stringify({...good,scores}),payload)).toThrow();
  });
});

import { describe,it,expect } from "vitest";
import { stagingConfig, stagingFixture } from "../scripts/verify-local-staging.mjs";
import { migrateAttempts, migrationBackup, restoreMigrationBackup } from "../src/evaluation/attempts.js";
describe("staging runner safety",()=>{
  const env={STUDYHUB_STAGING_CONFIRM:"disposable-local-only",STUDYHUB_STAGING_URL:"http://127.0.0.1:54321",STUDYHUB_STAGING_ANON_KEY:"synthetic",STUDYHUB_STAGING_SERVICE_KEY:"synthetic"};
  it("rejects absent opt-in before any network",()=>{expect(()=>stagingConfig({})).toThrow(/No ejecutado/);});
  it("allows only the explicit isolated local endpoint",()=>{
    expect(stagingConfig(env).url).toBe("http://127.0.0.1:54321");
    for(const url of ["https://project.supabase.co","http://localhost:54321","http://127.0.0.1:54321@evil.test","http://127.0.0.1:54321/path","http://127.0.0.1:54321?key=secret","http://127.0.0.1:54322","https://127.0.0.1:54321"]) expect(()=>stagingConfig({...env,STUDYHUB_STAGING_URL:url})).toThrow(/Solo se admite/);
  });
  it("does not inherit application credentials",()=>{expect(()=>stagingConfig({...env,STUDYHUB_STAGING_SERVICE_KEY:"",SUPABASE_SERVICE_ROLE_KEY:"do-not-use"})).toThrow(/Faltan/);});
  it("prepares synthetic history with two legacy records and one attempt with two reviews",async()=>{
    const state=await stagingFixture(),backup=migrationBackup(state),converted=migrateAttempts(state);
    expect(converted.evaluations).toHaveLength(3);expect(converted.evaluations[2].reviews).toHaveLength(2);
    expect(converted.evaluations.slice(0,2).map(e=>e.reviews[0].original)).toEqual(state.evaluations.slice(0,2));
    expect(restoreMigrationBackup(backup)).toEqual(state);
  });
});

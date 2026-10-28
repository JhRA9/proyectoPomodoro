import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import { verifyLocalStaging } from "./verify-local-staging.mjs";

// Enrolled by observing the newly created, empty FREE project in the dashboard.
// This allowlist is intentionally not a general-purpose remote test runner.
export const CLOUD_STAGING_REF = "uchsgbpohigrtwpsxlnx";
export const CLOUD_STAGING_URL = `https://${CLOUD_STAGING_REF}.supabase.co`;
export function cloudStagingConfig(env) {
  if (env.STUDYHUB_STAGING_CONFIRM !== "disposable-cloud-synthetic-only" || env.STUDYHUB_STAGING_REF !== CLOUD_STAGING_REF || env.STUDYHUB_STAGING_URL !== CLOUD_STAGING_URL) throw Error("Cloud staging no confirmado o referencia fuera de la lista permitida. No se realizó ninguna conexión.");
  if (!env.STUDYHUB_STAGING_ANON_KEY || !env.STUDYHUB_STAGING_SERVICE_KEY) throw Error("Faltan claves del proyecto staging; nunca se heredan credenciales de la aplicación.");
  return { url:CLOUD_STAGING_URL, anon:env.STUDYHUB_STAGING_ANON_KEY, service:env.STUDYHUB_STAGING_SERVICE_KEY, cloud:true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result={at:new Date().toISOString(),environment:"isolated-cloud",projectRef:CLOUD_STAGING_REF,...await verifyLocalStaging(cloudStagingConfig(process.env))};
    writeFileSync(new URL("../docs/studyhub2/cloud-staging-results.json",import.meta.url),JSON.stringify(result,null,2)+"\n");
    console.log(JSON.stringify(result,null,2));
  } catch(error) { console.error(`Cloud staging falló (${error.name}); ${String(error.stack).split("\n").find(line=>line.includes("file:")) || "sin traza local"}. No se publican respuestas ni credenciales.`); process.exitCode=1; }
}

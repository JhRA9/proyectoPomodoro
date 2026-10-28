$ErrorActionPreference = 'Stop'
$env:DOCKER_CONTEXT = 'desktop-linux'
$projectRoot = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $projectRoot '.tmp/studyhub-staging'
if (!(Test-Path (Join-Path $stage 'supabase/config.toml'))) { throw 'Initialize isolated studyhub-staging first' }
if ((Get-Content (Join-Path $stage 'supabase/config.toml') -Raw) -notmatch 'project_id = "studyhub-staging"') { throw 'Wrong local project' }
$raw = npm exec --yes --package=supabase@2.122.0 -- supabase status --workdir $stage -o json 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Local Supabase services unavailable' }
$localStatus = ($raw -join "`n") | ConvertFrom-Json
if ($localStatus.API_URL -ne 'http://127.0.0.1:54321') { throw 'Unexpected endpoint' }
$edge = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'StudyHubStaging/edge'
New-Item -ItemType Directory -Path $edge -Force | Out-Null
Copy-Item (Join-Path $projectRoot 'supabase/functions/studyhub-evaluate/*.ts') $edge
Copy-Item (Join-Path $edge 'index.ts') (Join-Path $edge 'actual.ts')
Copy-Item (Join-Path $PSScriptRoot 'staging-edge-auth.ts') (Join-Path $edge 'index.ts')
Copy-Item (Join-Path $PSScriptRoot 'staging-edge-wrapper.ts') (Join-Path $edge 'transport.ts')
# Only local disposable credentials, passed through this process, never printed or stored.
$env:SUPABASE_URL = 'http://supabase_kong_studyhub-staging:8000'
$env:SUPABASE_SERVICE_ROLE_KEY = $localStatus.SERVICE_ROLE_KEY
# Avoid Windows host mounts/stdin archive copies: source is passed only to this disposable container.
$env:STAGING_ENTRY = Get-Content (Join-Path $edge 'index.ts') -Raw
$env:STAGING_TRANSPORT = Get-Content (Join-Path $edge 'transport.ts') -Raw
$env:STAGING_ACTUAL = Get-Content (Join-Path $edge 'actual.ts') -Raw
$env:STAGING_STORE = Get-Content (Join-Path $edge 'requestStore.ts') -Raw
$env:STAGING_AREAS = Get-Content (Join-Path $edge 'areaSuggestions.ts') -Raw
$bootstrap = 'mkdir -p /tmp/studyhub; printf %s "$STAGING_ENTRY" > /tmp/studyhub/index.ts; printf %s "$STAGING_TRANSPORT" > /tmp/studyhub/transport.ts; printf %s "$STAGING_ACTUAL" > /tmp/studyhub/actual.ts; printf %s "$STAGING_STORE" > /tmp/studyhub/requestStore.ts; printf %s "$STAGING_AREAS" > /tmp/studyhub/areaSuggestions.ts; exec edge-runtime start --port 8081 --main-service /tmp/studyhub'
$existing = docker ps -a --filter name=studyhub-staging-edge-synthetic --format '{{.Names}}'
if ($existing -contains 'studyhub-staging-edge-synthetic') {
  $label = docker inspect studyhub-staging-edge-synthetic --format '{{index .Config.Labels "studyhub.disposable"}}'
  if ($label -ne 'true') { throw 'Refusing to replace an unknown container' }
  docker rm -f studyhub-staging-edge-synthetic | Out-Null
}
docker run -d --name studyhub-staging-edge-synthetic --label studyhub.disposable=true --network studyhub-staging-local --network-alias supabase_edge_runtime_studyhub-staging -p 127.0.0.1:54328:8081 -e SUPABASE_URL -e SUPABASE_SERVICE_ROLE_KEY -e STAGING_ENTRY -e STAGING_TRANSPORT -e STAGING_ACTUAL -e STAGING_STORE -e STAGING_AREAS -e GEMINI_API_KEY=synthetic-no-provider-key -e GEMINI_MODEL=synthetic-gemini -e CLOUDFLARE_API_TOKEN=synthetic-no-provider-token -e CLOUDFLARE_ACCOUNT_ID=synthetic-account -e CLOUDFLARE_MODEL=synthetic-cloudflare --entrypoint sh public.ecr.aws/supabase/edge-runtime:v1.77.8 -c $bootstrap
if ($LASTEXITCODE -ne 0) { throw 'Could not start disposable Edge Runtime' }
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY,Env:STAGING_ENTRY,Env:STAGING_TRANSPORT,Env:STAGING_ACTUAL,Env:STAGING_STORE,Env:STAGING_AREAS -ErrorAction SilentlyContinue

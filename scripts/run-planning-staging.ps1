$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $projectRoot '.tmp/studyhub-staging'
if ((Get-Content -LiteralPath (Join-Path $stage 'supabase/config.toml') -Raw) -notmatch 'project_id = "studyhub-staging"') { throw 'Entorno local inesperado' }
$env:DOCKER_CONTEXT = 'desktop-linux'
$raw = npm exec --yes --package=supabase@2.122.0 -- supabase status --workdir $stage -o json 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Supabase local no esta listo. No se ejecuto la prueba.' }
$status = ($raw -join "`n") | ConvertFrom-Json
if ($status.API_URL -ne 'http://127.0.0.1:54321') { throw 'Se rechazo un destino no local' }
try {
  $env:STUDYHUB_STAGING_CONFIRM = 'disposable-local-only'
  $env:STUDYHUB_STAGING_URL = $status.API_URL
  $env:STUDYHUB_STAGING_ANON_KEY = $status.ANON_KEY
  $env:STUDYHUB_STAGING_SERVICE_KEY = $status.SERVICE_ROLE_KEY
  node (Join-Path $projectRoot 'scripts/verify-planning-staging.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Prueba de planificacion no aprobada' }
} finally {
  Remove-Item Env:STUDYHUB_STAGING_CONFIRM,Env:STUDYHUB_STAGING_URL,Env:STUDYHUB_STAGING_ANON_KEY,Env:STUDYHUB_STAGING_SERVICE_KEY -ErrorAction SilentlyContinue
}

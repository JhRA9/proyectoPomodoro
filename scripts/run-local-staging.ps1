param([ValidateSet('integration','history')][string]$Check = 'integration')
$ErrorActionPreference = 'Stop'
$env:DOCKER_CONTEXT = 'desktop-linux'
$projectRoot = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $projectRoot '.tmp/studyhub-staging'
$raw = npm exec --yes --package=supabase@2.122.0 -- supabase status --workdir $stage -o json 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Isolated local Supabase is not ready' }
$localStatus = ($raw -join "`n") | ConvertFrom-Json
if ($localStatus.API_URL -ne 'http://127.0.0.1:54321') { throw 'Unexpected endpoint' }
$env:STUDYHUB_STAGING_CONFIRM = 'disposable-local-only'
$env:STUDYHUB_STAGING_URL = $localStatus.API_URL
$env:STUDYHUB_STAGING_ANON_KEY = $localStatus.ANON_KEY
$env:STUDYHUB_STAGING_SERVICE_KEY = $localStatus.SERVICE_ROLE_KEY
$file = if ($Check -eq 'history') { 'verify-staging-history.mjs' } else { 'verify-local-staging.mjs' }
try { node (Join-Path $PSScriptRoot $file); $code = $LASTEXITCODE }
finally { Remove-Item Env:STUDYHUB_STAGING_ANON_KEY,Env:STUDYHUB_STAGING_SERVICE_KEY -ErrorAction SilentlyContinue }
exit $code

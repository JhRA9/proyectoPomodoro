$ErrorActionPreference = 'Stop'
$env:DOCKER_CONTEXT = 'desktop-linux'
$projectRoot = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $projectRoot '.tmp/studyhub-staging'
docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop and wait for its Linux engine before retrying.' }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$config = Join-Path $stage 'supabase/config.toml'
if (!(Test-Path $config)) {
  npm exec --yes --package=supabase@2.122.0 -- supabase init --workdir $stage
  if ($LASTEXITCODE -ne 0) { throw 'Local Supabase initialization failed' }
}
$text = Get-Content $config -Raw
if ($text -notmatch 'project_id = "studyhub-staging"' -or (Test-Path (Join-Path $stage 'supabase/.temp/project-ref'))) { throw 'Not the disposable unlinked project' }
# Never import environment values or linked configuration from the application.
$text = $text -replace 'env\([A-Z0-9_]+\)', ''
$text = $text -replace '(?ms)(\[analytics\]\s*)enabled = true', '$1enabled = false'
[IO.File]::WriteAllText($config,$text)
New-Item -ItemType Directory -Path (Join-Path $stage 'supabase/migrations'),(Join-Path $stage 'supabase/functions') -Force | Out-Null
Copy-Item (Join-Path $projectRoot 'supabase/migrations/*.sql') (Join-Path $stage 'supabase/migrations')
Copy-Item (Join-Path $projectRoot 'supabase/functions/studyhub-evaluate') (Join-Path $stage 'supabase/functions') -Recurse -Force
$names = docker network ls --format '{{.Name}}'
if ('studyhub-staging-local' -notin $names) { docker network create -o com.docker.network.bridge.host_binding_ipv4=127.0.0.1 studyhub-staging-local | Out-Null }
# Exclude Windows archive/mount bootstrap; the official Edge Runtime is started separately.
$core = @('supabase_db_studyhub-staging','supabase_kong_studyhub-staging','supabase_auth_studyhub-staging','supabase_rest_studyhub-staging','supabase_storage_studyhub-staging','supabase_realtime_studyhub-staging','supabase_inbucket_studyhub-staging')
$existing = docker ps -a --format '{{.Names}}'
if (@($core | Where-Object {$_ -notin $existing}).Count -eq 0) {
  # Avoid the CLI inspecting the original stalled Windows archive container on resume.
  foreach ($name in $core) { docker start $name | Out-Null; if ($LASTEXITCODE -ne 0) {throw "Cannot resume $name"} }
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    $health = docker inspect supabase_db_studyhub-staging supabase_auth_studyhub-staging supabase_storage_studyhub-staging --format '{{.State.Health.Status}}'
    if (@($health | Where-Object {$_ -ne 'healthy'}).Count -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
  }
  if (!$ready) {throw 'Local services did not become healthy; inspect Docker Desktop.'}
  Write-Output 'Resumed the existing disposable StudyHub core services.'
  return
}
npm exec --yes --package=supabase@2.122.0 -- supabase start --workdir $stage --network-id studyhub-staging-local --exclude edge-runtime,studio,postgres-meta *> (Join-Path $stage 'prepare.log')
if ($LASTEXITCODE -ne 0) { throw "Local startup failed. Inspect $stage/prepare.log (local credentials may be included)." }
Write-Output 'Local Auth, Postgres and Storage ready. No remote project was linked.'

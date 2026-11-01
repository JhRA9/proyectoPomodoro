$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $projectRoot '.tmp/studyhub-staging'
$config = Join-Path $stage 'supabase/config.toml'
if (!(Test-Path -LiteralPath $config) -or (Get-Content -LiteralPath $config -Raw) -notmatch 'project_id = "studyhub-staging"') {
  throw 'Falta el entorno local aislado studyhub-staging. Sigue el procedimiento de staging antes de preparar la prueba.'
}
# Source copies only. No credentials, database reset, remote command or deployment.
foreach ($relative in @('src','supabase/functions/studyhub-plan','supabase/functions/studyhub-evaluate','supabase/migrations')) {
  $source = Join-Path $projectRoot $relative
  $destination = Join-Path $stage $relative
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
}
Write-Output 'Fuentes preparadas en .tmp/studyhub-staging. No se modifico ninguna base de datos.'
Write-Output 'Con Docker listo: supabase start --workdir .tmp/studyhub-staging'
Write-Output 'Luego: supabase migration up --local --workdir .tmp/studyhub-staging'
Write-Output 'Luego: supabase functions serve studyhub-plan --workdir .tmp/studyhub-staging'
Write-Output 'En otra consola: scripts/run-planning-staging.ps1'

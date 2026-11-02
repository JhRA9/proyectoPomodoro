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
Write-Output 'Con Docker listo y los servicios desechables existentes: node scripts/run-planning-local.mjs'
Write-Output 'Este ejecutor evita el antiguo bloqueo de montajes/docker cp, aplica SQL local y ensaya la reversion.'
Write-Output 'Si faltan servicios: scripts/prepare-local-staging.ps1; despues repetir el ejecutor Node.'
Write-Output 'No mezclar migration up con esta copia desechable: el ensayo aplica SQL directamente, sin modificar el registro de migraciones de la CLI.'

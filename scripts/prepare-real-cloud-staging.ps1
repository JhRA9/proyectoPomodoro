#requires -Version 7.0
param([switch]$Deploy, [switch]$PreserveProviderSecrets)
$ErrorActionPreference = 'Stop'
$stageRef = 'uchsgbpohigrtwpsxlnx'
$root = Split-Path $PSScriptRoot -Parent
$projects = (npm.cmd exec --yes --package=supabase@2.122.0 -- supabase projects list -o json 2>$null | Out-String) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or !($projects | Where-Object {$_.id -eq $stageRef -and $_.name -eq 'StudyHub Staging V2'})) { throw 'Staging identity not verified' }
# A fresh package cannot inherit the synthetic wrapper/actual.ts from the old test package.
$stage = Join-Path $root ('.tmp/real-cloud-' + [Guid]::NewGuid().ToString('N'))
$edge = Join-Path $stage 'supabase/functions/studyhub-evaluate'
New-Item -ItemType Directory -Path $edge -Force | Out-Null
$sources = Get-ChildItem (Join-Path $root 'supabase/functions/studyhub-evaluate') -Filter '*.ts'
foreach ($source in $sources) { Copy-Item -LiteralPath $source.FullName -Destination $edge }
[IO.File]::WriteAllText((Join-Path $stage 'supabase/config.toml'),"project_id = `"studyhub-real-staging`"`n[functions.studyhub-evaluate]`nverify_jwt = false`n")
# Managed JWTs are authenticated in requestStore.ts via Auth.getUser; this setting
# is isolated to the disposable workdir and never changes production config.
$manifest = @($sources | ForEach-Object { @{ file=$_.Name; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower() } })
if ($Deploy) {
  # Remove ONLY known fixture secrets by digest. Refuse to overwrite real keys.
  $secrets = (npm.cmd exec --yes --package=supabase@2.122.0 -- supabase secrets list --project-ref $stageRef -o json 2>$null | Out-String) | ConvertFrom-Json
  if ($LASTEXITCODE -ne 0) { throw 'Cannot verify fixture secrets' }
  $fixtures = @{ GEMINI_API_KEY='synthetic-no-provider-key'; GEMINI_MODEL='synthetic-gemini'; CLOUDFLARE_API_TOKEN='synthetic-no-provider-token'; CLOUDFLARE_ACCOUNT_ID='synthetic-account'; CLOUDFLARE_MODEL='synthetic-cloudflare' }
  $remove = @()
  foreach ($name in $fixtures.Keys) {
    $existing = $secrets | Where-Object name -eq $name
    if ($existing) {
      $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($fixtures[$name]))).ToLower()
      if ($existing.value -ne $hash -and $existing.digest -ne $hash) {
        if ($PreserveProviderSecrets) { continue }
        throw "Non-fixture secret $name present; preserve it and review separately before real deployment"
      }
      $remove += $name
    }
  }
  if ($remove.Count) {
    npm.cmd exec --yes --package=supabase@2.122.0 -- supabase secrets unset @remove --project-ref $stageRef --yes
    if ($LASTEXITCODE -ne 0) { throw 'Could not remove synthetic configuration' }
  }
  npm.cmd exec --yes --package=supabase@2.122.0 -- supabase functions deploy studyhub-evaluate --project-ref $stageRef --workdir $stage --use-api
  if ($LASTEXITCODE -ne 0) { throw 'Real staging deployment failed' }
}
$manifestFile = if ($PreserveProviderSecrets) { 'docs/studyhub2/cloud-real-handler-latest-package.json' } else { 'docs/studyhub2/cloud-real-handler-package.json' }
@{ at=[DateTime]::UtcNow.ToString('o'); projectRef=$stageRef; deployed=[bool]$Deploy; syntheticTransport=$false; preserveProviderSecrets=[bool]$PreserveProviderSecrets; files=$manifest } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $root $manifestFile)
Write-Output 'Real handler package prepared; no production configuration was used.'

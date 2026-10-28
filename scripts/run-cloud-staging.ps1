#requires -Version 7.0
param([ValidateSet('integration','transition','reversal','registration')][string]$Check='integration',[switch]$LegacyWindow)
$ErrorActionPreference = 'Stop'
$stageRef = 'uchsgbpohigrtwpsxlnx'
$projects = (npm.cmd exec --yes --package=supabase@2.122.0 -- supabase projects list -o json 2>$null | Out-String) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or !($projects | Where-Object {$_.id -eq $stageRef -and $_.name -eq 'StudyHub Staging V2'})) { throw 'Staging identity not verified' }
# Keep staging secrets in this process only; never write them or print CLI output.
$keys = (npm.cmd exec --yes --package=supabase@2.122.0 -- supabase projects api-keys --project-ref $stageRef --reveal -o json 2>$null | Out-String) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cannot read staging keys' }
$env:STUDYHUB_STAGING_ANON_KEY = ($keys | Where-Object {$_.name -eq 'anon'}).api_key
$env:STUDYHUB_STAGING_SERVICE_KEY = ($keys | Where-Object {$_.name -eq 'service_role'}).api_key
$env:STUDYHUB_STAGING_CONFIRM = 'disposable-cloud-synthetic-only'
$env:STUDYHUB_STAGING_REF = $stageRef
$env:STUDYHUB_STAGING_URL = "https://$stageRef.supabase.co"
try {
  if ($LegacyWindow) {
    if ($Check -ne 'integration') { throw 'LegacyWindow applies only to the legacy integration suite' }
    npm.cmd exec --yes --package=supabase@2.122.0 -- supabase db query --linked --project-ref $stageRef --file (Join-Path $PSScriptRoot '../supabase/transitions/disable_snapshot_cas.sql') -o json | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not open disposable staging legacy test window' }
  }
  $script = switch ($Check) { 'transition' {'verify-cloud-transition.mjs'} 'reversal' {'verify-cloud-gate-reversal.mjs'} 'registration' {'verify-cloud-registration.mjs'} default {'cloud-staging.mjs'} }
  node (Join-Path $PSScriptRoot $script); if ($LASTEXITCODE -ne 0) {throw 'Cloud staging checks failed'}
}
finally {
  Remove-Item Env:STUDYHUB_STAGING_ANON_KEY,Env:STUDYHUB_STAGING_SERVICE_KEY,Env:STUDYHUB_STAGING_CONFIRM,Env:STUDYHUB_STAGING_REF,Env:STUDYHUB_STAGING_URL -ErrorAction SilentlyContinue; $keys=$null
  if ($LegacyWindow -and $Check -eq 'integration') {
    npm.cmd exec --yes --package=supabase@2.122.0 -- supabase db query --linked --project-ref $stageRef --file (Join-Path $PSScriptRoot '../supabase/transitions/enable_snapshot_cas.sql') -o json | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Staging gate NOT restored; stop tests and re-enable it on the enrolled staging project' }
  }
}

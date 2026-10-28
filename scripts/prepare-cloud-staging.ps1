#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$stageRef = 'uchsgbpohigrtwpsxlnx'
$root = Split-Path $PSScriptRoot -Parent
$stage = Join-Path $root '.tmp/studyhub-cloud-staging'
$projects = (npm.cmd exec --yes --package=supabase@2.122.0 -- supabase projects list -o json 2>$null | Out-String) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or !($projects | Where-Object {$_.id -eq $stageRef -and $_.name -eq 'StudyHub Staging V2'})) { throw 'Staging identity not verified' }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$edge = Join-Path $stage 'supabase/functions/studyhub-evaluate'
New-Item -ItemType Directory -Path $edge -Force | Out-Null
Copy-Item (Join-Path $root 'supabase/functions/studyhub-evaluate/*.ts') $edge -Force
Copy-Item (Join-Path $edge 'index.ts') (Join-Path $edge 'actual.ts') -Force
$wrapper = Get-Content (Join-Path $PSScriptRoot 'staging-edge-wrapper.ts') -Raw
$transport = $wrapper.Substring($wrapper.IndexOf('globalThis.fetch ='))
$prefix = @'
// TEST ONLY: deployed exclusively to the enrolled disposable cloud project.
const nativeFetch = globalThis.fetch;
const localOrigin = new URL(Deno.env.get("SUPABASE_URL")!).origin;
if (localOrigin !== "https://uchsgbpohigrtwpsxlnx.supabase.co") throw new Error("Wrong cloud staging project");
if (Deno.env.get("GEMINI_API_KEY") !== "synthetic-no-provider-key" || Deno.env.get("CLOUDFLARE_API_TOKEN") !== "synthetic-no-provider-token") throw new Error("Synthetic credentials required");
'@
[IO.File]::WriteAllText((Join-Path $edge 'index.ts'),$prefix+"`n"+$transport)
# No production config/link is read or modified. Auth is verified in the real
# handler against /auth/v1/user, supporting asymmetric managed-project JWTs.
[IO.File]::WriteAllText((Join-Path $stage 'supabase/config.toml'),"project_id = `"studyhub-cloud-staging`"`n[functions.studyhub-evaluate]`nverify_jwt = false`n")
Write-Output 'Prepared synthetic deployment package for the enrolled staging project only.'

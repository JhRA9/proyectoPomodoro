# Preserve the disposable volumes/backups, and do not stop other projects.
$env:DOCKER_CONTEXT = 'desktop-linux'
$owned = @('studyhub-staging-edge-synthetic','supabase_storage_studyhub-staging','supabase_rest_studyhub-staging','supabase_realtime_studyhub-staging','supabase_inbucket_studyhub-staging','supabase_auth_studyhub-staging','supabase_kong_studyhub-staging','supabase_db_studyhub-staging')
$running = docker ps --format '{{.Names}}'
foreach ($name in $owned) { if ($running -contains $name) { docker stop --time 10 $name | Out-Null; if ($LASTEXITCODE -ne 0) { throw "Failed to stop $name" } } }
Write-Output 'StudyHub staging stopped. Other projects were not changed.'

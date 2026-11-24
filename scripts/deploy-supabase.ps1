param(
  [string]$ProjectRef = 'bsgkldfcknrbxsebavgq',
  [switch]$SkipDbPush
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host '==================================================' -ForegroundColor Cyan
Write-Host "  Meu Dia - Deploy Supabase ($ProjectRef)" -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan

Write-Host '[1/4] Vinculando projeto Supabase...' -ForegroundColor Yellow
npx supabase link --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) {
  throw 'Falha ao vincular projeto. Execute "npx supabase login" ou defina SUPABASE_ACCESS_TOKEN antes de rodar.'
}

if (-not $SkipDbPush) {
  Write-Host '[2/4] Aplicando migrations SQL (0001, 0002, 0003)...' -ForegroundColor Yellow
  npx supabase db push
  if ($LASTEXITCODE -ne 0) {
    throw 'Falha em npx supabase db push. Você também pode colar supabase/deploy_all_migrations.sql no SQL Editor.'
  }
} else {
  Write-Host '[2/4] Pulando db push (-SkipDbPush)...' -ForegroundColor DarkYellow
}

Write-Host '[3/4] Enviando segredos das Edge Functions (supabase/functions/.env)...' -ForegroundColor Yellow
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'sync-supabase-secrets.ps1')
if ($LASTEXITCODE -ne 0) {
  throw 'Falha ao sincronizar segredos.'
}

Write-Host '[4/4] Publicando Edge Functions (assistant-ingest, dispatch-notifications, pontes)...' -ForegroundColor Yellow
foreach ($fn in @('assistant-ingest', 'dispatch-notifications', 'bridge-rotinas', 'bridge-passatempos')) {
  Write-Host "  -> Deploying $fn..." -ForegroundColor Cyan
  npx supabase functions deploy $fn --no-verify-jwt --remote=$ProjectRef --yes
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao publicar Edge Function $fn."
  }
}

Write-Host ''
Write-Host '==================================================' -ForegroundColor Green
Write-Host '  DEPLOY SUPABASE CONCLUÍDO COM SUCESSO!' -ForegroundColor Green
Write-Host '==================================================' -ForegroundColor Green

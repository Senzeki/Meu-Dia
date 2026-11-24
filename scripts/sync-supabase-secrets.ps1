param(
  [string]$EnvFile = ''
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) {
  $EnvFile = Join-Path $ProjectRoot 'supabase\functions\.env'
}

if (-not (Test-Path $EnvFile)) {
  throw "Arquivo de segredos não encontrado: $EnvFile"
}

$pairs = @()
Get-Content -Path $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  if ($line -match '^([A-Za-z0-9_]+)=(.+)$') {
    $key = $matches[1].Trim()
    $val = $matches[2].Trim()
    if ($val.Length -gt 0) {
      $pairs += "$key=$val"
    }
  }
}

if ($pairs.Count -eq 0) {
  Write-Host 'Nenhum segredo preenchido encontrado para enviar.' -ForegroundColor Yellow
  exit 0
}

Write-Host "==> Enviando $($pairs.Count) segredos para o Supabase (Edge Functions)..." -ForegroundColor Cyan
& npx supabase secrets set @pairs
if ($LASTEXITCODE -ne 0) {
  throw 'Falha ao enviar secrets. Confirme se você já executou "npx supabase login" e "npx supabase link --project-ref <SEU_REF>".'
}

Write-Host '==> Segredos sincronizados com sucesso no Supabase!' -ForegroundColor Green

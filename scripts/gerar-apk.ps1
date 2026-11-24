param(
  [string]$Version,
  [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not $Version) {
  $pkg = Get-Content -Raw -Path (Join-Path $ProjectRoot 'package.json') | ConvertFrom-Json
  $Version = if ($pkg.version) { [string]$pkg.version } else { '0.1.0' }
}

Write-Host "==> Meu Dia APK Builder (v$Version)" -ForegroundColor Cyan

# 1. Detectar JAVA_HOME compatível com Gradle (JDK 17 ou 21; evita JDK 25+ de versões novas do Android Studio)
function Get-JavaMajorVersion([string]$javaHome) {
  $releaseFile = Join-Path $javaHome 'release'
  if (-not (Test-Path $releaseFile)) { return 0 }
  $line = Select-String -Path $releaseFile -Pattern '^JAVA_VERSION="(\d+)' | Select-Object -First 1
  if ($line -and $line.Matches.Groups.Count -gt 1) {
    return [int]$line.Matches.Groups[1].Value
  }
  return 0
}

$currentJavaMajor = if ($env:JAVA_HOME -and (Test-Path $env:JAVA_HOME)) {
  Get-JavaMajorVersion $env:JAVA_HOME
} else {
  0
}

if ($currentJavaMajor -lt 17 -or $currentJavaMajor -gt 21) {
  $javaRoots = @(
    'C:\Program Files\Microsoft',
    'C:\Program Files\Eclipse Adoptium',
    'C:\Program Files\Java',
    'C:\Program Files\Zulu'
  )
  $foundJdks = @(
    foreach ($root in $javaRoots) {
      if (Test-Path $root) {
        Get-ChildItem -Path $root -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty FullName
        Get-ChildItem -Path $root -Directory -Filter 'zulu-21*' -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty FullName
      }
    }
  )
  $javaCandidates = @($foundJdks + @('C:\Program Files\Android\Android Studio\jbr') | Where-Object { $_ -and (Test-Path $_) })

  if ($javaCandidates.Count -gt 0) {
    $env:JAVA_HOME = $javaCandidates[0]
  }
}

if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
  throw 'JAVA_HOME não encontrado. Instale o JDK 21 ou Android Studio (jbr) e configure JAVA_HOME.'
}
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
Write-Host "JAVA_HOME: $env:JAVA_HOME"

# 2. Detectar ANDROID_HOME
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
  $sdkDefault = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $sdkDefault) {
    $env:ANDROID_HOME = $sdkDefault
  }
}

if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
  throw 'ANDROID_HOME não encontrado. Configure o Android SDK em %LOCALAPPDATA%\Android\Sdk.'
}
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
Write-Host "ANDROID_HOME: $env:ANDROID_HOME"

# 3. Build Web + Sync Capacitor
if (-not $SkipWebBuild) {
  Write-Host '==> Executando npm run build...' -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Falha em npm run build.' }
}

Write-Host '==> Sincronizando Capacitor Android (npx cap sync android)...' -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Falha em npx cap sync android.' }

# 4. Compilar APK Debug via Gradle
$AndroidDir = Join-Path $ProjectRoot 'android'
Push-Location $AndroidDir
try {
  Write-Host '==> Compilando APK Debug (gradlew.bat assembleDebug)...' -ForegroundColor Yellow
  .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) { throw 'Falha no build Gradle assembleDebug.' }
} finally {
  Pop-Location
}

$SourceApk = Join-Path $AndroidDir 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $SourceApk)) {
  throw "APK não encontrado em $SourceApk"
}

# 5. Copiar artefato final para dist-apk/ (e Google Drive se existir)
$DistApkDir = Join-Path $ProjectRoot 'dist-apk'
New-Item -ItemType Directory -Force -Path $DistApkDir | Out-Null
$TargetApkName = "MeuDia_v$Version.apk"
$TargetApk = Join-Path $DistApkDir $TargetApkName
Copy-Item -Force -Path $SourceApk -Destination $TargetApk
Write-Host "==> APK gerado com sucesso: $TargetApk" -ForegroundColor Green

$DriveCandidates = @(
  'G:\Meu Drive\Apps',
  (Join-Path $env:USERPROFILE 'Google Drive\Apps')
) | Where-Object { Test-Path $_ }

if ($DriveCandidates.Count -gt 0) {
  $DriveDest = Join-Path $DriveCandidates[0] $TargetApkName
  Copy-Item -Force -Path $TargetApk -Destination $DriveDest
  Write-Host "==> Cópia enviada para Google Drive: $DriveDest" -ForegroundColor Green
}

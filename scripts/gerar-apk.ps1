param(
  [string]$Version = '',
  [switch]$SkipWebBuild
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# 1. Resolução de versão + sincronização package.json e android/app/build.gradle (padrão Passatempos/Minhas Finanças/Things)
$pkgPath = Join-Path $ProjectRoot 'package.json'
$gradlePath = Join-Path $ProjectRoot 'android\app\build.gradle'

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if ($Version) {
  $pkgJson = Get-Content -Raw -Path $pkgPath | ConvertFrom-Json
  $pkgJson.version = $Version
  [System.IO.File]::WriteAllText($pkgPath, ($pkgJson | ConvertTo-Json -Depth 10), $Utf8NoBom)
} else {
  $pkg = Get-Content -Raw -Path $pkgPath | ConvertFrom-Json
  $Version = if ($pkg.version) { [string]$pkg.version } else { '0.1.0' }
}

if (Test-Path $gradlePath) {
  $gradleContent = Get-Content -Raw -Path $gradlePath
  if ($gradleContent -match 'versionName\s+"([^"]+)"') {
    $currentVersionName = $matches[1]
    if ($currentVersionName -ne $Version) {
      $gradleContent = $gradleContent -replace 'versionName\s+"[^"]+"', "versionName `"$Version`""
      if ($gradleContent -match 'versionCode\s+(\d+)') {
        $newCode = [int]$matches[1] + 1
        $gradleContent = $gradleContent -replace 'versionCode\s+\d+', "versionCode $newCode"
        Write-Host "Atualizado build.gradle: versionName '$Version', versionCode $newCode" -ForegroundColor Cyan
      }
      [System.IO.File]::WriteAllText($gradlePath, $gradleContent, $Utf8NoBom)
    }
  }
}

Write-Host '==================================================' -ForegroundColor Cyan
Write-Host "  Meu Dia - Gerador de APK (v$Version)" -ForegroundColor Cyan
Write-Host '==================================================' -ForegroundColor Cyan

# 2. Detectar JAVA_HOME compatível com Gradle (JDK 17..21; evita JDK 25+ de Android Studio recente)
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

# 3. Detectar ANDROID_HOME
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

# 4. Build Web + Sync Capacitor + Gradle APK
if (-not $SkipWebBuild) {
  Write-Host '[1/4] Compilando aplicação Web (npm run build)...' -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Falha em npm run build.' }
} else {
  Write-Host '[1/4] Pulando build Web (-SkipWebBuild)...' -ForegroundColor DarkYellow
}

Write-Host '[2/4] Sincronizando assets com Android (npx cap sync android)...' -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Falha em npx cap sync android.' }

$AndroidDir = Join-Path $ProjectRoot 'android'
Push-Location $AndroidDir
try {
  Write-Host '[3/4] Compilando APK Debug (gradlew.bat assembleDebug)...' -ForegroundColor Yellow
  .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) { throw 'Falha no build Gradle assembleDebug.' }
} finally {
  Pop-Location
}

$SourceApk = Join-Path $AndroidDir 'app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path $SourceApk)) {
  throw "APK não encontrado em $SourceApk"
}

# 5. Copiar para dist-apk/ e para o Google Drive (G:\Meu Drive\Programacão\Meu Dia\)
$TargetApkName = "MeuDia_v$Version.apk"

$DistApkDir = Join-Path $ProjectRoot 'dist-apk'
New-Item -ItemType Directory -Force -Path $DistApkDir | Out-Null
$LocalTargetApk = Join-Path $DistApkDir $TargetApkName
Copy-Item -Force -Path $SourceApk -Destination $LocalTargetApk

Write-Host '[4/4] Publicando APK e changelog no Google Drive...' -ForegroundColor Yellow
$progFolder = Get-ChildItem 'G:\Meu Drive' -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'Programac*' } |
  Select-Object -First 1

$DriveDir = if ($progFolder) {
  $existingAppDir = Get-ChildItem $progFolder.FullName -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '*Meu Dia*' } |
    Select-Object -First 1
  if ($existingAppDir) { $existingAppDir.FullName } else { Join-Path $progFolder.FullName 'Meu Dia' }
} elseif (Test-Path 'G:\Meu Drive') {
  'G:\Meu Drive\Programacão\Meu Dia'
} else {
  ''
}

$DriveDestApk = ''
if ($DriveDir) {
  New-Item -ItemType Directory -Force -Path $DriveDir | Out-Null
  $DriveDestApk = Join-Path $DriveDir $TargetApkName
  Copy-Item -Force -Path $SourceApk -Destination $DriveDestApk

  $LocalLog = Join-Path $ProjectRoot 'log_atualizacoes.txt'
  if (Test-Path $LocalLog) {
    Copy-Item -Force -Path $LocalLog -Destination (Join-Path $DriveDir 'log_atualizacoes.txt')
  }
}

Write-Host ''
Write-Host '==================================================' -ForegroundColor Green
Write-Host '  APK GERADO COM SUCESSO!' -ForegroundColor Green
Write-Host "  Local:   $LocalTargetApk" -ForegroundColor Green
if ($DriveDestApk) {
  Write-Host "  Drive:   $DriveDestApk" -ForegroundColor Green
} else {
  Write-Host '  Drive:   (G:\Meu Drive não montado nesta máquina)' -ForegroundColor Yellow
}
Write-Host '==================================================' -ForegroundColor Green

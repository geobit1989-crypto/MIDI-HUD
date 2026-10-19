# MIDI HUD - preparación de la versión iOS desde Windows
# Uso desde PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\windows\preparar-midi-hud.ps1
#
# Descarga la última compilación válida de GitHub Actions y valida el IPA.
# NO solicita credenciales de Apple, NO firma apps y NO instala en el iPhone.
# Sideloadly realiza la firma local y, tras su primer enrolamiento,
# la renovación automática en segundo plano.

param(
    [string]$Repository = "geobit1989-crypto/MIDI-HUD",
    [string]$Branch = "integration/ios-unified-191026-v6",
    [string]$OutputDirectory = (Join-Path ([Environment]::GetFolderPath("UserProfile")) "Downloads\MIDI-HUD")
)
$ErrorActionPreference = "Stop"

function Assert-GitHubCLI {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        throw "Falta GitHub CLI. Instálalo desde https://cli.github.com/ y ejecuta 'gh auth login'."
    }
    & gh auth status 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Inicia sesión en GitHub (NO Apple) con: gh auth login"
    }
}

try {
    Assert-GitHubCLI
    Write-Host "Buscando compilaciones terminadas de MIDI HUD ..." -ForegroundColor Cyan
    $raw = & gh run list --repo $Repository --workflow native-ios.yml --branch $Branch --limit 30 --json databaseId,status,conclusion,createdAt
    if ($LASTEXITCODE -ne 0) { throw "No se pudo consultar GitHub Actions." }
    $runs = @($raw | ConvertFrom-Json)
    $run = $runs | Where-Object { $_.status -eq 'completed' -and $_.conclusion -eq 'success' } |
        Sort-Object -Property createdAt -Descending | Select-Object -First 1
    if (-not $run) { throw "No hay compilaciones iOS válidas. Consulta GitHub Actions antes de instalar." }

    $runId = [string]$run.databaseId
    $staging = Join-Path $env:TEMP ("midi-hud-" + $runId)
    if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    New-Item -ItemType Directory -Path $staging -Force | Out-Null

    Write-Host "Descargando artefacto de la ejecución $runId ..."
    & gh run download $runId --repo $Repository --name midi-hud-ios-build-and-tests --dir $staging
    if ($LASTEXITCODE -ne 0) { throw "No se pudo descargar el artefacto iOS." }

    $ipa = Get-ChildItem -LiteralPath $staging -Filter 'MIDIHUD-iOS-unsigned.ipa' -File -Recurse |
        Select-Object -First 1
    if (-not $ipa) {
        throw "La compilación no contiene el archivo IPA. Revisa el trabajo de empaquetado en GitHub."
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ipa.FullName)
    try {
        $valid = @($archive.Entries | Where-Object { $_.FullName -eq 'Payload/MIDIHUD.app/Info.plist' }).Count -gt 0
    } finally {
        $archive.Dispose()
    }
    if (-not $valid) { throw "IPA inválido: no se encontró Payload/MIDIHUD.app/Info.plist." }

    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    $destination = Join-Path $OutputDirectory ("MIDIHUD-" + $runId + "-unsigned.ipa")
    Copy-Item -LiteralPath $ipa.FullName -Destination $destination -Force
    $sha = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
    Write-Host ""
    Write-Host "IPA preparado correctamente:" -ForegroundColor Green
    Write-Host $destination
    Write-Host "SHA-256: $sha"
    Write-Host ""
    Write-Host "En Sideloadly: selecciona este IPA, tu iPhone y el MISMO Apple ID y Bundle ID."
    Write-Host "Activa Automatic Refresh. La renovación posterior la gestiona su daemon."
    Write-Host "Nunca introduzcas tu contraseña de Apple en este script ni en GitHub."
    Start-Process explorer.exe -ArgumentList ('/select,"' + $destination + '"')
} catch {
    Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}

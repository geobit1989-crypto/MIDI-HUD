param([Parameter(Mandatory)][string]$Publish)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$sdk = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Directory |
    Where-Object { Test-Path "$($_.FullName)\x64\makeappx.exe" } |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$sdk) { throw 'Windows SDK tools unavailable' }
$makeappx = Join-Path $sdk.FullName 'x64/makeappx.exe'
$signtool = Join-Path $sdk.FullName 'x64/signtool.exe'
$root = Join-Path ([IO.Path]::GetTempPath()) ("midi-hud-msix-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $root | Out-Null
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=MIDI HUD CI' -CertStoreLocation Cert:\CurrentUser\My
$publisher = $cert.Subject
$cer = Join-Path $root 'test.cer'
Export-Certificate -Cert $cert -FilePath $cer | Out-Null
Import-Certificate -FilePath $cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople | Out-Null

function New-TestPackage([string]$Version) {
    $out = Join-Path $root $Version
    python (Join-Path $PSScriptRoot 'package_updates.py') $Publish $out $Version $publisher
    $package = Join-Path $out "midi-hud-windows-qa-x64-$Version.msix"
    & $makeappx pack /d (Join-Path $out 'layout') /p $package | Out-Host
    & $signtool sign /fd SHA256 /sha1 $cert.Thumbprint $package | Out-Host
    return $package
}

function Assert-Rejected([string]$Path) {
    try { Add-AppxPackage -Path $Path -ErrorAction Stop }
    catch { return }
    throw "Windows accepted an invalid package: $Path"
}

try {
    $first = New-TestPackage '1.0.0.0'
    $next = New-TestPackage '1.0.1.0'
    Add-AppxPackage -Path $first
    $installed = Get-AppxPackage -Name MidiHud.WindowsQA
    if ($installed.Version -ne '1.0.0.0') { throw 'Initial installation failed' }
    $state = Join-Path $env:LOCALAPPDATA 'MIDI HUD/WindowsQA/WebView'
    New-Item -ItemType Directory -Force -Path $state | Out-Null
    $data = Join-Path $state "qa-update-test-$([guid]::NewGuid()).json"
    $sample = '{"repertorio":["Ensayo"],"leadSheet":"Am F C G","canalMidi":3}'
    Set-Content -LiteralPath $data -Value $sample

    $unsigned = Join-Path $root 'unsigned.msix'
    & $makeappx pack /d (Join-Path $root '1.0.1.0/layout') /p $unsigned
    Assert-Rejected $unsigned
    $tampered = Join-Path $root 'tampered.msix'
    Copy-Item -LiteralPath $next -Destination $tampered
    $zip = [IO.Compression.ZipFile]::Open($tampered, 'Update')
    try {
        $zip.GetEntry('MIDI HUD.exe').Delete()
        $entry = $zip.CreateEntry('MIDI HUD.exe').Open()
        try { $entry.WriteByte(42) } finally { $entry.Dispose() }
    } finally { $zip.Dispose() }
    Assert-Rejected $tampered
    if ((Get-AppxPackage -Name MidiHud.WindowsQA).Version -ne '1.0.0.0') { throw 'Failed update replaced the installed version' }
    Add-AppxPackage -Path $next -DeferRegistrationWhenPackagesAreInUse
    if ((Get-AppxPackage -Name MidiHud.WindowsQA).Version -ne '1.0.1.0') { throw 'Upgrade failed' }
    Assert-Rejected $first
    if ((Get-Content -LiteralPath $data -Raw).Trim() -ne $sample) { throw 'Package state changed during upgrade' }
} finally {
    if ($data -and (Test-Path -LiteralPath $data)) { Remove-Item -LiteralPath $data }
    Get-AppxPackage -Name MidiHud.WindowsQA | Remove-AppxPackage
    Remove-Item -LiteralPath "Cert:\LocalMachine\TrustedPeople\$($cert.Thumbprint)"
    Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($cert.Thumbprint)"
}

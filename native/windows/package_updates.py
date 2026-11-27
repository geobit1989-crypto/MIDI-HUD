"""Build the QA MSIX layout and App Installer feed from an existing WPF publish."""
import argparse
from pathlib import Path
import json
import shutil
from xml.sax.saxutils import quoteattr
from prepare_icon import png

HERE = Path(__file__).resolve().parent
RELEASES = "https://github.com/geobit1989-crypto/MIDI-HUD/releases/download"
CHANNELS = json.loads((HERE.parents[1] / "config/native-updates.json").read_text())["windows"]["channels"]


def package_metadata(version, publisher):
    fields = version.split(".")
    if (len(fields) != 4 or any(not field.isascii() or not field.isdecimal()
                                or len(field) > 5 or str(int(field)) != field
                                or int(field) > 65535 for field in fields)
            or int(fields[0]) == 0):
        raise ValueError("MSIX requires four canonical 16-bit version components and a nonzero major")
    if not publisher.strip():
        raise ValueError("A signing publisher is required")
    channel = CHANNELS["qa"]
    name, tag = channel["identity"], channel["tag"]
    stem = f"midi-hud-{tag}-x64"
    feed = f"{stem}.appinstaller"
    package = f"{stem}-{version}.msix"
    base = f"{RELEASES}/{tag}"
    identity = f'Name="{name}" Publisher={quoteattr(publisher)} Version="{version}" ProcessorArchitecture="x64"'
    manifest = f"""<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:uap10="http://schemas.microsoft.com/appx/manifest/uap/windows10/10"
  xmlns:desktop6="http://schemas.microsoft.com/appx/manifest/desktop/windows10/6"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap uap10 desktop6 rescap">
  <Identity {identity} />
  <Properties>
    <DisplayName>MIDI HUD Pruebas</DisplayName>
    <PublisherDisplayName>MIDI HUD</PublisherDisplayName>
    <Logo>StoreLogo.png</Logo>
    <desktop6:FileSystemWriteVirtualization>disabled</desktop6:FileSystemWriteVirtualization>
  </Properties>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.19041.0" MaxVersionTested="10.0.26100.0" /></Dependencies>
  <Resources><Resource Language="es" /></Resources>
  <Applications>
    <Application Id="MidiHud" Executable="MIDI HUD.exe"
                 uap10:RuntimeBehavior="packagedClassicApp" uap10:TrustLevel="mediumIL">
      <uap:VisualElements DisplayName="MIDI HUD Pruebas" Description="MIDI HUD Pruebas"
        Square150x150Logo="Square150x150Logo.png" Square44x44Logo="Square44x44Logo.png" BackgroundColor="transparent" />
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
    <rescap:Capability Name="unvirtualizedResources" />
  </Capabilities>
</Package>
"""
    descriptor = f"""<?xml version="1.0" encoding="utf-8"?>
<AppInstaller xmlns="http://schemas.microsoft.com/appx/appinstaller/2018" Version="{version}" Uri="{base}/{feed}">
  <MainPackage {identity} Uri="{base}/{package}" />
  <UpdateSettings>
    <OnLaunch HoursBetweenUpdateChecks="8" />
  </UpdateSettings>
</AppInstaller>
"""
    return package, feed, manifest, descriptor


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("publish", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("version")
    parser.add_argument("publisher")
    args = parser.parse_args()
    _, feed, manifest, descriptor = package_metadata(args.version, args.publisher)
    if not all((args.publish / path).is_file() for path in
               ("MIDI HUD.exe", "hud.ico", "Web/windows-qa/bundle-manifest.json")):
        raise ValueError("The complete Windows QA publish is required")
    layout = args.output / "layout"
    shutil.copytree(args.publish, layout)
    (layout / "AppxManifest.xml").write_text(manifest, encoding="utf-8")
    for name, size in (("StoreLogo", 50), ("Square150x150Logo", 150), ("Square44x44Logo", 44)):
        (layout / f"{name}.png").write_bytes(png(size))
    (args.output / feed).write_text(descriptor, encoding="utf-8")


if __name__ == "__main__":
    main()

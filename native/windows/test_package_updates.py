import unittest
import xml.etree.ElementTree as ET

from package_updates import CHANNELS, package_metadata


class UpdateMetadataTests(unittest.TestCase):
    def test_feed_identity_and_non_disruptive_policy(self):
        publisher = "CN=MIDI HUD & QA"
        package, feed, manifest, descriptor = package_metadata("1.2.3.0", publisher)
        identity = ET.fromstring(manifest).find("{*}Identity")
        installer = ET.fromstring(descriptor)
        target = installer.find("{*}MainPackage")
        self.assertEqual(ET.fromstring(manifest).find(".//{*}Application").attrib["Executable"],
                         "MIDI HUD.exe")
        self.assertEqual({key: target.attrib[key] for key in identity.attrib}, identity.attrib)
        self.assertEqual(target.attrib["Publisher"], publisher)
        self.assertEqual(target.attrib["Name"], CHANNELS["qa"]["identity"])
        self.assertTrue(target.attrib["Uri"].endswith(f"/{CHANNELS['qa']['tag']}/{package}"))
        self.assertTrue(installer.attrib["Uri"].endswith(f"/{CHANNELS['qa']['tag']}/{feed}"))
        self.assertNotIn(CHANNELS["stable"]["tag"], descriptor)
        self.assertNotEqual(CHANNELS["stable"]["profile"], CHANNELS["qa"]["profile"])
        self.assertEqual(ET.fromstring(manifest).find(".//{*}FileSystemWriteVirtualization").text,
                         "disabled")
        settings = installer.find("{*}UpdateSettings")
        self.assertEqual(len(settings), 1)
        self.assertEqual(settings[0].tag.rsplit("}", 1)[1], "OnLaunch")
        self.assertEqual(settings[0].attrib, {"HoursBetweenUpdateChecks": "8"})

    def test_rejects_invalid_versions(self):
        for version in ("", "1.0.0", "1.0.0.01", "1.0.0.65536", "0.1.0.0", "1.0.0.-1"):
            with self.subTest(version=version), self.assertRaises(ValueError):
                package_metadata(version, "CN=QA")

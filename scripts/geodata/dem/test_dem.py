"""Small offline checks. No country raster is built and no network is used."""
from pathlib import Path
import hashlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import pipeline as dem


class DemChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.np = dem.dependencies(dem.data_directory(None))[0]

    def test_country_tile_coverage_and_xyz_geometry(self):
        total = sum(sum(1 for _ in dem.tile_range(z)) for z in range(5, 12))
        self.assertEqual(total, 5922)
        for z in range(5, 12):
            tiles = set(dem.tile_range(z))
            for lon, lat in [(13.405, 52.52), (11.58, 48.137), (6.084, 50.775), (8.445, 55.05)]:
                x, y = dem.tile_xy(lon, lat, z)
                self.assertIn((z, x, y), tiles)
                west, south, east, north = dem.tile_bounds(z, x, y)
                self.assertLess(west, east)
                self.assertLess(south, north)
                self.assertLess(abs(east - west - (north - south)), 1e-7)

    def test_terrarium_retains_negative_and_fractional_elevations(self):
        np = self.np
        elevations = np.array([[-430.13, -3.51, 0], [1.25, 1138.2963, 2962.125]], dtype="float32")
        rgb = dem.terrarium(elevations, np)
        self.assertEqual(rgb.dtype, np.uint8)
        self.assertTrue(np.all(np.abs(dem.decoded(rgb, np) - elevations) <= 1 / 512))
        self.assertEqual(rgb[0, 2].tolist(), [128, 0, 0])

    def test_invalid_height_does_not_become_fake_terrain(self):
        for value in [float("nan"), float("inf"), -32769, 32768]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                dem.terrarium(self.np.array([[value]]), self.np)

    def test_source_lock_has_complete_pinned_geographic_coverage(self):
        lock = dem.load_lock()
        self.assertEqual(len(lock["files"]), 94)
        self.assertEqual(len(lock["oceanCellsWithoutSource"]), 5)
        self.assertEqual(sum(item["bytes"] for item in lock["files"]), 357915645)
        self.assertTrue(all(len(item["sha256"]) == 64 for item in lock["files"]))
        self.assertIn("cop_dem_licenses.pdf", lock["license"])

    def test_source_lock_matches_completed_dem_and_survives_fresh_git_checkouts(self):
        # This snapshot's completed, transferable DEM binds the original lock bytes.
        expected = "06dbe4655c0cd481faec6bb7fa0a61d8149bb044ed9f195b8370005afba722e2"
        relative = "scripts/geodata/dem/source-lock.json"
        source = (dem.REPO / relative).read_bytes()
        self.assertEqual(hashlib.sha256(source).hexdigest(), expected)
        for autocrlf in ("false", "true", "input"):
            with self.subTest(autocrlf=autocrlf), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                repository = root / "repo"
                repository.mkdir()
                lock = repository / relative
                lock.parent.mkdir(parents=True)
                lock.write_bytes(source)
                (repository / ".gitattributes").write_bytes((dem.REPO / ".gitattributes").read_bytes())

                def git(*args):
                    return subprocess.run(
                        ["git", "-c", f"core.autocrlf={autocrlf}", "-c", "core.safecrlf=false", *args],
                        cwd=repository, check=True, capture_output=True,
                    ).stdout

                git("init", "--quiet")
                git("add", ".gitattributes", relative)
                # The stored Git blob and a freshly materialized checkout must both
                # match the ready artifact, regardless of the checkout platform.
                self.assertEqual(hashlib.sha256(git("show", f":{relative}")).hexdigest(), expected)
                checkout = root / "checkout"
                checkout.mkdir()
                git("checkout-index", "--all", f"--prefix={checkout.as_posix()}/")
                self.assertEqual(dem.digest(checkout / relative), expected)

    def test_no_geodata_is_written_into_program_or_outside_selected_directory(self):
        with self.assertRaises(ValueError):
            dem.data_directory(str(dem.REPO / "data"))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            self.assertEqual(dem.safe_child(root, "sources/example.tif"), root / "sources/example.tif")
            for name in ["..", "../escape.tif", str(root.parent / "escape.tif")]:
                with self.subTest(name=name), self.assertRaises(ValueError):
                    dem.safe_child(root, name)

    def test_corrupt_source_never_creates_ready_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / "altered.tif").write_bytes(b"altered")
            lock = {"files": [{"file": "altered.tif", "bytes": 7, "sha256": "0" * 64}]}
            with patch.object(dem, "load_lock", return_value=lock), self.assertRaisesRegex(ValueError, "verändert"):
                dem.build(root)
            self.assertFalse((root / "dem-manifest.json").exists())
            self.assertFalse((root / "dem.mbtiles").exists())

    def test_wrong_output_fingerprint_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            data = root / "dem.mbtiles"
            data.write_bytes(b"different data")
            with self.assertRaisesRegex(ValueError, "stimmen nicht"):
                dem.verify_artifact(root, data, {"status": "ready", "sha256": "0" * 64, "bytes": data.stat().st_size})


if __name__ == "__main__":
    unittest.main(verbosity=2)

#!/usr/bin/env python3
"""Pinned Copernicus GLO-90 -> local Terrarium Raster-DEM MBTiles.

Download stages use only Python's standard library. The explicit build stage
uses one worker, one 256x256 destination array, a 64 MiB GDAL cache and a small
dataset-handle LRU; it never constructs a full-country raster in memory.
"""
from __future__ import annotations

import argparse
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
BASE = "https://copernicus-dem-90m.s3.amazonaws.com"
LICENSE = "https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf"
SOURCE_PAGE = "https://registry.opendata.aws/copernicus-dem/"
BOUNDS = (5.5, 47.1, 15.6, 55.2)
SIZE = 256
MINZOOM, MAXZOOM = 5, 11
SOURCE_ID = "copernicus-glo90-de-20260909"
ORIGIN = math.pi * 6378137
NOTICE = ("produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH "
          "2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved")
LIABILITY = ("Die gesetzlich oder durch Delegation mit dem Copernicus-Programm beauftragten Organisationen "
             "übernehmen keine Haftung für eine Verwendung von Copernicus WorldDEM-90.")


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def safe_child(root: Path, name: str) -> Path:
    target = (root / name).resolve()
    if target == root or root not in target.parents:
        raise ValueError("Dateipfad liegt außerhalb des Geodatenordners")
    return target


def data_directory(value: str | None) -> Path:
    root = Path(value or os.environ.get("GEODATA_DIR", REPO.parent / "leitstellen-deutschland-geodata")).resolve()
    if root == REPO or REPO in root.parents:
        raise ValueError("DEM-Daten müssen außerhalb des Programmverzeichnisses liegen")
    root.mkdir(parents=True, exist_ok=True)
    return root


def write_json(path: Path, value: object):
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def request_bytes(url: str, limit: int = 8 * 1024 * 1024) -> tuple[bytes, dict]:
    with urlopen(Request(url, headers={"User-Agent": "Leitstellen-Verbund-Geodata/1.0"}), timeout=45) as response:
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("Metadaten überschreiten das Größenlimit")
        return data, dict(response.headers)


def fetch_file(root: Path, item: dict) -> dict:
    filename = item["file"]
    target = safe_child(root, filename)
    target.parent.mkdir(parents=True, exist_ok=True)
    expected = item.get("sha256")
    if target.exists():
        sha = digest(target)
        if (expected and sha != expected) or target.stat().st_size != item["bytes"]:
            raise ValueError(f"Vorhandene Quelldatei weicht vom Quellen-Lock ab: {filename}")
        return {**item, "sha256": sha}
    partial = safe_child(root, filename + ".partial")
    for attempt in range(4):
        offset = partial.stat().st_size if partial.exists() else 0
        if offset > item["bytes"]:
            raise ValueError(f"Teil-Download ist zu groß: {filename}")
        headers = {"User-Agent": "Leitstellen-Verbund-Geodata/1.0", "If-Match": item["etag"]}
        if offset:
            headers["Range"] = f"bytes={offset}-"
        try:
            if offset < item["bytes"]:
                with urlopen(Request(item["url"], headers=headers), timeout=60) as response:
                    append = offset > 0 and response.status == 206
                    with partial.open("ab" if append else "wb") as stream:
                        while chunk := response.read(1024 * 1024):
                            stream.write(chunk)
                            if stream.tell() > item["bytes"]:
                                raise ValueError(f"Quelldatei überschreitet die deklarierte Größe: {filename}")
            if partial.stat().st_size != item["bytes"]:
                raise OSError(f"Unvollständiger Download: {filename}")
            sha = digest(partial)
            if expected and sha != expected:
                raise ValueError(f"SHA-256-Prüfung fehlgeschlagen: {filename}")
            partial.replace(target)
            return {**item, "sha256": sha}
        except (OSError, TimeoutError):
            if attempt == 3:
                raise
            time.sleep(1 + attempt)
    raise AssertionError("unreachable")


def selected_cells() -> list[tuple[int, int]]:
    return [(lat, lon) for lat in range(math.floor(BOUNDS[1]), math.ceil(BOUNDS[3]))
            for lon in range(math.floor(BOUNDS[0]), math.ceil(BOUNDS[2]))]


def pin(root: Path):
    """One-time reviewed acquisition. Subsequent preparation uses source-lock.json."""
    lock_path = HERE / "source-lock.json"
    if lock_path.exists():
        raise ValueError("Quellen-Lock existiert bereits; prepare verwenden. Kein stilles Umpinnen.")
    plan_path = safe_child(root, "dem-source-plan.json")
    if plan_path.exists():
        plan = json.loads(plan_path.read_text(encoding="utf-8"))
    else:
        listing, _ = request_bytes(f"{BASE}/tileList.txt")
        available = set(listing.decode("utf-8").splitlines())
        entries, sea = [], []
        for lat, lon in selected_cells():
            key = f"Copernicus_DSM_COG_30_N{lat:02}_00_E{lon:03}_00_DEM"
            if key not in available:
                sea.append([lat, lon])
                continue
            url = f"{BASE}/{key}/{key}.tif"
            entries.append({"id": key, "lat": lat, "lon": lon, "url": url, "file": f"dem-sources/{key}.tif"})
        def metadata(item):
            with urlopen(Request(item["url"], method="HEAD"), timeout=45) as response:
                return {**item, "bytes": int(response.headers["Content-Length"]), "etag": response.headers["ETag"],
                        "lastModified": response.headers.get("Last-Modified", "")}
        with ThreadPoolExecutor(max_workers=2) as pool:
            files = list(pool.map(metadata, entries))
        plan = {"schema": 1, "source": "Copernicus GLO-90", "snapshot": "2026-09-09", "sourcePage": SOURCE_PAGE,
                "bucket": BASE, "tileIndexSha256": hashlib.sha256(listing).hexdigest(), "bounds": BOUNDS,
                "oceanCellsWithoutSource": sea, "files": files}
        write_json(plan_path, plan)
    result = acquire(root, plan)
    write_json(lock_path, result)
    write_json(safe_child(root, "dem-source-manifest.json"), result)
    print(f"Pinned {len(result['files'])} COGs, {sum(item['bytes'] for item in result['files']):,} bytes", flush=True)


def acquire(root: Path, lock: dict) -> dict:
    files = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(fetch_file, root, item): item for item in lock["files"]}
        for future in as_completed(futures):
            files.append(future.result())
            print(f"DEM sources {len(files)}/{len(futures)}", flush=True)
    files.sort(key=lambda item: item["id"])
    license_path = safe_child(root, "dem-license.pdf")
    if not license_path.exists():
        data, _ = request_bytes(LICENSE)
        license_path.write_bytes(data)
    license_sha = digest(license_path)
    if lock.get("licenseSha256") and lock["licenseSha256"] != license_sha:
        raise ValueError("Lizenzdatei stimmt nicht mit dem Quellen-Lock überein")
    safe_child(root, "dem-NOTICE.txt").write_text(f"{NOTICE}\n\n{LIABILITY}\n\nLizenz: {LICENSE}\nQuelle: {SOURCE_PAGE}\n"
        "Die Spielanwendung wird nicht von Copernicus, DLR, Airbus, EU oder ESA offiziell unterstützt.\n"
        "Bei Weitergabe dieses DEM gelten die Quellen-, Haftungs- und Weitergabehinweise der GLO-90-Lizenz auch für nachfolgende Nutzer.\n", encoding="utf-8")
    return {**lock, "files": files, "license": LICENSE, "licenseSha256": license_sha, "attribution": NOTICE, "liabilityNotice": LIABILITY}


def load_lock() -> dict:
    lock = json.loads((HERE / "source-lock.json").read_text(encoding="utf-8"))
    if lock.get("schema") != 1 or lock.get("source") != "Copernicus GLO-90" or tuple(lock.get("bounds", [])) != BOUNDS:
        raise ValueError("Ungültiger DEM-Quellen-Lock")
    cells = set()
    for item in lock["files"]:
        if not re.fullmatch(r"Copernicus_DSM_COG_30_N\d{2}_00_E\d{3}_00_DEM", item["id"]):
            raise ValueError("Ungültige COG-Kennung")
        if item["url"] != f"{BASE}/{item['id']}/{item['id']}.tif" or item["file"] != f"dem-sources/{item['id']}.tif":
            raise ValueError("Quellenpfad nicht freigegeben")
        if not re.fullmatch(r"[a-f0-9]{64}", item["sha256"]):
            raise ValueError("Fehlende SHA-256-Pinnung")
        cells.add((item["lat"], item["lon"]))
    if cells | {tuple(item) for item in lock["oceanCellsWithoutSource"]} != set(selected_cells()):
        raise ValueError("Unvollständige Deutschlandabdeckung im Quellen-Lock")
    return lock


def dependencies(root: Path):
    # NumPy wheels may otherwise reserve stacks for many idle BLAS threads.
    for name in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
        os.environ[name] = "1"
    sys.path.insert(0, str(safe_child(root, "tools/dem-python")))
    import numpy as np
    import rasterio
    from rasterio.warp import reproject, Resampling
    from rasterio.transform import from_bounds
    from PIL import Image
    if rasterio.__version__ != "1.5.1":
        raise ValueError("Der DEM-Build benötigt die gepinnte Rasterio-Version 1.5.1")
    return np, rasterio, reproject, Resampling, from_bounds, Image


def tile_xy(lon: float, lat: float, z: int) -> tuple[int, int]:
    count = 2 ** z
    return (math.floor((lon + 180) / 360 * count),
            math.floor((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * count))


def tile_range(z: int):
    west, north = tile_xy(BOUNDS[0], BOUNDS[3], z)
    east, south = tile_xy(BOUNDS[2], BOUNDS[1], z)
    for x in range(west, east + 1):
        for y in range(north, south + 1):
            yield z, x, y


def tile_bounds(z: int, x: int, y: int):
    side = 2 * ORIGIN / 2 ** z
    return (-ORIGIN + x * side, ORIGIN - (y + 1) * side, -ORIGIN + (x + 1) * side, ORIGIN - y * side)


def terrarium(array, np):
    if not np.isfinite(array).all() or array.min() < -32768 or array.max() >= 32768:
        raise ValueError("Höhendaten können nicht verlustarm als Terrarium gespeichert werden")
    value = np.rint((array.astype("float64") + 32768) * 256).astype("uint32")
    return np.stack(((value >> 16) & 255, (value >> 8) & 255, value & 255), axis=2).astype("uint8")


def decoded(rgb, np):
    a = rgb.astype("float64")
    return a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256 - 32768


def build(root: Path):
    lock = load_lock()
    for item in lock["files"]:
        path = safe_child(root, item["file"])
        if not path.exists() or path.stat().st_size != item["bytes"] or digest(path) != item["sha256"]:
            raise ValueError(f"Quelle fehlt oder wurde verändert: {item['file']}. prepare ausführen.")
    source_sha = digest(HERE / "source-lock.json")
    destination = safe_child(root, "dem.mbtiles")
    if destination.exists():
        verify(root)
        return
    np, rio, reproject, Resampling, from_bounds, Image = dependencies(root)
    partial = safe_child(root, "dem.mbtiles.partial")
    db = sqlite3.connect(partial)
    db.executescript("PRAGMA journal_mode=DELETE; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS metadata(name TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB,PRIMARY KEY(zoom_level,tile_column,tile_row)) WITHOUT ROWID;")
    metadata = dict(db.execute("SELECT name,value FROM metadata"))
    if metadata and metadata.get("source_lock_sha256") != source_sha:
        db.close(); raise ValueError("Vorhandener DEM-Teilbuild gehört zu anderen Quellen")
    metadata.update({"name": "Deutschland Copernicus GLO-90", "type": "overlay", "version": "1.3", "format": "png", "encoding": "terrarium",
                     "bounds": ",".join(map(str, BOUNDS)), "minzoom": str(MINZOOM), "maxzoom": str(MAXZOOM), "attribution": NOTICE,
                     "source_id": SOURCE_ID, "source_lock_sha256": source_sha,
                     "vertical_datum": "EGM2008 EPSG:3855", "source_resolution": "GLO-90 nominal 90 m DSM"})
    db.executemany("INSERT OR REPLACE INTO metadata VALUES(?,?)", metadata.items()); db.commit()
    sources = {(item["lat"], item["lon"]): item for item in lock["files"]}
    handles = OrderedDict()
    total = sum(sum(1 for _ in tile_range(z)) for z in range(MINZOOM, MAXZOOM + 1))
    finished = 0
    try:
        with rio.Env(GDAL_CACHEMAX=64 * 1024 * 1024, GDAL_NUM_THREADS="1"):
            source_bounds = {}
            for key, item in sources.items():
                with rio.open(safe_child(root, item["file"])) as source:
                    if source.crs.to_epsg() != 4326 or source.count != 1:
                        raise ValueError(f"Unerwartetes GeoTIFF-Format: {item['id']}")
                    source_bounds[key] = source.bounds
            for z in range(MINZOOM, MAXZOOM + 1):
                for _, x, y in tile_range(z):
                    row = 2 ** z - 1 - y
                    if db.execute("SELECT 1 FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?", (z, x, row)).fetchone():
                        finished += 1; continue
                    bounds = tile_bounds(z, x, y)
                    lon = np.linspace(bounds[0], bounds[2], SIZE, endpoint=False) + (bounds[2] - bounds[0]) / SIZE / 2
                    lat = np.linspace(bounds[3], bounds[1], SIZE, endpoint=False) - (bounds[3] - bounds[1]) / SIZE / 2
                    lon = lon / ORIGIN * 180
                    lat = np.degrees(2 * np.arctan(np.exp(lat / 6378137)) - math.pi / 2)
                    array = np.full((SIZE, SIZE), np.nan, dtype="float32")
                    expected = np.zeros((SIZE, SIZE), dtype=bool)
                    # COG pixel centers follow the source's actual transform:
                    # the east/south overlap row is removed and cells are shifted
                    # half a pixel. Include adjacent source cells at those seams.
                    for latitude in range(math.floor(float(lat.min())) - 1, math.floor(float(lat.max())) + 2):
                        for longitude in range(math.floor(float(lon.min())) - 1, math.floor(float(lon.max())) + 2):
                            key = (latitude, longitude)
                            item = sources.get(key)
                            if not item:
                                continue
                            expected |= (np.floor(lat)[:, None] == latitude) & (np.floor(lon)[None, :] == longitude)
                            extent = source_bounds[key]
                            if (extent.right < float(lon.min()) or extent.left > float(lon.max())
                                    or extent.top < float(lat.min()) or extent.bottom > float(lat.max())):
                                continue
                            source = handles.pop(key, None)
                            if source is None:
                                source = rio.open(safe_child(root, item["file"]))
                                if source.crs.to_epsg() != 4326 or source.count != 1:
                                    raise ValueError(f"Unerwartetes GeoTIFF-Format: {item['id']}")
                            handles[key] = source
                            while len(handles) > 6:
                                handles.popitem(last=False)[1].close()
                            reproject(source=rio.band(source, 1), destination=array, src_transform=source.transform,
                                      src_crs=source.crs, src_nodata=source.nodata, dst_transform=from_bounds(*bounds, SIZE, SIZE),
                                      dst_crs="EPSG:3857", dst_nodata=np.nan, resampling=Resampling.bilinear,
                                      init_dest_nodata=False, num_threads=1, warp_mem_limit=32)
                    # The source provider explicitly defines missing ocean COGs as
                    # zero elevation. Missing values INSIDE available land COGs fail.
                    missing = np.isnan(array)
                    expected &= ((lat >= BOUNDS[1]) & (lat <= BOUNDS[3]))[:, None] & ((lon >= BOUNDS[0]) & (lon <= BOUNDS[2]))[None, :]
                    if np.any(missing & expected):
                        raise ValueError(f"Ungefüllte Land-Höhenpixel in {z}/{x}/{y}: {int(np.sum(missing & expected))}")
                    array[missing] = 0
                    rgb = terrarium(array, np)
                    if float(np.max(np.abs(decoded(rgb, np) - array))) > 1 / 256:
                        raise ValueError("Terrarium-Rundlaufprüfung fehlgeschlagen")
                    output = io.BytesIO(); Image.fromarray(rgb).save(output, format="PNG", compress_level=6)
                    db.execute("INSERT INTO tiles VALUES(?,?,?,?)", (z, x, row, output.getvalue()))
                    finished += 1
                    if finished % 64 == 0:
                        db.commit(); print(f"DEM tiles {finished}/{total}, z={z}", flush=True)
            db.commit()
            actual = db.execute("SELECT COUNT(*) FROM tiles").fetchone()[0]
            if actual != total or db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise ValueError("Unvollständige oder beschädigte DEM-MBTiles")
    finally:
        for source in handles.values():
            source.close()
        db.close()
    manifest = {"schema": 1, "status": "ready", "source": "Copernicus GLO-90", "attribution": NOTICE, "license": LICENSE,
                "snapshot": lock["snapshot"], "sha256": digest(partial), "bytes": partial.stat().st_size,
                "minzoom": MINZOOM, "maxzoom": MAXZOOM, "encoding": "terrarium", "tileSize": SIZE, "bounds": BOUNDS,
                "sourceId": SOURCE_ID, "sourceLockSha256": source_sha, "tiles": total,
                "sourceResolutionMeters": 90, "verticalDatum": "EGM2008 (EPSG:3855)",
                "rasterio": rio.__version__, "gdal": rio.__gdal_version__, "createdAt": datetime.now(timezone.utc).isoformat(),
                "liabilityNotice": LIABILITY}
    # Nothing is advertised as ready until integrity, coverage, PNG encoding and
    # real geographic height samples have passed against the completed candidate.
    manifest["validation"] = verify_artifact(root, partial, manifest)
    partial.replace(destination)
    write_json(safe_child(root, "dem-manifest.json"), manifest)
    print(json.dumps(manifest, ensure_ascii=False), flush=True)


def verify(root: Path):
    manifest_path, data = safe_child(root, "dem-manifest.json"), safe_child(root, "dem.mbtiles")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    verify_artifact(root, data, manifest)
    return manifest


def verify_artifact(root: Path, data: Path, manifest: dict):
    if manifest.get("status") != "ready" or manifest.get("sha256") != digest(data) or manifest.get("bytes") != data.stat().st_size:
        raise ValueError("DEM-Manifest/Artefakt stimmen nicht überein")
    if manifest.get("sourceLockSha256") != digest(HERE / "source-lock.json"):
        raise ValueError("DEM stammt aus einem anderen Quellen-Lock")
    np, _, _, _, _, Image = dependencies(root)
    samples = []
    with closing(sqlite3.connect(f"file:{data.as_posix()}?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise ValueError("DEM-Datenbankprüfung fehlgeschlagen")
        if db.execute("SELECT COUNT(*) FROM tiles").fetchone()[0] != manifest["tiles"]:
            raise ValueError("Falsche DEM-Kachelzahl")
        if manifest["tiles"] != sum(sum(1 for _ in tile_range(z)) for z in range(MINZOOM, MAXZOOM + 1)):
            raise ValueError("Unvollständige Deutschlandabdeckung")
        for z in range(MINZOOM, MAXZOOM + 1):
            for _, x, y in tile_range(z):
                row = db.execute("SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?",
                                 (z, x, 2 ** z - 1 - y)).fetchone()
                if not row:
                    raise ValueError(f"DEM-Kachel fehlt: {z}/{x}/{y}")
                with Image.open(io.BytesIO(row[0])) as image:
                    if image.format != "PNG" or image.mode != "RGB" or image.size != (SIZE, SIZE):
                        raise ValueError(f"Ungültige Terrarium-Kachel: {z}/{x}/{y}")
                    image.verify()
        for name, lon, lat, minimum, maximum in [
            ("Harz/Brocken", 10.615, 51.799, 900, 1200),
            ("Bayerische Alpen/Zugspitze", 10.985, 47.421, 2500, 3100),
            ("Schwarzwald/Feldberg", 8.005, 47.874, 1200, 1600),
            ("Nordsee", 7.4, 54.5, -1, 1),
        ]:
            z = MAXZOOM; x, y = tile_xy(lon, lat, z)
            row = db.execute("SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?", (z, x, 2 ** z - 1 - y)).fetchone()
            if not row:
                raise ValueError(f"DEM-Abdeckung fehlt: {name}")
            with Image.open(io.BytesIO(row[0])) as image:
                if image.mode != "RGB" or image.size != (SIZE, SIZE):
                    raise ValueError("DEM-PNG ist kein verlustloses Terrarium-RGB")
                height = decoded(np.asarray(image), np)
            west, south, east, north = tile_bounds(z, x, y)
            mx = lon / 180 * ORIGIN; my = math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * 6378137
            px = min(SIZE - 1, max(0, int((mx - west) / (east - west) * SIZE)))
            py = min(SIZE - 1, max(0, int((north - my) / (north - south) * SIZE)))
            value = float(height[py, px])
            if not minimum <= value <= maximum:
                raise ValueError(f"Unplausibler realer DEM-Wert für {name}: {value:.1f} m")
            samples.append({"name": name, "lon": lon, "lat": lat, "heightMeters": value})
            print(f"DEM check {name}: {value:.1f} m", flush=True)
    return {"integrity": "ok", "allTiles": "PNG RGB 256x256", "heightSamples": samples}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=["pin", "prepare", "build", "verify"])
    parser.add_argument("--directory")
    args = parser.parse_args(); root = data_directory(args.directory)
    if args.stage == "pin":
        pin(root)
    elif args.stage == "prepare":
        lock = acquire(root, load_lock()); write_json(safe_child(root, "dem-source-manifest.json"), lock)
    elif args.stage == "build":
        build(root)
    else:
        verify(root)


if __name__ == "__main__":
    main()

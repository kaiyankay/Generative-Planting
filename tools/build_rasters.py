"""Resample the public rasters into the local model frame.

Inputs : sources/raw/naip_3857.png, sources/raw/dem_3857.tif, fetch_log.json
Outputs: data/detroit/ortho.jpg       NAIP, local frame, 0.5 m/px, north-up
         data/detroit/terrain.bin     Int16 centimetres above DATUM_Z, 1 m grid, row-major,
                                      row 0 = ymin (south), col 0 = xmin (west)
         data/detroit/terrain.json    grid metadata (written into the model by build_model)
"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from geo import EXTENT, to_latlon, merc

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "sources", "raw")
OUT = os.path.join(ROOT, "data", "detroit")


def bilinear(arr, px, py):
    h, w = arr.shape[:2]
    px = np.clip(px, 0, w - 1.001)
    py = np.clip(py, 0, h - 1.001)
    x0 = np.floor(px).astype(int); y0 = np.floor(py).astype(int)
    fx = px - x0; fy = py - y0
    if arr.ndim == 3:
        fx = fx[..., None]; fy = fy[..., None]
    a = arr[y0, x0] * (1 - fx) + arr[y0, x0 + 1] * fx
    b = arr[y0 + 1, x0] * (1 - fx) + arr[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def local_grid_to_pixels(xs, ys, bbox, w, h):
    X, Y = np.meshgrid(xs, ys)
    lat, lon = np.vectorize(to_latlon)(X, Y)
    mx = 6378137.0 * np.radians(lon)
    my = 6378137.0 * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
    x0, y0, x1, y1 = bbox
    px = (mx - x0) / (x1 - x0) * w - 0.5
    py = (y1 - my) / (y1 - y0) * h - 0.5
    return px, py


def main():
    os.makedirs(OUT, exist_ok=True)
    log = json.load(open(os.path.join(RAW, "fetch_log.json")))
    items = {i["file"]: i for i in log["items"]}

    # ---- ortho
    it = items["naip_3857.png"]
    naip = np.asarray(Image.open(os.path.join(RAW, "naip_3857.png")).convert("RGB"), dtype=float)
    res = 0.5
    xs = np.arange(EXTENT["xmin"] + res / 2, EXTENT["xmax"], res)
    ys = np.arange(EXTENT["ymax"] - res / 2, EXTENT["ymin"], -res)  # north-up image rows
    px, py = local_grid_to_pixels(xs, ys, it["bbox3857"], naip.shape[1], naip.shape[0])
    img = bilinear(naip, px, py).clip(0, 255).astype(np.uint8)
    Image.fromarray(img).save(os.path.join(OUT, "ortho.jpg"), quality=84)

    # ---- terrain
    it = items["dem_3857.tif"]
    dem = np.asarray(Image.open(os.path.join(RAW, "dem_3857.tif")), dtype=float)
    valid = np.isfinite(dem) & (dem > -1000)
    tres = 1.0
    gx = np.arange(EXTENT["xmin"], EXTENT["xmax"] + 0.001, tres)
    gy = np.arange(EXTENT["ymin"], EXTENT["ymax"] + 0.001, tres)  # south -> north rows
    px, py = local_grid_to_pixels(gx, gy, it["bbox3857"], dem.shape[1], dem.shape[0])
    z = bilinear(np.where(valid, dem, np.nan), px, py)
    datum = float(np.floor(np.nanmin(z)))
    cm = np.where(np.isfinite(z), np.round((z - datum) * 100), -32768).astype("<i2")
    cm.tofile(os.path.join(OUT, "terrain.bin"))
    meta = {
        "id": "field.elevation",
        "file": "terrain.bin",
        "encoding": "int16-le centimetres above datumZ; -32768 = unknown",
        "datumZ": datum,
        "verticalDatum": "NAVD88 (USGS 3DEP)",
        "origin": [EXTENT["xmin"], EXTENT["ymin"]],
        "cellSize": tres,
        "cols": int(len(gx)),
        "rows": int(len(gy)),
        "rowOrder": "south-to-north",
        "zMin": round(float(np.nanmin(z)), 3),
        "zMax": round(float(np.nanmax(z)), 3),
        "sourceResolutionM": 1.0,
        "unknownCells": int((~np.isfinite(z)).sum()),
    }
    json.dump(meta, open(os.path.join(OUT, "terrain.json"), "w"), indent=1)
    print("ortho", img.shape, "terrain", meta["cols"], meta["rows"], meta["zMin"], meta["zMax"])


if __name__ == "__main__":
    main()

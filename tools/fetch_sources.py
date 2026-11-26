"""Fetch the public, openly licensed spatial sources for the Detroit model.

Writes into sources/raw/ (all redistributable):
  osm_map.json      OpenStreetMap API 0.6 map call (ODbL 1.0, (c) OpenStreetMap contributors)
  naip_3857.png     USGS NAIP Imagery (The National Map) - US public domain
  dem_3857.tif      USGS 3DEP elevation, float32 metres NAVD88 - US public domain
  fetch_log.json    URLs, request bboxes, timestamps

Official Oudolf Garden Detroit drawings / photos are NOT fetched here; they are
copyrighted and live only in private-inputs/ (git-ignored).

Usage: python3 -I tools/fetch_sources.py
"""
import json, os, sys, time, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(__file__))
from geo import EXTENT, to_latlon, merc

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "sources", "raw")
UA = "generative-planting-research/0.1 (static research model)"


def get(url, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    os.makedirs(RAW, exist_ok=True)
    log = {"accessed": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "items": []}
    pad = 10.0
    lat_s, lon_w = to_latlon(EXTENT["xmin"] - pad, EXTENT["ymin"] - pad)
    lat_n, lon_e = to_latlon(EXTENT["xmax"] + pad, EXTENT["ymax"] + pad)

    # OSM
    url = f"https://api.openstreetmap.org/api/0.6/map.json?bbox={lon_w:.6f},{lat_s:.6f},{lon_e:.6f},{lat_n:.6f}"
    open(os.path.join(RAW, "osm_map.json"), "wb").write(get(url))
    log["items"].append({"file": "osm_map.json", "url": url, "license": "ODbL-1.0", "attribution": "(c) OpenStreetMap contributors"})

    # Web-Mercator bbox for raster services
    x0, y0 = merc(lat_s, lon_w)
    x1, y1 = merc(lat_n, lon_e)
    bbox = f"{x0:.3f},{y0:.3f},{x1:.3f},{y1:.3f}"
    wm = x1 - x0
    hm = y1 - y0
    # NAIP ~0.6 m native; request ~0.4 m (in mercator units / 1.352 scale)
    nw = 1400
    nh = int(round(nw * hm / wm))
    q = urllib.parse.urlencode({"bbox": bbox, "bboxSR": 3857, "imageSR": 3857, "size": f"{nw},{nh}",
                                "format": "png", "f": "image"})
    url = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?" + q
    open(os.path.join(RAW, "naip_3857.png"), "wb").write(get(url))
    log["items"].append({"file": "naip_3857.png", "url": url, "bbox3857": [x0, y0, x1, y1], "size": [nw, nh],
                         "license": "US public domain (USGS/USDA)", "attribution": "USGS, USDA, The National Map: Orthoimagery"})

    # 3DEP DEM ~1 m
    dw = 520
    dh = int(round(dw * hm / wm))
    q = urllib.parse.urlencode({"bbox": bbox, "bboxSR": 3857, "imageSR": 3857, "size": f"{dw},{dh}",
                                "format": "tiff", "pixelType": "F32", "interpolation": "RSP_BilinearInterpolation",
                                "f": "image"})
    url = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?" + q
    open(os.path.join(RAW, "dem_3857.tif"), "wb").write(get(url))
    log["items"].append({"file": "dem_3857.tif", "url": url, "bbox3857": [x0, y0, x1, y1], "size": [dw, dh],
                         "license": "US public domain (USGS 3DEP)", "attribution": "USGS 3D Elevation Program",
                         "units": "metres, NAVD88"})
    # service metadata for the register
    try:
        meta = json.loads(get("https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer?f=json"))
        log["dem_service"] = {"name": meta.get("name"), "pixelSizeX": meta.get("pixelSizeX"),
                              "copyright": meta.get("copyrightText")}
    except Exception as e:  # noqa
        log["dem_service"] = {"error": str(e)}
    json.dump(log, open(os.path.join(RAW, "fetch_log.json"), "w"), indent=2)
    print("fetched", [i["file"] for i in log["items"]])


if __name__ == "__main__":
    main()

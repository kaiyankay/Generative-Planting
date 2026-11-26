"""Local metric frame for the Oudolf Garden Detroit model.

Frame "OGD-LOCAL-2026": a local east/north tangent plane, metres.
  origin  = WGS84 lat 42.3357458, lon -82.9886728 (OSM way 882942799 point,
            near the centre of the Main Garden)
  +x      = true east, +y = true north, z = NAVD88 metres (USGS 3DEP)
Projection: equirectangular about the origin using WGS84 meridional and
prime-vertical radii of curvature. Over the 360 m x 260 m model extent the
distortion against a proper conformal projection is < 2 cm.
"""
import math

LAT0 = 42.3357458
LON0 = -82.9886728
A = 6378137.0
F = 1 / 298.257223563
E2 = F * (2 - F)

_phi = math.radians(LAT0)
_w = math.sqrt(1 - E2 * math.sin(_phi) ** 2)
M = A * (1 - E2) / _w ** 3          # meridional radius
N = A / _w                           # prime vertical radius
KX = N * math.cos(_phi) * math.pi / 180   # metres per degree lon
KY = M * math.pi / 180                     # metres per degree lat

R_MERC = 6378137.0


def to_local(lat, lon):
    return ((lon - LON0) * KX, (lat - LAT0) * KY)


def to_latlon(x, y):
    return (LAT0 + y / KY, LON0 + x / KX)


def merc(lat, lon):
    x = R_MERC * math.radians(lon)
    y = R_MERC * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
    return x, y


# Model extent (local metres)
EXTENT = {"xmin": -200.0, "xmax": 160.0, "ymin": -150.0, "ymax": 110.0}

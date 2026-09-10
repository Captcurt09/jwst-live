"""JWST Live — serve the site and proxy ESA/Webb image feeds."""

from __future__ import annotations

import csv
import io
import json
import math
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = 8000
ROOT = Path(__file__).resolve().parent
CACHE_TTL_S = 300
TRACKER_CACHE_TTL_S = 90
AU_KM = 149597870.7
C_KM_S = 299792.458
JWST_LAUNCH = datetime(2021, 12, 25, 12, 20, tzinfo=timezone.utc)
HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
ESA_FEED = "https://esawebb.org/images/feed/"
NASA_SEARCH = (
    "https://images-api.nasa.gov/search"
    "?q=James+Webb+Space+Telescope"
    "&media_type=image"
    "&year_start=2025"
    "&page_size=24"
)
USER_AGENT = "JWST-Live/1.0 (local educational site)"
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")

_cache_lock = threading.Lock()
_cache: dict = {"payload": None, "expires": 0.0}
_tracker_cache: dict = {"payload": None, "expires": 0.0}

MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}

CONSTELLATIONS = {
    "And": "Andromeda", "Ant": "Antlia", "Aps": "Apus", "Aqr": "Aquarius",
    "Aql": "Aquila", "Ara": "Ara", "Ari": "Aries", "Aur": "Auriga",
    "Boo": "Bootes", "Cae": "Caelum", "Cam": "Camelopardalis", "Cnc": "Cancer",
    "CVn": "Canes Venatici", "CMa": "Canis Major", "CMi": "Canis Minor",
    "Cap": "Capricornus", "Car": "Carina", "Cas": "Cassiopeia", "Cen": "Centaurus",
    "Cep": "Cepheus", "Cet": "Cetus", "Cha": "Chamaeleon", "Cir": "Circinus",
    "Col": "Columba", "Com": "Coma Berenices", "CrA": "Corona Australis",
    "CrB": "Corona Borealis", "Crv": "Corvus", "Crt": "Crater", "Cru": "Crux",
    "Cyg": "Cygnus", "Del": "Delphinus", "Dor": "Dorado", "Dra": "Draco",
    "Equ": "Equuleus", "Eri": "Eridanus", "For": "Fornax", "Gem": "Gemini",
    "Gru": "Grus", "Her": "Hercules", "Hor": "Horologium", "Hya": "Hydra",
    "Hyi": "Hydrus", "Ind": "Indus", "Lac": "Lacerta", "Leo": "Leo",
    "LMi": "Leo Minor", "Lep": "Lepus", "Lib": "Libra", "Lup": "Lupus",
    "Lyn": "Lynx", "Lyr": "Lyra", "Men": "Mensa", "Mic": "Microscopium",
    "Mon": "Monoceros", "Mus": "Musca", "Nor": "Norma", "Oct": "Octans",
    "Oph": "Ophiuchus", "Ori": "Orion", "Pav": "Pavo", "Peg": "Pegasus",
    "Per": "Perseus", "Phe": "Phoenix", "Pic": "Pictor", "Psc": "Pisces",
    "PsA": "Pisces Austrinus", "Pup": "Puppis", "Pyx": "Pyxis", "Ret": "Reticulum",
    "Sge": "Sagitta", "Sgr": "Sagittarius", "Sco": "Scorpius", "Scl": "Sculptor",
    "Sct": "Scutum", "Ser": "Serpens", "Sex": "Sextans", "Tau": "Taurus",
    "Tel": "Telescopium", "Tri": "Triangulum", "TrA": "Triangulum Australe",
    "Tuc": "Tucana", "UMa": "Ursa Major", "UMi": "Ursa Minor", "Vel": "Vela",
    "Vir": "Virgo", "Vol": "Volans", "Vul": "Vulpecula",
}


def fetch_url(url: str, timeout: int = 20) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def strip_html(value: str) -> str:
    text = TAG_RE.sub(" ", unescape(value or ""))
    return WS_RE.sub(" ", text).strip()


def format_date(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.strftime("%b %d, %Y")


def parse_esa_rss(raw: bytes) -> list[dict]:
    root = ET.fromstring(raw)
    items = []
    for item in root.findall("./channel/item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub_date = item.findtext("pubDate") or ""
        description = strip_html(item.findtext("description") or "")
        enclosure = item.find("enclosure")
        image = enclosure.get("url") if enclosure is not None else ""
        if not image:
            continue
        large = image.replace("/screen/", "/large/").replace("/news/", "/large/")
        items.append(
            {
                "title": title,
                "link": link,
                "date": format_date(pub_date),
                "description": description,
                "image": image,
                "large": large,
                "source": "ESA/Webb",
            }
        )
    return items


def parse_nasa_search(raw: bytes) -> list[dict]:
    data = json.loads(raw.decode("utf-8"))
    items = []
    for entry in data.get("collection", {}).get("items", []):
        meta = (entry.get("data") or [{}])[0]
        links = entry.get("links") or []
        thumb = ""
        for link in links:
            if link.get("render") == "image":
                thumb = link.get("href") or ""
                break
        if not thumb:
            continue
        large = thumb.replace("~thumb", "~large").replace("thumb.jpg", "large.jpg")
        items.append(
            {
                "title": meta.get("title") or "James Webb Space Telescope",
                "link": f"https://images.nasa.gov/details/{meta.get('nasa_id', '')}",
                "date": format_date(meta.get("date_created") or ""),
                "description": strip_html(meta.get("description") or ""),
                "image": thumb,
                "large": large,
                "source": "NASA Images",
            }
        )
    return items


def load_images() -> dict:
    now = time.time()
    with _cache_lock:
        if _cache["payload"] and now < _cache["expires"]:
            return _cache["payload"]

    source = "esa"
    items: list[dict] = []
    error = None
    try:
        items = parse_esa_rss(fetch_url(ESA_FEED))
    except (urllib.error.URLError, TimeoutError, ET.ParseError, OSError) as exc:
        error = str(exc)
        source = "nasa"
        try:
            items = parse_nasa_search(fetch_url(NASA_SEARCH))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as nasa_exc:
            error = f"ESA: {error}; NASA: {nasa_exc}"
            items = []

    payload = {
        "source": source if items else "none",
        "items": items[:24],
        "error": None if items else error,
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    with _cache_lock:
        _cache["payload"] = payload
        _cache["expires"] = time.time() + CACHE_TTL_S
    return payload


def parse_horizons_datetime(text: str) -> datetime:
    cleaned = text.replace("A.D.", "").strip().split(".")[0].strip()
    date_part, time_part = cleaned.split()
    year, month_name, day = date_part.split("-")
    bits = [int(float(part)) for part in time_part.split(":")]
    while len(bits) < 3:
        bits.append(0)
    return datetime(
        int(year),
        MONTHS[month_name],
        int(day),
        bits[0],
        bits[1],
        bits[2],
        tzinfo=timezone.utc,
    )


def format_ra(degrees: float) -> str:
    hours = degrees / 15.0 % 24
    hour = int(hours)
    minutes_full = (hours - hour) * 60
    minute = int(minutes_full)
    second = (minutes_full - minute) * 60
    return f"{hour:02d}h {minute:02d}m {second:04.1f}s"


def format_dec(degrees: float) -> str:
    sign = "+" if degrees >= 0 else "-"
    abs_deg = abs(degrees)
    deg = int(abs_deg)
    minutes_full = (abs_deg - deg) * 60
    minute = int(minutes_full)
    second = (minutes_full - minute) * 60
    return f"{sign}{deg:02d}° {minute:02d}' {second:04.1f}\""


def vector_distance(point: dict) -> float:
    return math.sqrt(point["x"] ** 2 + point["y"] ** 2 + point["z"] ** 2)


def extract_table(result: str) -> list[list[str]]:
    start = result.find("$$SOE")
    end = result.find("$$EOE")
    if start < 0 or end < 0:
        raise ValueError("Horizons returned no ephemeris table")
    block = result[start + 5 : end].strip()
    rows = []
    for line in csv.reader(io.StringIO(block), skipinitialspace=True):
        if line:
            rows.append([cell.strip() for cell in line])
    if not rows:
        raise ValueError("Horizons ephemeris table was empty")
    return rows


def horizons_query(params: dict) -> str:
    url = HORIZONS_URL + "?" + urllib.parse.urlencode(params)
    data = json.loads(fetch_url(url, timeout=30).decode("utf-8"))
    if data.get("error"):
        raise RuntimeError(str(data["error"]))
    result = data.get("result") or ""
    if "$$SOE" not in result:
        raise RuntimeError("Horizons did not return ephemeris data")
    return result


def fetch_observer(now: datetime) -> dict:
    start = now.strftime("%Y-%m-%d %H:%M")
    stop = (now + timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M")
    result = horizons_query(
        {
            "format": "json",
            "COMMAND": "'-170'",
            "OBJ_DATA": "NO",
            "MAKE_EPHEM": "YES",
            "EPHEM_TYPE": "OBSERVER",
            "CENTER": "'500@399'",
            "START_TIME": f"'{start}'",
            "STOP_TIME": f"'{stop}'",
            "STEP_SIZE": "'1 m'",
            "QUANTITIES": "'1,20,23,29'",
            "ANG_FORMAT": "DEG",
            "CSV_FORMAT": "YES",
        }
    )
    row = extract_table(result)[0]
    ra = float(row[3])
    dec = float(row[4])
    range_au = float(row[5])
    range_rate = float(row[6])
    elongation = float(row[7])
    abbrev = row[9]
    range_km = range_au * AU_KM
    return {
        "epoch": parse_horizons_datetime(row[0]).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "ra_deg": ra,
        "dec_deg": dec,
        "ra": format_ra(ra),
        "dec": format_dec(dec),
        "earth_km": range_km,
        "range_rate_kms": range_rate,
        "elongation_deg": elongation,
        "constellation": CONSTELLATIONS.get(abbrev, abbrev),
        "constellation_abbrev": abbrev,
        "light_time_s": range_km / C_KM_S,
    }


def parse_vectors(result: str) -> list[dict]:
    points = []
    for row in extract_table(result):
        points.append(
            {
                "epoch": parse_horizons_datetime(row[1]).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "x": float(row[2]),
                "y": float(row[3]),
                "z": float(row[4]),
            }
        )
    return points


def fetch_l2_path(now: datetime) -> list[dict]:
    start = (now - timedelta(days=80)).strftime("%Y-%m-%d")
    stop = (now + timedelta(days=2)).strftime("%Y-%m-%d")
    result = horizons_query(
        {
            "format": "json",
            "COMMAND": "'-170'",
            "OBJ_DATA": "NO",
            "MAKE_EPHEM": "YES",
            "EPHEM_TYPE": "VECTORS",
            "CENTER": "'@32'",
            "START_TIME": f"'{start}'",
            "STOP_TIME": f"'{stop}'",
            "STEP_SIZE": "'2 d'",
            "VEC_TABLE": "1",
            "REF_PLANE": "ECLIPTIC",
            "OUT_UNITS": "KM-S",
            "CSV_FORMAT": "YES",
        }
    )
    return parse_vectors(result)


def fetch_earth_from_l2(now: datetime) -> dict:
    start = now.strftime("%Y-%m-%d %H:%M")
    stop = (now + timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M")
    result = horizons_query(
        {
            "format": "json",
            "COMMAND": "'399'",
            "OBJ_DATA": "NO",
            "MAKE_EPHEM": "YES",
            "EPHEM_TYPE": "VECTORS",
            "CENTER": "'@32'",
            "START_TIME": f"'{start}'",
            "STOP_TIME": f"'{stop}'",
            "STEP_SIZE": "'1 m'",
            "VEC_TABLE": "1",
            "REF_PLANE": "ECLIPTIC",
            "OUT_UNITS": "KM-S",
            "CSV_FORMAT": "YES",
        }
    )
    return parse_vectors(result)[0]


def load_tracker() -> dict:
    now_ts = time.time()
    with _cache_lock:
        if _tracker_cache["payload"] and now_ts < _tracker_cache["expires"]:
            return _tracker_cache["payload"]

    now = datetime.now(timezone.utc)
    try:
        observer = fetch_observer(now)
        path = fetch_l2_path(now)
        earth = fetch_earth_from_l2(now)
        current = min(
            path,
            key=lambda point: abs(
                (
                    datetime.fromisoformat(point["epoch"].replace("Z", "+00:00"))
                    - now
                ).total_seconds()
            ),
        )
        payload = {
            "ok": True,
            "error": None,
            "source": "NASA JPL Horizons",
            "updated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "days_in_space": (now - JWST_LAUNCH).days,
            "observer": observer,
            "l2_km": vector_distance(current),
            "current": current,
            "earth_from_l2": earth,
            "path": path,
        }
    except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError, OSError, json.JSONDecodeError, KeyError, IndexError) as exc:
        payload = {"ok": False, "error": str(exc), "path": []}

    with _cache_lock:
        _tracker_cache["payload"] = payload
        _tracker_cache["expires"] = time.time() + TRACKER_CACHE_TTL_S
    return payload


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/images":
            payload = load_images()
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200 if payload["items"] else 502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "public, max-age=60")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/tracker":
            payload = load_tracker()
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200 if payload.get("ok") else 502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "public, max-age=30")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def log_message(self, format, *args):
        print("[%s] %s" % (self.log_date_time_string(), format % args))


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"JWST Live running at http://127.0.0.1:{PORT}", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")
        server.server_close()


if __name__ == "__main__":
    main()

"""
GET /api/fetch?url=<TikTok, Instagram or YouTube link>

Downloads one video on the server with yt-dlp (same quality rules as the Mac
app: biggest resolution, never TikTok's watermarked copy, merged to mp4) and
streams the file back as a download. Details about the clip ride along in the
X-Meta header so the page can label it.
"""

import json
import os
import re
import tempfile
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

ALLOWED = re.compile(
    r"^https?://(?:(?:www|m|vm|vt)\.)?(?:tiktok\.com|instagram\.com|youtube\.com|youtu\.be)/", re.I)
MAX_BYTES = 400 * 1024 * 1024
CHUNK = 1024 * 1024


def tidy_error(text: str) -> str:
    low = (text or "").lower()
    if "photo" in low or "no video formats" in low:
        return "Photo post, not a video"
    if "login" in low or "sign in" in low or "log in" in low or "not a bot" in low:
        return "This site asked for a login, so it can't be fetched here. Try the Mac app."
    if "not available" in low or "404" in low or "private" in low or "unavailable" in low:
        return "Video unavailable (deleted, private, or blocked)"
    if "max-filesize" in low or "larger than" in low or "too large" in low:
        return "Too big to download here. Try the Mac app."
    if "429" in low or "rate" in low:
        return "The site slowed us down. Try again in a minute."
    if "unsupported url" in low or "unable to extract" in low:
        return "Link not recognised as a video"
    msg = re.sub(r"^ERROR:\s*(\[[^]]+\]\s*)?", "", (text or "").strip().splitlines()[-1] if text else "")
    return (msg.split(";")[0] or "Couldn't download this one")[:140]


def download(url: str, workdir: str) -> dict:
    import imageio_ffmpeg
    import yt_dlp

    class Quiet:
        def __init__(self):
            self.errors = []
        def debug(self, msg): pass
        def info(self, msg): pass
        def warning(self, msg): pass
        def error(self, msg): self.errors.append(msg)

    log = Quiet()
    opts = {
        "format": "bv*[format_id!=download]+ba/b[format_id!=download]/bv*+ba/b",
        "format_sort": ["res", "vcodec:h264", "br"],
        "merge_output_format": "mp4",
        "outtmpl": os.path.join(workdir, "%(uploader|clip)s - %(id)s.%(ext)s"),
        "trim_file_name": 120,
        "ffmpeg_location": imageio_ffmpeg.get_ffmpeg_exe(),
        "noplaylist": True,
        "max_filesize": MAX_BYTES,
        "cachedir": False,
        "retries": 3,
        "logger": log,
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except Exception as e:  # yt-dlp raises DownloadError with the message
        raise ValueError(tidy_error(str(e) or "\n".join(log.errors)))
    files = [Path(d["filepath"]) for d in info.get("requested_downloads") or [] if d.get("filepath")]
    files = [f for f in files if f.exists()] or [p for p in Path(workdir).iterdir() if p.is_file()]
    if not files:
        raise ValueError(tidy_error("\n".join(log.errors)) if log.errors else "Couldn't download this one")
    path = max(files, key=lambda p: p.stat().st_size)
    return {
        "path": path,
        "meta": {
            "creator": info.get("uploader") or info.get("channel") or "",
            "title": (info.get("title") or "")[:90],
            "thumb": info.get("thumbnail") or "",
            "res": f"{info.get('width')}x{info.get('height')}" if info.get("height") else "",
            "site": info.get("extractor_key") or "",
        },
    }


class handler(BaseHTTPRequestHandler):
    def send_json(self, obj, code):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = (parse_qs(urlparse(self.path).query).get("url") or [""])[0].strip()
        if not ALLOWED.match(url):
            return self.send_json({"error": "Only TikTok, Instagram and YouTube links work here."}, 400)
        with tempfile.TemporaryDirectory(dir="/tmp" if os.path.isdir("/tmp") else None) as workdir:
            try:
                got = download(url, workdir)
            except ValueError as e:
                return self.send_json({"error": str(e)}, 422)
            except Exception:
                return self.send_json({"error": "Couldn't download this one"}, 500)
            path = got["path"]
            size = path.stat().st_size
            name = path.name
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4" if name.endswith(".mp4") else "application/octet-stream")
            self.send_header("Content-Length", str(size))
            self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(name)}")
            self.send_header("X-Meta", quote(json.dumps({**got["meta"], "name": name, "size": size})))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with open(path, "rb") as f:
                while True:
                    chunk = f.read(CHUNK)
                    if not chunk:
                        break
                    self.wfile.write(chunk)

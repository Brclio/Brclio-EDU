"""Read-only, exact-URL classroom fixtures; never performs a network request."""
from __future__ import annotations
from email.message import Message
from io import BytesIO
import json
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request
from urllib.response import addinfourl

ROOT = Path("/opt/fixtures")
MAX_FIXTURE = 8 * 1024 * 1024
try:
    INDEX = json.loads((ROOT / "fixture-map.json").read_text(encoding="utf-8"))
except (OSError, ValueError):
    INDEX = {}


def fixture(url: str, method: str = "GET") -> tuple[bytes, Message]:
    if method.upper() not in ("GET", "HEAD") or not isinstance(url, str):
        raise URLError("Only archived GET/HEAD classroom URLs are available in the offline sandbox.")
    entry = INDEX.get(url)
    if not isinstance(entry, dict):
        raise URLError("This URL has no archived classroom fixture; external networking is disabled.")
    name = entry.get("path", "")
    if not isinstance(name, str) or not name.startswith("/content/"):
        raise URLError("Invalid archived fixture path.")
    target = (ROOT / name.removeprefix("/")).resolve()
    root = ROOT.resolve()
    if root not in target.parents or not target.is_file() or target.stat().st_size > MAX_FIXTURE:
        raise URLError("Archived fixture is unavailable or exceeds the sandbox size limit.")
    try:
        body = target.read_bytes()
    except OSError as error:
        raise URLError("Archived fixture is unavailable.") from error
    headers = Message()
    headers["Content-Type"] = entry.get("contentType", "text/html; charset=utf-8")
    headers["Content-Length"] = str(len(body))
    headers["X-Brclio-Fixture"] = "adapted" if entry.get("adapted") else "archived"
    return (b"" if method.upper() == "HEAD" else body), headers


def urllib_open(_self, fullurl, data=None, timeout=None):
    url = fullurl.full_url if isinstance(fullurl, Request) else fullurl
    method = fullurl.get_method() if isinstance(fullurl, Request) else "POST" if data is not None else "GET"
    body, headers = fixture(url, method)
    return addinfourl(BytesIO(body), headers, url, 200)


def install():
    import urllib.request
    urllib.request.OpenerDirector.open = urllib_open
    try:
        import requests
    except ImportError:
        return
    # Requests normalizes URL escaping before Session.send. Register only the
    # canonical representation of already archived URLs, never an origin wildcard.
    for url, value in list(INDEX.items()):
        if url.startswith(("http://", "https://")):
            prepared = requests.PreparedRequest()
            prepared.prepare_url(url, None)
            INDEX.setdefault(prepared.url, value)

    def send(_self, prepared, **_kwargs):
        try:
            body, headers = fixture(prepared.url, prepared.method)
        except URLError as error:
            raise requests.exceptions.ConnectionError(str(error)) from error
        response = requests.Response()
        response.status_code = 200
        response.url = prepared.url
        response.request = prepared
        response.headers = requests.structures.CaseInsensitiveDict(headers.items())
        response.encoding = requests.utils.get_encoding_from_headers(response.headers) or "utf-8"
        response._content = body
        response._content_consumed = True
        response.raw = BytesIO(body)
        return response
    requests.sessions.Session.send = send

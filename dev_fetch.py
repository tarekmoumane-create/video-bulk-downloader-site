# Local stand-in for the /api/fetch Python function (used by dev.mjs).
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "api"))
from fetch import handler  # noqa: E402
print("fetch on http://127.0.0.1:4322", flush=True)
ThreadingHTTPServer(("127.0.0.1", 4322), handler).serve_forever()

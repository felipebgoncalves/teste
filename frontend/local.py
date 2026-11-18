"""Serve o build Angular e a mesma API Python usada na Vercel."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from api.chuva import chuva_response, write_json


FRONTEND = Path(__file__).resolve().parent


class LocalHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if urlsplit(self.path).path == "/api/chuva":
            write_json(self, *chuva_response())
            return
        return super().do_GET()


if __name__ == "__main__":
    static_files = FRONTEND / "dist" / "frontend" / "browser"
    ThreadingHTTPServer(
        ("127.0.0.1", 4200), partial(LocalHandler, directory=str(static_files))
    ).serve_forever()
